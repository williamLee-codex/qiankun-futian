import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { requestFarmV2PlatformSession } from './farm-v2-platform';

// Real loopback HTTP exercises the production fetch adapter and Session wire
// contract. This fixture is not Google OAuth, Supabase, or a deployed platform.
let server: Server;
let base: string;
const seen: { header: string | undefined; legacy: string | undefined; action: string }[] = [];
const token = 'fvs1.' + 'H'.repeat(43);
beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    seen.push({ header: req.headers['x-farm-v2-shared-secret'] as string | undefined,
      legacy: req.headers['x-replit-shared-secret'] as string | undefined, action: input.action });
    res.setHeader('content-type', 'application/json');
    if (req.url !== '/api/replit/farm-v2/session' ||
        req.headers['x-farm-v2-shared-secret'] !== 'isolated-http-bridge' || input.launchToken === 'invalid') {
      res.statusCode = 401; res.end(JSON.stringify({ error: 'unauthorized' })); return;
    }
    res.end(JSON.stringify(input.action === 'revoke' ? { revoked: true } : {
      sessionToken: token, userId: 'http-fixture', appId: 'qiankun-futian',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubEnv('PLATFORM_BASE_URL', base);
  vi.stubEnv('REPLIT_APP_SHARED_SECRET', 'isolated-http-legacy');
  vi.stubEnv('FARM_V2_BRIDGE_SHARED_SECRET', 'isolated-http-bridge');
  vi.stubEnv('VERCEL_ENV', '');
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

it('exchanges and revokes over real HTTP using only the explicit Session bridge header', async () => {
  expect(await requestFarmV2PlatformSession('one-time-fixture', 'exchange')).toMatchObject({
    userId: 'http-fixture', sessionToken: token,
    reauthenticateUrl: `${base}/api/apps/qiankun-futian/launch?farmV2=1`,
  });
  expect(await requestFarmV2PlatformSession(token, 'revoke')).toEqual({ revoked: true });
  expect(seen).toEqual([
    { header: 'isolated-http-bridge', legacy: undefined, action: 'exchange' },
    { header: 'isolated-http-bridge', legacy: undefined, action: 'revoke' },
  ]);
});

it('rejects unauthorized HTTP exchange once without falling back to the legacy secret', async () => {
  const before = seen.length;
  await expect(requestFarmV2PlatformSession('invalid', 'exchange')).rejects.toThrow('FARM_SESSION_NOT_ACTIVE');
  expect(seen.length).toBe(before + 1);
  expect(seen.at(-1)?.legacy).toBeUndefined();
});
