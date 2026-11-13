import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSignInAction, type SignInCycle } from './signInRules';
import { newcomerHarvestMultiplier, newcomerHarvestYield } from './newcomerHarvest';

const state = (signedDays: number[] = [], makeupDays: number[] = [], makeupCreditsUsed = 0, perfectAttendanceClaimed = false): SignInCycle =>
  ({ signedDays, makeupDays, makeupCreditsUsed, perfectAttendanceClaimed });

test('30-day sign-in permits today once, rejects future and repeated day', () => {
  assert.equal(evaluateSignInAction(state(), 1, { kind:'sign_in', day:1 }).accepted, true);
  assert.equal(evaluateSignInAction(state(), 1, { kind:'sign_in', day:2 }).accepted, false);
  assert.equal(evaluateSignInAction(state([1]), 1, { kind:'sign_in', day:1 }).reason, 'ALREADY_SIGNED');
  assert.equal(evaluateSignInAction(state(), 31, { kind:'sign_in', day:31 }).accepted, false);
});

test('makeup only past days, chronological, and within earned credits', () => {
  assert.equal(evaluateSignInAction(state([1,3]), 3, {kind:'makeup',day:2}).accepted,true);
  assert.equal(evaluateSignInAction(state([1,3]), 3, {kind:'makeup',day:3}).accepted,false);
  assert.equal(evaluateSignInAction(state([1,3],[],1), 3, {kind:'makeup',day:2}).reason,'NO_MAKEUP_CREDITS');
  assert.equal(evaluateSignInAction(state([1,4]), 4, {kind:'makeup',day:3}).reason,'EARLIER_MISSED_DAY');
  assert.equal(evaluateSignInAction(state([1]), 2, {kind:'makeup',day:1}).reason,'ALREADY_SIGNED');
});

test('only 30 natural sign-ins qualify once for full attendance', () => {
  const days=Array.from({length:30},(_,i)=>i+1);
  assert.equal(evaluateSignInAction(state(days),30,{kind:'claim_perfect'}).accepted,true);
  assert.equal(evaluateSignInAction(state(days,[2]),30,{kind:'claim_perfect'}).reason,'NOT_COMPLETE');
  assert.equal(evaluateSignInAction(state(days,[2],1,true),30,{kind:'claim_perfect'}).reason,'ALREADY_CLAIMED');
  assert.equal(evaluateSignInAction(state(days.slice(1)),30,{kind:'claim_perfect'}).reason,'NOT_COMPLETE');
});

test('newcomer sixfold applies across all plots for exactly seven days', () => {
  const start='2026-11-01T00:00:00.000Z';
  const startMs=Date.parse(start);
  assert.equal(newcomerHarvestMultiplier(start,start),6);
  assert.equal(newcomerHarvestYield(20,start,startMs+7*86400000-1),120);
  assert.equal(newcomerHarvestYield(20,start,startMs+7*86400000),20);
  assert.equal(newcomerHarvestMultiplier(null,start),1);
  assert.equal(newcomerHarvestMultiplier(start,startMs-1),1);
  assert.throws(()=>newcomerHarvestYield(-1,start,start));
});
