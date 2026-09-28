import type { FarmLandId } from './canonicalLandData';

export const BORROW_MATURE_PROTECTION_MS = 60 * 60 * 1000;
export const QILIN_BLOCK_RATE = 0.5;
export const TING_SECOND_FIELD_RATE = 0.3;

export interface BorrowTarget {
  landId: FarmLandId;
  currentQuantity: number;
  maturesAt: number;
}

export interface BorrowPetEffects {
  suanniActive: boolean;
  tingActive: boolean;
  qilinActive: boolean;
}

export interface BorrowRandomSource {
  /** Returns a value in [0, 1). */
  next(): number;
}

export interface BorrowFieldResult {
  landId: FarmLandId;
  beforeQuantity: number;
  borrowedQuantity: number;
  remainingQuantity: number;
  blockedByQilin: boolean;
}

export interface BorrowSettlementResult {
  successful: boolean;
  fields: BorrowFieldResult[];
  totalBorrowed: number;
}

export function isBorrowableTarget(target: BorrowTarget, now: number): boolean {
  return target.landId >= 2 &&
    target.landId <= 5 &&
    target.currentQuantity > 1 &&
    now >= target.maturesAt + BORROW_MATURE_PROTECTION_MS;
}

/** Canonical base loss = min(ceil(current * 30%), current - 1). */
export function baseBorrowQuantity(currentQuantity: number): number {
  if (!Number.isInteger(currentQuantity) || currentQuantity <= 1) return 0;
  return Math.min(Math.ceil(currentQuantity * 0.3), currentQuantity - 1);
}

/**
 * 辟邪狻猊 reduces the base borrow loss by 30%.
 * Protection uses ceil(base * 30%); actual loss can never go below zero.
 */
export function applySuanniProtection(baseQuantity: number, active: boolean): number {
  if (!active || baseQuantity <= 0) return baseQuantity;
  const protectedQuantity = Math.ceil(baseQuantity * 0.3);
  return Math.max(0, baseQuantity - protectedQuantity);
}

function settleOneField(input: {
  target: BorrowTarget;
  pets: BorrowPetEffects;
  rng: BorrowRandomSource;
}): BorrowFieldResult {
  const beforeQuantity = input.target.currentQuantity;
  if (input.pets.qilinActive && input.rng.next() < QILIN_BLOCK_RATE) {
    return {
      landId: input.target.landId,
      beforeQuantity,
      borrowedQuantity: 0,
      remainingQuantity: beforeQuantity,
      blockedByQilin: true,
    };
  }

  const base = baseBorrowQuantity(beforeQuantity);
  const borrowedQuantity = applySuanniProtection(base, input.pets.suanniActive);
  return {
    landId: input.target.landId,
    beforeQuantity,
    borrowedQuantity,
    remainingQuantity: beforeQuantity - borrowedQuantity,
    blockedByQilin: false,
  };
}

/**
 * The caller supplies eligible mature targets after server-side friendship,
 * farmer, daily-limit and cooldown validation.
 *
 * First target is always attempted. With active 噬時諦聽, a second DIFFERENT
 * eligible field is attempted on a 30% roll. Each target gets its own Qilin roll.
 * One request is still one borrow action/cooldown even if two fields succeed.
 */
export function settleBorrow(input: {
  targets: readonly BorrowTarget[];
  now: number;
  pets: BorrowPetEffects;
  rng: BorrowRandomSource;
}): BorrowSettlementResult {
  const eligible = input.targets
    .filter((target) => isBorrowableTarget(target, input.now))
    .filter((target, index, arr) => arr.findIndex((x) => x.landId === target.landId) === index);

  if (eligible.length === 0) {
    return { successful: false, fields: [], totalBorrowed: 0 };
  }

  const selected: BorrowTarget[] = [eligible[0]];
  if (
    input.pets.tingActive &&
    eligible.length > 1 &&
    input.rng.next() < TING_SECOND_FIELD_RATE
  ) {
    selected.push(eligible[1]);
  }

  const fields = selected.map((target) => settleOneField({
    target,
    pets: input.pets,
    rng: input.rng,
  }));
  const totalBorrowed = fields.reduce((sum, field) => sum + field.borrowedQuantity, 0);

  return {
    successful: totalBorrowed > 0,
    fields,
    totalBorrowed,
  };
}
