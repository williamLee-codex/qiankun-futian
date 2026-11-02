import { measureFarmV2Stage } from './farm-v2-stage-timing';
import { getVercelOidcToken } from '@vercel/oidc';

// Only the configured platform may receive this deployment's runtime identity.
export async function farmV2PlatformFetch(url: URL, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.delete('x-vercel-trusted-oidc-idp-token');
  if (process.env.VERCEL_ENV === 'preview') {
    const configured = new URL(process.env.PLATFORM_BASE_URL ?? '');
    if (url.origin !== configured.origin || url.protocol !== 'https:' ||
        url.username || url.password || !url.pathname.startsWith('/api/replit/')) {
      throw new Error('INVALID_FARM_PLATFORM_IDENTITY_TARGET');
    }
    headers.set('x-vercel-trusted-oidc-idp-token', await getVercelOidcToken());
  }
  const stage = ['/api/replit/launch/validate', '/api/replit/farm-v2/identity'].includes(url.pathname) ? 'platform_validate'
    : url.pathname.includes('/wallet') ? 'platform_wallet' : 'platform_other';
  return measureFarmV2Stage(stage, () => fetch(url, { ...init, headers: Object.fromEntries(headers), redirect: 'error' }));
}
