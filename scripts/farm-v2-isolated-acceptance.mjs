// Isolated Farm V2 end-to-end acceptance. No production defaults, no stored credentials.
// Usage: FARM_TEST_API_URL=https://<isolated-api> FARM_TEST_LAUNCH_TOKEN=<one-time-token>
//        FARM_TEST_LAND_ID=<isolated-land-id> FARM_TEST_MUTATE=1 FARM_TEST_ACTION=sow|harvest node scripts/farm-v2-isolated-acceptance.mjs
// Never run mutation against a production hostname.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const api = process.env.FARM_TEST_API_URL;
const launchToken = process.env.FARM_TEST_LAUNCH_TOKEN;
assert.ok(api && launchToken, 'FARM_TEST_API_URL and FARM_TEST_LAUNCH_TOKEN required');
const base = new URL(api);
assert.equal(base.protocol, 'https:', 'HTTPS required');
assert.ok(!['www.yuceluopan.com','yuceluopan.com','qiankun-farm-v2-api.vercel.app'].includes(base.hostname), 'Production host forbidden');
assert.equal(base.hostname, 'qiankun-farm-v2-k5e0oe9uj-williamlee-codexs-projects.vercel.app', 'Only the verified isolated Farm API preview is allowed');
assert.equal(base.pathname, '/', 'API URL must not contain a path');
assert.equal(base.search, '', 'API URL must not contain query parameters');
assert.equal(base.hash, '', 'API URL must not contain a fragment');
const headers = { authorization: `Bearer ${launchToken}`, 'content-type':'application/json' };
async function check(path, method='GET', body) {
 const res=await fetch(new URL(path,base),{method,headers:{...headers,'x-request-id':randomUUID()},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
 const text=await res.text();
 let json; try{json=JSON.parse(text)}catch{throw Error(`${path}: non-JSON HTTP ${res.status}`)}
 assert.ok(res.ok,`${path}: HTTP ${res.status} ${JSON.stringify(json)}`);
 return json;
}
const ready=await fetch(new URL('/api/healthz/ready',base),{redirect:'error',signal:AbortSignal.timeout(15000)});
assert.equal(ready.status,200,'DB/config readiness');
console.log('PASS ready');
const session=await check('/api/farm/v2/session','POST',{launchToken,action:'exchange'});
assert.ok(session.sessionToken && session.userId,'Session exchange must return identity');
console.log('PASS session exchange');
headers.authorization=`Bearer ${session.sessionToken}`;
const state=await check('/api/farm/v2/state');
assert.ok(state && typeof state==='object','State response required');
console.log('PASS authenticated state read');
if(process.env.FARM_TEST_MUTATE==='1'){
 assert.ok(process.env.FARM_TEST_LAND_ID,'FARM_TEST_LAND_ID required for isolated mutations');
 const landId=encodeURIComponent(process.env.FARM_TEST_LAND_ID);
 // Harvest is not immediately available after sowing; run the two operations in separate windows.
 const action=process.env.FARM_TEST_ACTION;
 assert.ok(['sow','harvest'].includes(action),'FARM_TEST_ACTION must be sow or harvest');
 {
  const result=await check(`/api/farm/v2/lands/${landId}/${action}`,'POST',{});
  assert.ok(result && typeof result==='object',`${action} response`);
  console.log(`PASS isolated ${action}`);
 }
 await check('/api/farm/v2/state');
 console.log('PASS post-mutation state read');
}else console.log('NOT RUN sow/harvest: FARM_TEST_MUTATE not enabled');
console.log('Acceptance complete');
