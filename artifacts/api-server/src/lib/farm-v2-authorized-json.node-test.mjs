import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFarmV2AuthorizedJson } from './farm-v2-authorized-json.ts';

function response(events) {
  const res = { json(body) { events.push(['response', body]); return res; } };
  return res;
}
test('does not publish JSON until authority cleanup completes', async () => {
  const events = []; const res = response(events); const original = res.json;
  let release; const gate = new Promise(r => { release = r; });
  const work = runFarmV2AuthorizedJson(res, e => events.push(['next', e]), async () => {
    res.json({ lands: [1] });
    events.push(['cleanup-start']);
    await gate;
    events.push(['cleanup-complete']);
  });
  await Promise.resolve();
  assert.deepEqual(events, [['cleanup-start']]);
  release(); await work;
  assert.deepEqual(events, [['cleanup-start'], ['cleanup-complete'], ['response', { lands: [1] }]]);
  assert.equal(res.json, original);
});
test('cleanup failure never publishes a buffered success', async () => {
  const events = []; const res = response(events); const original = res.json;
  const failure = new Error('AUTHORITY_END_FAILED');
  await runFarmV2AuthorizedJson(res, e => events.push(['next', e]), async () => {
    res.json({ ok: true }); throw failure;
  });
  assert.deepEqual(events, [['next', failure]]);
  assert.equal(res.json, original);
});
test('route errors reach error middleware only after cleanup', async () => {
  const events = []; const res = response(events); const failure = new Error('DOMAIN_FAILED');
  await runFarmV2AuthorizedJson(res, e => events.push(['next', e]), async next => {
    next(failure); events.push(['cleanup-complete']);
  });
  assert.deepEqual(events, [['cleanup-complete'], ['next', failure]]);
});
test('an operation rejection restores the response writer', async () => {
  const events = []; const res = response(events); const original = res.json;
  const failure = new Error('LOCK_TIMEOUT');
  await runFarmV2AuthorizedJson(res, e => events.push(['next', e]), async () => { throw failure; });
  assert.deepEqual(events, [['next', failure]]);
  assert.equal(res.json, original);
});
