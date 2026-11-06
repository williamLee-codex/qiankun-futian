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

test('correlates concurrent authorization stages without logging request identity', async () => {
  const traceA='b3e51e88-8c8c-4f44-a64b-3a8175b6aa10';
  const traceB='fa67abf9-b161-4b3b-b1e3-581f96b80123';
  const lines=[]; const original=console.info;console.info=line=>lines.push(JSON.parse(line));
  try {
    const result=await Promise.all([
      measureFarmV2Stage('authority_connect',async()=>1,traceA),
      measureFarmV2Stage('authority_lock',async()=>2,traceA),
      measureFarmV2Stage('authority_register',async()=>3,traceB),
    ]);
    assert.deepEqual(result,[1,2,3]);
    assert.equal(lines.filter(x=>x.traceId===traceA).length,2);
    assert.equal(lines.filter(x=>x.traceId===traceB).length,1);
    assert.ok(lines.every(x=>!('requestId' in x)&&!('userId' in x)));
  } finally {console.info=original;}
});
test('records only validated SQLSTATE and preserves exact error identity',async()=>{
  const lines=[];const original=console.info;console.info=line=>lines.push(JSON.parse(line));
  try {
    const error=Object.assign(new Error('postgres://secret@host token'),{code:'XX000'});
    await assert.rejects(measureFarmV2Stage('authority_register',async()=>{throw error;},'not-a-uuid'),e=>e===error);
    assert.equal(lines.length,1);
    assert.equal(lines[0].sqlstate,'XX000');
    assert.equal(lines[0].traceId,undefined);
    assert.equal(JSON.stringify(lines).includes('secret'),false);
    const other=Object.assign(new Error('sensitive'),{code:'password-secret'});
    await assert.rejects(measureFarmV2Stage('authority_register',async()=>{throw other;}),e=>e===other);
    assert.equal(lines[1].sqlstate,undefined);
  } finally {console.info=original;}
});
