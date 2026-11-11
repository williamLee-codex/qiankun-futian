import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createFarmV2Api} from './farmV2ApiClient.ts';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;delete globalThis.location;delete globalThis.sessionStorage});
test('reopen restores session without resending launch credential',async()=>{
 globalThis.location={origin:'https://farm.example'};
 globalThis.sessionStorage={getItem:()=>null,setItem:()=>{}};
 const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push([url,options]);return Response.json(url.endsWith('/session')?{userId:'u',sessionToken:'cookie-session',reauthenticateUrl:'https://farm.example/launch'}:{player:{userId:'u'},lands:[]})};
 const api=createFarmV2Api({baseUrl:'https://farm.example/api/farm-backend/',launchToken:'browser-session'});
 await api.readState();await api.readState();
 assert.equal(calls.length,2);assert.equal(calls[0][1].method,'GET');
 assert.ok(calls.every(([,o])=>!o.headers?.Authorization));
});
test('cookie authentication retains original mutation ID after uncertain result',async()=>{
 globalThis.location={origin:'https://farm.example'};
 globalThis.sessionStorage={getItem:()=>null,setItem:()=>{}};
 const ids=[];let attempts=0;
 globalThis.fetch=async(url,o)=>{if(url.endsWith('/session'))return Response.json({userId:'u',sessionToken:'cookie-session',reauthenticateUrl:'https://farm.example/launch'});ids.push(o.headers['x-request-id']);return ++attempts<3?Response.json({error:'FARM_API_UNAVAILABLE'},{status:503}):Response.json({ok:true})};
 const api=createFarmV2Api({baseUrl:'https://farm.example/api/farm-backend/',launchToken:'browser-session'});
 await assert.rejects(api.exchangeCrops(1,5));await api.exchangeCrops(1,5);
 assert.equal(new Set(ids).size,1);assert.ok(ids[0]);
});
test('browser resume refuses cross-origin API',()=>{
 globalThis.location={origin:'https://farm.example'};
 assert.throws(()=>createFarmV2Api({baseUrl:'https://other.example/',launchToken:'browser-session'}),/SAME_ORIGIN/);
});
test('cookie resume loads state without a separate session round trip and restores pending mutation identity',async()=>{
 globalThis.location={origin:'https://farm.example'};
 const operation=JSON.stringify(['farm/v2/seeds/1/purchase',{packs:1}]);
 globalThis.sessionStorage={getItem:()=>JSON.stringify({[operation]:'original-purchase'}),setItem:()=>{}};
 const calls=[];
 globalThis.fetch=async(url,o)=>{calls.push([url,o]);return Response.json(url.endsWith('/session')?{userId:'u',sessionToken:'cookie-session',reauthenticateUrl:'https://farm.example/launch'}:url.endsWith('/state')?{player:{userId:'u',warehouseState:{seeds:{1:60},crops:{1:406}}},lands:[]}:{ok:true})};
 const api=createFarmV2Api({baseUrl:'https://farm.example/api/farm-backend/',launchToken:'browser-session'});
 const state=await api.readState();
 assert.equal(state.player.userId,'u');
 await api.purchaseSeeds(1,1);
 assert.equal(calls.length,2);
 assert.ok(calls[0][0].endsWith('/state'));
 assert.equal(calls[1][1].headers['x-request-id'],'original-purchase');
 assert.ok(calls.every(([,o])=>!o.headers?.Authorization));
});
test('cookie state resume rejects inactive sessions and still offers same-origin login',async()=>{
 globalThis.location={origin:'https://farm.example'};
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({error:'FARM_SESSION_NOT_ACTIVE'},{status:401})};
 const api=createFarmV2Api({baseUrl:'https://farm.example/api/farm-backend/',launchToken:'browser-session'});
 await assert.rejects(api.readState(),/FARM_SESSION_NOT_ACTIVE/);
 assert.equal(calls,1);
 assert.equal(api.getReauthenticationUrl(),'https://farm.example/api/apps/qiankun-futian/launch?farmV2=1');
});
test('cookie state resume retains one retry for temporary failures without session preflight',async()=>{
 globalThis.location={origin:'https://farm.example'};
 const paths=[];
 globalThis.fetch=async(url)=>{paths.push(url);return paths.length===1?Response.json({error:'FARM_API_UNAVAILABLE'},{status:503}):Response.json({player:{userId:'u'},lands:[]})};
 const api=createFarmV2Api({baseUrl:'https://farm.example/api/farm-backend/',launchToken:'browser-session'});
 assert.equal((await api.readState()).player.userId,'u');
 assert.equal(paths.length,2);
 assert.ok(paths.every(url=>url.endsWith('/state')));
});
