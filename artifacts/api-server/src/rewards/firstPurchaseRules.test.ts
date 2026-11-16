import { it as test } from 'vitest';
import assert from 'node:assert/strict';
import { availableFirstPurchaseDay, evaluateFirstPurchaseClaim, firstPurchasePaymentCredit, unlockedPaidMilestones } from './firstPurchaseRules';
import { FIRST_PURCHASE_DAILY_GIFTS, FIRST_PURCHASE_PLANS } from './farmV2Catalog';

test('three independent plans credit purchased crystals immediately, not bonus',()=>{
  assert.deepEqual(['A','B','C'].map(id=>firstPurchasePaymentCredit(id as 'A'|'B'|'C').paidCrystals),[60,180,360]);
  assert.deepEqual(['A','B','C'].map(id=>firstPurchasePaymentCredit(id as 'A'|'B'|'C').giftCrystals),[0,0,0]);
  assert.equal(['A','B','C'].reduce((sum,id)=>sum+FIRST_PURCHASE_PLANS[id as 'A'|'B'|'C'].baseCrystals,0),600);
});

test('gift crystals are distributed in three claims with exact totals',()=>{
  for (const id of ['A','B','C'] as const) {
    const gifts=FIRST_PURCHASE_DAILY_GIFTS[id];
    assert.equal(gifts.length,3);
    assert.deepEqual(gifts.map(day=>day.find(g=>g.item==='gift_crystals')?.quantity),Array(3).fill(FIRST_PURCHASE_PLANS[id].baseCrystals/3));
  }
});

test('05:00 Taipei boundary controls day two and day three',()=>{
  const paid='2026-11-16T20:59:00Z'; // 04:59 Taipei Nov 17
  assert.equal(availableFirstPurchaseDay(paid,'2026-11-16T20:59:30Z'),1);
  assert.equal(availableFirstPurchaseDay(paid,'2026-11-16T21:00:00Z'),2);
  assert.equal(availableFirstPurchaseDay(paid,'2026-11-17T21:00:00Z'),3);
  assert.equal(availableFirstPurchaseDay(paid,'2026-11-16T20:58:00Z'),0);
});

test('claims require confirmed payment and reject early or duplicate claims',()=>{
  const purchase={planId:'A' as const,paidAt:'2026-11-16T10:00:00Z',paymentConfirmed:true,claimedDays:[1]};
  assert.equal(evaluateFirstPurchaseClaim(purchase,1,'2026-11-16T10:01:00Z').reason,'ALREADY_CLAIMED');
  assert.equal(evaluateFirstPurchaseClaim(purchase,2,'2026-11-16T10:01:00Z').reason,'NOT_YET_AVAILABLE');
  assert.equal(evaluateFirstPurchaseClaim({...purchase,paymentConfirmed:false},2,'2026-11-18T10:00:00Z').reason,'PAYMENT_NOT_CONFIRMED');
  assert.equal(evaluateFirstPurchaseClaim(purchase,2,'2026-11-17T10:00:00Z').accepted,true);
});

test('paid unlocks ignore gifted crystal ledger even after all three plans',()=>{
  assert.equal(unlockedPaidMilestones(60).field4,false);
  assert.equal(unlockedPaidMilestones(240).field4,true);
  assert.equal(unlockedPaidMilestones(240).field5,false);
  const all=unlockedPaidMilestones(600);
  assert.equal(all.field6,true);
  assert.equal(all.divinePet,false);
  assert.equal(all.dedicatedFarmer,false);
});
