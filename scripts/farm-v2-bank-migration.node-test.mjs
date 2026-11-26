import test from 'node:test';import assert from 'node:assert/strict';
import {guard,reviewedSql,hash} from './farm-v2-production-authority.mjs';
import {readFileSync} from 'node:fs';
test('bank migration guard checks private schema targets without a public prefix',()=>{
 const m=JSON.parse(readFileSync(new URL('../lib/db/production-migration-map.json',import.meta.url))).migrations.at(-1);
 const source=readFileSync(new URL('../'+m.file,import.meta.url),'utf8');
 assert.equal(hash(source),m.sha256);assert.equal(m.executionAuthorized,false);
 const statement=guard({...m,prerequisites:[]});assert.ok(statement.includes("to_regclass('farm_v2_bank.wallets')"));assert.ok(!statement.includes('public.farm_v2_bank'));assert.ok(reviewedSql({...m,source,prerequisites:[]}).endsWith('COMMIT;'));
});
