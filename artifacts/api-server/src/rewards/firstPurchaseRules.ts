import { FIRST_PURCHASE_PLANS, type Reward } from './farmV2Catalog';

export type FirstPurchasePlanId = keyof typeof FIRST_PURCHASE_PLANS;
export type VerifiedPurchase = Readonly<{
  paymentId: string;
  planId: FirstPurchasePlanId;
  paidTwd: number;
  providerVerified: boolean;
  paymentStatus: 'paid' | 'pending' | 'failed' | 'refunded';
}>;
export type FirstPurchaseDecision = Readonly<{
  eligible: boolean;
  reason: string;
  planId?: FirstPurchasePlanId;
  paymentId?: string;
  crystals?: number;
  gifts?: readonly Reward[];
}>;

/**
 * Pure eligibility decision only. The caller MUST obtain the payment from
 * a server-verified NewebPay callback and atomically reserve both paymentId
 * and (playerId,planId) in the database before any wallet/inventory credit.
 * Never call this with untrusted browser-submitted paymentStatus.
 */
export function evaluateFirstPurchase(
  purchase: VerifiedPurchase,
  alreadyClaimedPlans: readonly FirstPurchasePlanId[],
  processedPaymentIds: readonly string[],
): FirstPurchaseDecision {
  if (!purchase || !Object.prototype.hasOwnProperty.call(FIRST_PURCHASE_PLANS,purchase.planId))
    return { eligible:false,reason:'UNKNOWN_PLAN' };
  const plan=FIRST_PURCHASE_PLANS[purchase.planId];
  if (!purchase.paymentId || purchase.paymentId.length > 128)
    return { eligible:false,reason:'INVALID_PAYMENT_ID' };
  if (!purchase.providerVerified || purchase.paymentStatus !== 'paid')
    return { eligible:false,reason:'PAYMENT_NOT_VERIFIED' };
  if (!Number.isSafeInteger(purchase.paidTwd) || purchase.paidTwd !== plan.priceTwd)
    return { eligible:false,reason:'AMOUNT_MISMATCH' };
  if (processedPaymentIds.includes(purchase.paymentId))
    return { eligible:false,reason:'PAYMENT_ALREADY_PROCESSED' };
  if (alreadyClaimedPlans.includes(purchase.planId))
    return { eligible:false,reason:'PLAN_ALREADY_CLAIMED' };
  return {
    eligible:true,reason:'READY',planId:purchase.planId,paymentId:purchase.paymentId,
    crystals:plan.baseCrystals+plan.bonusCrystals,
    gifts:plan.gifts.map(g=>({item:g.item,quantity:g.quantity})),
  };
}
