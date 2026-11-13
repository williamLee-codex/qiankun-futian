import { afterEach, expect, it, vi } from 'vitest';
import { farmV2PlatformFetch } from './farm-v2-platform-fetch';
import { requestFarmV2PlatformSession } from './farm-v2-platform';
vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: async () => 'test-runtime-identity' }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('attaches the runtime identity while preserving application authentication in Preview', async () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('FARM_V2_BRIDGE_SHARED_SECRET', '');
  vi.stubEnv('PLATFORM_BASE_URL', 'https://platform-test.vercel.app');
  vi.stubEnv('REPLIT_APP_SHARED_SECRET', 'test-application-secret');
  let sent: RequestInit | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    sent = init;
    return Response.json({ revoked: true });
  });
  await requestFarmV2PlatformSession('fvs1.' + 'a'.repeat(43), 'revoke');
  const headers = new Headers(sent?.headers);
  expect(headers.get('x-vercel-trusted-oidc-idp-token')).toBe('test-runtime-identity');
  expect(headers.get('x-replit-shared-secret')).toBe('test-application-secret');
  expect(sent?.redirect).toBe('error');
});

it('refuses to send identity to another origin', async () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('PLATFORM_BASE_URL', 'https://platform-test.vercel.app');
  await expect(farmV2PlatformFetch(new URL('https://other.vercel.app/api/replit/test'), {})).rejects.toThrow('INVALID_FARM_PLATFORM_IDENTITY_TARGET');
});
it('refuses to send identity outside the platform API', async () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('PLATFORM_BASE_URL', 'https://platform-test.vercel.app');
  await expect(farmV2PlatformFetch(new URL('https://platform-test.vercel.app/external'), {})).rejects.toThrow('INVALID_FARM_PLATFORM_IDENTITY_TARGET');
});
it('does not forward a supplied identity outside Preview', async () => {
  vi.stubEnv('VERCEL_ENV', 'production');
  let sent: RequestInit | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { sent = init; return Response.json({}); });
  await farmV2PlatformFetch(new URL('https://platform-test.vercel.app/api/replit/test'), { headers: { 'x-vercel-trusted-oidc-idp-token': 'untrusted' } });
  expect(new Headers(sent?.headers).has('x-vercel-trusted-oidc-idp-token')).toBe(false);
});
