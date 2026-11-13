import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFirstPurchase, type FirstPurchasePlanId } from './firstPurchaseRules';

const prices={A:390,B:990,C:1790} as const;
const crystals={A:120,B:360,C:720} as const;
for(const planId of ['A','B','C'] as const){
  test('first-purchase '+planId+' requires verified exact payment and is independent',()=>{
    const payment={paymentId:'payment-'+planId,planId,paidTwd:prices[planId],providerVerified:true,paymentStatus:'paid' as const};
    const result=evaluateFirstPurchase(payment,(['A','B','C'] as FirstPurchasePlanId[]).filter(x=>x!==planId),[]);
    assert.equal(result.eligible,true);
    assert.equal(result.crystals,crystals[planId]);
    assert.equal(evaluateFirstPurchase({...payment,providerVerified:false},[],[]).reason,'PAYMENT_NOT_VERIFIED');
    assert.equal(evaluateFirstPurchase({...payment,paidTwd:prices[planId]-1},[],[]).reason,'AMOUNT_MISMATCH');
    assert.equal(evaluateFirstPurchase({...payment,paymentStatus:'refunded'},[],[]).reason,'PAYMENT_NOT_VERIFIED');
    assert.equal(evaluateFirstPurchase(payment,[planId],[]).reason,'PLAN_ALREADY_CLAIMED');
    assert.equal(evaluateFirstPurchase(payment,[],[payment.paymentId]).reason,'PAYMENT_ALREADY_PROCESSED');
  });
}
test('distinct pots are specified in higher tiers, not interchangeable with warehouse crops',()=>{
  const b=evaluateFirstPurchase({paymentId:'b',planId:'B',paidTwd:990,providerVerified:true,paymentStatus:'paid'},[],[]);
  const c=evaluateFirstPurchase({paymentId:'c',planId:'C',paidTwd:1790,providerVerified:true,paymentStatus:'paid'},[],[]);
  assert.deepEqual(b.gifts?.filter(g=>g.item==='random_heaven_pot_distinct'),[{item:'random_heaven_pot_distinct',quantity:2}]);
  assert.deepEqual(c.gifts?.filter(g=>g.item==='random_sacred_pot_distinct'),[{item:'random_sacred_pot_distinct',quantity:2}]);
});
