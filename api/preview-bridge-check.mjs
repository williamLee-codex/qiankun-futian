// Temporary isolated Preview acceptance; no player/session creation.
import { getVercelOidcToken } from '@vercel/oidc';
import { randomBytes } from 'node:crypto';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.VERCEL_ENV !== 'preview' || process.env.FARM_V2_ENTRY_ENABLED !== '0' || process.env.FARM_V2_ATOMIC_POT_ENABLED !== '0') return res.status(404).json({status:'disabled'});
  if (req.method !== 'GET') return res.status(405).json({status:'method_not_allowed'});
  try {
    const origin = new URL(process.env.PLATFORM_BASE_URL);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('INVALID_ORIGIN');
    const response = await fetch(new URL('/api/replit/farm-v2/session', origin), {
      method:'POST', redirect:'error', cache:'no-store', signal:AbortSignal.timeout(10000),
      headers:{'content-type':'application/json','x-replit-shared-secret':process.env.REPLIT_APP_SHARED_SECRET,'x-vercel-trusted-oidc-idp-token':await getVercelOidcToken()},
      body:JSON.stringify({action:'revoke',launchToken:'fvs1.'+randomBytes(32).toString('base64url')})
    });
    const body=await response.json().catch(()=>null);
    const accepted=response.status===401&&body?.error==='FARM_SESSION_NOT_ACTIVE';
    return res.status(accepted?200:503).json({status:accepted?'pass':'not_ready',callback:accepted,authorityStatus:response.status});
  } catch { return res.status(503).json({status:'not_ready',callback:false}); }
}
