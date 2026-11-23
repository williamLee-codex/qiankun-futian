import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@vercel/oidc',()=>({getVercelOidcToken:async()=> 'runtime-identity'}));
import handler from '../api/preview-bridge-check.mjs';
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
function response(){const out={code:0,body:null as unknown,headers:{} as Record<string,string>,setHeader(name:string,value:string){this.headers[name]=value;},status(code:number){this.code=code;return this;},json(body:unknown){this.body=body;return this;}};return out;}
// Pin every variable the handler reads: the deployment environment supplies
// FARM_V2_BRIDGE_SHARED_SECRET, which would otherwise change credential selection.
function configure(){vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('FARM_V2_ENTRY_ENABLED','0');vi.stubEnv('FARM_V2_ATOMIC_POT_ENABLED','1');vi.stubEnv('FARM_V2_PLATFORM_AUTOMATION_SECRET','server-target-secret');vi.stubEnv('REPLIT_APP_SHARED_SECRET','application-secret');vi.stubEnv('FARM_V2_BRIDGE_SHARED_SECRET','');vi.stubEnv('PLATFORM_BASE_URL','https://old-test.example');}
it('authenticates the fixed callback target without forwarding any browser bypass credential',async()=>{
 configure();const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({error:'FARM_SESSION_NOT_ACTIVE'},{status:401}));const out=response();
 await handler({method:'GET',headers:{'x-vercel-protection-bypass':'browser-spoof'}},out);
 const [url,init]=fetch.mock.calls[0];expect(String(url)).toBe('https://yuceluopan-main-l0exgwomm-williamlee-codexs-projects.vercel.app/api/replit/farm-v2/session');
 const headers=new Headers(init?.headers);expect(headers.get('x-vercel-protection-bypass')).toBe('server-target-secret');
 expect(headers.get('x-vercel-trusted-oidc-idp-token')).toBe('runtime-identity');expect(headers.get('x-replit-shared-secret')).toBe('application-secret');
 expect(headers.has('x-vercel-set-bypass-cookie')).toBe(false);expect(init?.redirect).toBe('error');
 expect(out.code).toBe(200);expect(out.body).toEqual({status:'pass',callback:true,authorityStatus:401});
 expect(JSON.stringify(out.body)).not.toContain('secret');
});
it('does not mistake a protected 403 for callback acceptance',async()=>{
 configure();vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('protected',{status:403,headers:{'content-type':'text/plain'}}));const out=response();
 await handler({method:'GET'},out);expect(out.code).toBe(503);expect(out.body).toEqual({status:'not_ready',callback:false,authorityStatus:403});
});
it('does not accept a different 401 contract',async()=>{
 configure();vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({error:'OTHER_FAILURE'},{status:401}));const out=response();
 await handler({method:'GET'},out);expect(out.code).toBe(503);
});
it('never runs the diagnostic in production or with the entry open',async()=>{
 configure();const fetch=vi.spyOn(globalThis,'fetch');vi.stubEnv('VERCEL_ENV','production');const out=response();await handler({method:'GET'},out);expect(out.code).toBe(404);
 vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('FARM_V2_ENTRY_ENABLED','1');await handler({method:'GET'},out);expect(out.code).toBe(404);expect(fetch).not.toHaveBeenCalled();
});
it('rejects write methods before any upstream call',async()=>{
 configure();const fetch=vi.spyOn(globalThis,'fetch');const out=response();await handler({method:'POST'},out);expect(out.code).toBe(405);expect(fetch).not.toHaveBeenCalled();
});

it('uses the existing dedicated bridge credential when the legacy secret is absent',async()=>{
 configure();vi.stubEnv('REPLIT_APP_SHARED_SECRET','');vi.stubEnv('FARM_V2_BRIDGE_SHARED_SECRET','dedicated-bridge');
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({error:'FARM_SESSION_NOT_ACTIVE'},{status:401}));const out=response();
 await handler({method:'GET'},out);
 const headers=new Headers(fetch.mock.calls[0][1]?.headers);
 expect(headers.get('x-farm-v2-shared-secret')).toBe('dedicated-bridge');expect(headers.has('x-replit-shared-secret')).toBe(false);
 expect(out.code).toBe(200);
});
