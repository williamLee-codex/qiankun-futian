import { FIRST_PURCHASE_DAILY_GIFTS, FIRST_PURCHASE_PLANS, PAID_CRYSTAL_MILESTONES } from './farmV2Catalog';

export type FirstPurchasePlanId = keyof typeof FIRST_PURCHASE_PLANS;
export type FirstPurchaseClaim = { planId: FirstPurchasePlanId; day: 1 | 2 | 3 };

/** A day starts at 05:00 Asia/Taipei. The payment day is day one. */
export function taipeiRewardDay(timestamp: string | number | Date): number {
  const ms = new Date(timestamp).getTime();
  if (!Number.isFinite(ms)) throw new Error('INVALID_TIMESTAMP');
  return Math.floor((ms + 8 * 3600000 - 5 * 3600000) / 86400000);
}

export function availableFirstPurchaseDay(paidAt: string | number | Date, now: string | number | Date): 0 | 1 | 2 | 3 {
  const paymentMs = new Date(paidAt).getTime();
  const currentMs = new Date(now).getTime();
  if (!Number.isFinite(paymentMs) || !Number.isFinite(currentMs)) throw new Error('INVALID_TIMESTAMP');
  if (currentMs < paymentMs) return 0;
  const elapsed = taipeiRewardDay(currentMs) - taipeiRewardDay(paymentMs);
  return Math.max(0, Math.min(3, elapsed + 1)) as 0 | 1 | 2 | 3;
}

/** Each package has its own lifetime entitlement; different packages never block each other. */
export function mayPurchaseFirstPurchasePlan(planId: FirstPurchasePlanId, purchasedPlanIds: readonly FirstPurchasePlanId[]): boolean {
  if (!FIRST_PURCHASE_PLANS[planId]) throw new Error('INVALID_PLAN');
  return !purchasedPlanIds.includes(planId);
}

export function evaluateFirstPurchaseClaim(
  purchase: { planId: FirstPurchasePlanId; paidAt: string; paymentConfirmed: boolean; claimedDays: readonly number[] },
  requestedDay: 1 | 2 | 3,
  now: string | number | Date,
): { accepted: boolean; reason?: string; gifts?: readonly {item:string;quantity:number}[] } {
  if (!FIRST_PURCHASE_PLANS[purchase.planId]) return { accepted:false, reason:'INVALID_PLAN' };
  if (!purchase.paymentConfirmed) return { accepted:false, reason:'PAYMENT_NOT_CONFIRMED' };
  if (![1,2,3].includes(requestedDay)) return { accepted:false, reason:'INVALID_DAY' };
  if (new Date(now).getTime() < new Date(purchase.paidAt).getTime()) return { accepted:false, reason:'PAYMENT_IN_FUTURE' };
  if (purchase.claimedDays.includes(requestedDay)) return { accepted:false, reason:'ALREADY_CLAIMED' };
  if (requestedDay > availableFirstPurchaseDay(purchase.paidAt,now)) return { accepted:false, reason:'NOT_YET_AVAILABLE' };
  return { accepted:true, gifts:FIRST_PURCHASE_DAILY_GIFTS[purchase.planId][requestedDay-1] };
}

/** Gifted crystals never count toward paid unlocks. This function accepts only the paid ledger total. */
export function unlockedPaidMilestones(purchasedCrystals: number) {
  if (!Number.isSafeInteger(purchasedCrystals) || purchasedCrystals < 0) throw new Error('INVALID_PAID_CRYSTALS');
  return Object.fromEntries(Object.entries(PAID_CRYSTAL_MILESTONES).map(([key,required])=>[key,purchasedCrystals>=required])) as Record<keyof typeof PAID_CRYSTAL_MILESTONES,boolean>;
}

/** Return purchased crystals only; bonus crystals must be posted to a separate gift ledger. */
export function firstPurchasePaymentCredit(planId: FirstPurchasePlanId) {
  const plan=FIRST_PURCHASE_PLANS[planId];
  if (!plan) throw new Error('INVALID_PLAN');
  return { paidCrystals:plan.baseCrystals, giftCrystals:0, amountTwd:plan.priceTwd };
}
