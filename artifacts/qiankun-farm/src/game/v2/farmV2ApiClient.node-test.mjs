import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createFarmV2Api} from './farmV2ApiClient.ts';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;delete globalThis.location;delete globalThis.sessionStorage});
test('reopen restores session without resending launch credential',async()=>{
 globalThis.location={origin:'https://farm.example'};
 globalThis.sessionStorage={getItem:()=>null,setItem:()=>{}};
 const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push([url,options]);return Response.json(url.endsWith('/session')?{userId:'u',sessionToken:'cookie-session',reauthenticateUrl:'https://farm.example/launch'}:{lands:[]})};
 const api=createFarmV2Api({baseUrl:'https://farm.example/api/farm-backend/',launchToken:'browser-session'});
 await api.readState();await api.readState();
 assert.equal(calls.length,3);assert.equal(calls[0][1].method,'GET');
 assert.ok(calls.every(([,o])=>!o.headers.Authorization));
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
