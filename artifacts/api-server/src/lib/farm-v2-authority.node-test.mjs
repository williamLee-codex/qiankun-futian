import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('./farm-v2-authority.ts', import.meta.url), 'utf8');
function runScenario(options = {}) {
  const { primary, cleanup, beginStatus, transportFailure, lockFailure, registerFailure } = options;
  const hasPrimary = Object.hasOwn(options, 'primary');
  const events = [];
  const logs = [];
  const client = { on() {}, query: async () => { events.push('lock'); if (lockFailure) throw lockFailure; }, release: x => events.push(['release', x]) };
  const pool = { query: async sql => {
    if (sql.startsWith('insert')) { events.push('register'); if (registerFailure) throw registerFailure; }
    else if (sql.includes("state='SETTLED'")) { events.push('settle'); if (cleanup) throw cleanup; }
    else events.push('core-settled');
    return {};
  }};
  const mocks = {
    './farm-v2-stage-timing': { measureFarmV2Stage: (_stage, fn) => fn() },
    './farm-v2-platform-fetch': { farmV2PlatformFetch: async (_url, init) => {
      const data = JSON.parse(init.body); events.push(data.phase);
      if (transportFailure && data.phase === 'begin') throw transportFailure;
      return { ok: !(data.phase === 'begin' && beginStatus), status: data.phase === 'begin' && beginStatus ? beginStatus : 200, json: async () => data.phase === 'begin'
        ? { operationId: data.operationId, effectivePaidCrystals: 0 } : { settled: true } };
    }},
    'node:crypto': { randomUUID: () => 'b3e51e88-8c8c-4f44-a64b-3a8175b6aa10' },
    '@workspace/db': { pool, createDatabaseConnection: () => ({ pool: { connect: async () => client } }) },
    './farm-v2-platform': { farmV2PlatformConnection: () => ({ base: 'https://example.invalid', secret: 'mock' }) },
    './farm-v2-authority-context': { farmAuthorityContext: { run: (_context, fn) => fn() } },
  };
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, require: name => {
    if (!(name in mocks)) throw Error('Unexpected dependency: ' + name);
    return mocks[name];
  }, URL, AbortSignal, JSON, console: { error: line => logs.push(JSON.parse(line)) } });
  const input = { userId: 'test-user', launchToken: 'test-token', requestId: 'test-request', action: 'GET:/farm/v2/state' };
  return { events, logs, invoke: () => module.exports.withFarmAuthority(input, async () => {
    events.push('domain'); if (hasPrimary) throw primary;
    return { ok: true };
  }) };
}
test('primary failure survives a simultaneous cleanup failure', async () => {
  const original = Error('FARM_PAID_AUTHORITY_UNAVAILABLE');
  const { events, invoke } = runScenario({ primary: original, cleanup: Error('cleanup') });
  await assert.rejects(invoke(), e => e === original);
  assert.deepEqual(events.at(-1), ['release', true]);
});
test('cleanup-only failure propagates', async () => {
  const failure = Error('cleanup');
  const { events, invoke } = runScenario({ cleanup: failure });
  await assert.rejects(invoke(), e => e === failure);
  assert.deepEqual(events.at(-1), ['release', true]);
});
test('success waits for Core settlement and destroys the lock session', async () => {
  const { events, invoke } = runScenario();
  assert.deepEqual(await invoke(), { ok: true });
  assert.deepEqual(events, ['lock','register','begin','domain','settle','end','core-settled',['release',true]]);
});
test('null primary rejection is not masked by cleanup error', async () => {
  const { events, invoke } = runScenario({ primary: null, cleanup: Error('cleanup') });
  await assert.rejects(invoke(), e => e === null);
  assert.deepEqual(events.at(-1), ['release', true]);
});

test('simultaneous cleanup failure emits only sanitized diagnostic metadata', async () => {
  const primary = Error('FARM_PAID_AUTHORITY_UNAVAILABLE');
  const cleanup = Object.assign(Error('private-password and token must not appear'), { code: '55P03' });
  const { logs, invoke } = runScenario({ primary, cleanup });
  await assert.rejects(invoke(), e => e === primary);
  assert.equal(logs.length, 1);
  assert.deepEqual(Object.keys(logs[0]).sort(), ['code', 'sqlstate', 'traceId']);
  assert.equal(logs[0].code, 'FARM_AUTHORITY_CLEANUP_FAILED');
  assert.equal(logs[0].sqlstate, '55P03');
  assert.equal(JSON.stringify(logs).includes('private-password'), false);
});

test('Core begin HTTP 503 preserves authority error while recording cleanup failure', async () => {
  const cleanup = Object.assign(Error('secret from database'), { code: '08006' });
  const { events, logs, invoke } = runScenario({ beginStatus: 503, cleanup });
  await assert.rejects(invoke(), e => e?.message === 'FARM_PAID_AUTHORITY_UNAVAILABLE');
  assert.deepEqual(events, ['lock', 'register', 'begin', 'settle', ['release', true]]);
  assert.equal(logs.length, 2);
  assert.deepEqual(logs[0], { code: 'FARM_AUTHORITY_CORE_HTTP_FAILURE', traceId: 'b3e51e88-8c8c-4f44-a64b-3a8175b6aa10', phase: 'begin', status: 503 });
  assert.equal(logs[1].code, 'FARM_AUTHORITY_CLEANUP_FAILED');
  assert.equal(logs[1].sqlstate, '08006');
  assert.equal(JSON.stringify(logs).includes('secret from database'), false);
});
test('Core begin HTTP 401 maps to session inactive and still closes authority barrier', async () => {
  const { events, logs, invoke } = runScenario({ beginStatus: 401 });
  await assert.rejects(invoke(), e => e?.message === 'FARM_SESSION_NOT_ACTIVE');
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], { code: 'FARM_AUTHORITY_CORE_HTTP_FAILURE', traceId: 'b3e51e88-8c8c-4f44-a64b-3a8175b6aa10', phase: 'begin', status: 401 });
  assert.deepEqual(events, ['lock', 'register', 'begin', 'settle', 'end', 'core-settled', ['release', true]]);
});

test('advisory lock failure does not register or call Core and releases client', async () => {
  const failure = Error('lock failed');
  const { events, invoke } = runScenario({ lockFailure: failure });
  await assert.rejects(invoke(), e => e === failure);
  assert.deepEqual(events, ['lock', ['release', true]]);
});
test('registration failure does not call Core and releases client', async () => {
  const failure = Error('register failed');
  const { events, invoke } = runScenario({ registerFailure: failure });
  await assert.rejects(invoke(), e => e === failure);
  assert.deepEqual(events, ['lock', 'register', ['release', true]]);
});

test('Core transport failure retains original exception and emits sanitized phase-only metadata', async () => {
  const transportFailure = Error('private upstream URL and token must not appear');
  const { events, logs, invoke } = runScenario({ transportFailure });
  await assert.rejects(invoke(), e => e === transportFailure);
  assert.deepEqual(events, ['lock', 'register', 'begin', 'settle', 'end', 'core-settled', ['release', true]]);
  assert.deepEqual(logs, [{
    code: 'FARM_AUTHORITY_CORE_TRANSPORT_FAILURE',
    traceId: 'b3e51e88-8c8c-4f44-a64b-3a8175b6aa10',
    phase: 'begin',
  }]);
  assert.equal(JSON.stringify(logs).includes('private upstream'), false);
});
