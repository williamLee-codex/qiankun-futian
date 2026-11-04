import test from 'node:test';
import assert from 'node:assert/strict';
import { measureFarmV2Stage, timeFarmV2Function } from './farm-v2-stage-timing.ts';

test('preserves the operation result and records bounded numeric timing', async () => {
  const lines=[]; const original=console.info; console.info=line=>lines.push(JSON.parse(line));
  try {
    const value={committed:true}; let calls=0;
    const actual=await measureFarmV2Stage('domain_exchange',async()=>{calls++;return value;});
    assert.equal(actual,value); assert.equal(calls,1);
    assert.equal(lines.length,1);
    assert.deepEqual(Object.keys(lines[0]).sort(),['code','durationMs','stage','success']);
    assert.equal(lines[0].stage,'domain_exchange'); assert.equal(lines[0].success,true);
    assert.equal(Number.isFinite(lines[0].durationMs),true); assert.ok(lines[0].durationMs>=0);
  } finally {console.info=original;}
});
test('preserves failures and does not log exception details or credentials', async () => {
  const lines=[]; const original=console.info; console.info=line=>lines.push(line);
  try {
    const error=new Error('postgres://private-password@host secret-token');
    await assert.rejects(measureFarmV2Stage('platform_wallet',async()=>{throw error;}),e=>e===error);
    assert.equal(lines.length,1); assert.equal(JSON.parse(lines[0]).success,false);
    assert.equal(lines[0].includes('private-password'),false); assert.equal(lines[0].includes('secret-token'),false);
  } finally {console.info=original;}
});
test('invalid stage labels cannot leak arbitrary input into logs', async () => {
  const lines=[]; const original=console.info; console.info=line=>lines.push(line);
  try {assert.equal(await measureFarmV2Stage('secret-token',async()=>42),42);assert.equal(lines.length,0);}
  finally {console.info=original;}
});
test('a failing logging sink cannot turn a committed operation into an error', async () => {
  const original=console.info; console.info=()=>{throw new Error('sink failed');};
  try {assert.equal(await measureFarmV2Stage('domain_sow',async()=>42),42);}
  finally {console.info=original;}
});
test('decorated domain calls preserve arguments, return identity and call count', async () => {
  const original=console.info; console.info=()=>{};
  try {
    const command={requestId:'same-request',quantity:5};const result={reward:1};let calls=0;
    const wrapped=timeFarmV2Function('domain_exchange',async (input,token)=>{
      calls++;assert.equal(input,command);assert.equal(token,'private-token');return result;
    });
    assert.equal(await wrapped(command,'private-token'),result);assert.equal(calls,1);
  } finally {console.info=original;}
});

test('authority_register stage reports success and preserves a successful write', async () => {
  const lines=[]; const original=console.info; console.info=line=>lines.push(JSON.parse(line));
  try {
    let writes=0;const result={rowCount:1};
    assert.equal(await measureFarmV2Stage('authority_register',async()=>{writes++;return result;}),result);
    assert.equal(writes,1);
    assert.equal(lines.length,1);
    assert.deepEqual(Object.keys(lines[0]).sort(),['code','durationMs','stage','success']);
    assert.equal(lines[0].stage,'authority_register');
    assert.equal(lines[0].success,true);
    assert.equal(Number.isFinite(lines[0].durationMs),true);
  } finally {console.info=original;}
});

test('authority_register stage reports failure without masking or logging the database error', async () => {
  const lines=[];const original=console.info;console.info=line=>lines.push(line);
  try {
    const error=new Error('postgres://private-password@host secret-token');
    await assert.rejects(measureFarmV2Stage('authority_register',async()=>{throw error;}),e=>e===error);
    assert.equal(lines.length,1);
    assert.equal(JSON.parse(lines[0]).stage,'authority_register');
    assert.equal(JSON.parse(lines[0]).success,false);
    assert.equal(lines[0].includes('private-password'),false);
    assert.equal(lines[0].includes('secret-token'),false);
  } finally {console.info=original;}
});
