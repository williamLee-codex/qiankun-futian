import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/isolation-check.mjs';
const valid={VERCEL_ENV:'preview',FARM_V2_ENTRY_ENABLED:'0',FARM_V2_ATOMIC_POT_ENABLED:'0',FARM_DB_CONNECTION_MODE:'session',DATABASE_URL:'postgresql://farm_v2_runtime.ijguwqserwiufpxizgzy:placeholder@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full'};
function response(){return {code:0,body:null,setHeader(){},status(c){this.code=c;return this},json(b){this.body=b}}}
for(const [name,override] of [['production',{VERCEL_ENV:'production'}],['open entry',{FARM_V2_ENTRY_ENABLED:'1'}],['wrong database',{DATABASE_URL:valid.DATABASE_URL.replace('ijguwqserwiufpxizgzy','qowjznvinqoxekiyjyvy')}],['transaction mode',{FARM_DB_CONNECTION_MODE:'transaction'}]]){
 test(`reject ${name} before acquiring credentials`,async()=>{let calls=0;const h=createHandler({...valid,...override},()=>{calls++;throw Error('must not connect')});const r=response();await h({method:'GET'},r);assert.equal(r.code,404);assert.equal(calls,0)});
}
test('reject write methods',async()=>{let calls=0;const r=response();await createHandler(valid,()=>calls++)({method:'POST'},r);assert.equal(r.code,405);assert.equal(calls,0)});
test('driver failures never expose secrets',async()=>{const r=response();await createHandler(valid,()=>{throw Error('password=do-not-expose')})({method:'GET'},r);assert.equal(r.code,503);assert.deepEqual(r.body,{status:'not_ready'});assert.ok(!JSON.stringify(r.body).includes('password'))});
