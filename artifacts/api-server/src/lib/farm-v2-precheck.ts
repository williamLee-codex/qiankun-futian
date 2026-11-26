/**
 * Transaction pre-checks run before a mutation row exists.
 *
 * A failed condition is a normal business outcome: the caller returns the code
 * to the client and nothing is reserved, charged or journalled. Only real
 * faults may reach the recovery path.
 */
import { POT_GRADES, type PotGrade } from "../../../qiankun-farm/src/game/v2/potRuntime";
import { getSynthesisMaterials } from "../../../qiankun-farm/src/game/v2/canonicalEconomyData";
import {
  workshopState,
  type WorkshopWarehouse,
} from "../../../qiankun-farm/src/game/v2/workshopRuntime";

export type PrecheckFailure = {
  ok: false;
  code: string;
  /** Wallet that must be topped up, when the failure is a coin shortfall. */
  wallet?: "core" | "farm";
  details?: Record<string, unknown>;
};

export type PrecheckResult = { ok: true } | PrecheckFailure;

const ok: PrecheckResult = { ok: true };

export function precheckSeedPurchase(input: {
  playerExists: boolean;
  landUnlocked: boolean;
  unitPrice: number;
  packs: number;
  /** null when the authoritative balance cannot be read: the purchase is refused. */
  availableCoins: number | null;
  wallet: "core" | "farm";
}): PrecheckResult {
  if (!input.playerExists)
    return { ok: false, code: "FARM_PLAYER_STATE_NOT_FOUND" };
  if (!input.landUnlocked) return { ok: false, code: "FARM_SEED_LAND_LOCKED" };
  const cost = input.unitPrice * input.packs;
  if (input.availableCoins === null)
    return { ok: false, code: "WALLET_BALANCE_UNAVAILABLE", wallet: input.wallet, details: { cost } };
  if (input.availableCoins < cost)
    return {
      ok: false,
      code: input.wallet === "farm" ? "FARM_COIN_INSUFFICIENT" : "CORE_COIN_INSUFFICIENT",
      wallet: input.wallet,
      details: { cost, available: input.availableCoins },
    };
  return ok;
}

export function precheckSynthesis(input: {
  material: string;
  materialStock: number;
  required: number;
  freeSlots: number;
  potCost: number;
  availableCrystals: number | null;
}): PrecheckResult {
  if (input.materialStock < input.required)
    return {
      ok: false,
      code: "MATERIAL_INSUFFICIENT",
      details: { material: input.material, required: input.required, available: input.materialStock },
    };
  if (input.freeSlots <= 0) return { ok: false, code: "POT_SLOTS_FULL" };
  if (input.availableCrystals !== null && input.availableCrystals < input.potCost)
    return {
      ok: false,
      code: "CRYSTAL_INSUFFICIENT",
      details: { cost: input.potCost, available: input.availableCrystals },
    };
  return ok;
}

export function precheckCropExchange(input: {
  cropStock: number;
  quantity: number;
  rate: number;
}): PrecheckResult {
  if (input.quantity <= 0) return { ok: false, code: "INVALID_EXCHANGE_QUANTITY" };
  if (input.cropStock < input.quantity)
    return {
      ok: false,
      code: "CROP_INSUFFICIENT",
      details: { required: input.quantity, available: input.cropStock },
    };
  if (input.rate <= 0) return { ok: false, code: "EXCHANGE_RATE_UNAVAILABLE" };
  return ok;
}

export function precheckSow(input: {
  seedStock: number;
  landUnlocked: boolean;
  landBusy: boolean;
}): PrecheckResult {
  if (!input.landUnlocked) return { ok: false, code: "FARM_LAND_LOCKED" };
  if (input.landBusy) return { ok: false, code: "FARM_LAND_BUSY" };
  if (input.seedStock <= 0) return { ok: false, code: "SEED_INSUFFICIENT" };
  return ok;
}

export function precheckHarvest(input: {
  hasCrop: boolean;
  matureAt: number;
  now: number;
}): PrecheckResult {
  if (!input.hasCrop) return { ok: false, code: "FARM_LAND_EMPTY" };
  if (input.matureAt > input.now)
    return {
      ok: false,
      code: "CROP_NOT_MATURE",
      details: { remainingMs: input.matureAt - input.now },
    };
  return ok;
}

export type MaterialShortage = {
  material: string;
  name: string;
  required: number;
  held: number;
  missing: number;
};

/**
 * Synthesis consumes stored materials before any wallet step, so a shortfall
 * must be refused here: no journal row, no charge, no reservation.
 */
export function materialShortages(input: {
  required: Record<string, number>;
  available: Record<string, number>;
  names?: Record<string, string>;
}): MaterialShortage[] {
  const shortages: MaterialShortage[] = [];
  for (const [material, required] of Object.entries(input.required)) {
    const held = input.available[material] ?? 0;
    if (held < required)
      shortages.push({
        material,
        name: input.names?.[material] ?? material,
        required,
        held,
        missing: required - held,
      });
  }
  return shortages;
}

export function precheckWorkshopMaterials(input: {
  required: Record<string, number>;
  available: Record<string, number>;
  names?: Record<string, string>;
}): PrecheckResult {
  const shortages = materialShortages(input);
  if (!shortages.length) return ok;
  return {
    ok: false,
    code: "FARM_MATERIALS_INSUFFICIENT",
    details: {
      materials: shortages
        .map((s) => `${s.name}：需求 ${s.required}、持有 ${s.held}、不足 ${s.missing}`)
        .join("；"),
      shortages,
    },
  };
}

/** A normal refusal the client renders as a notice, never as a fault. */
export class FarmV2PrecheckRefusal extends Error {
  readonly details?: Record<string, unknown>;
  constructor(failure: PrecheckFailure) {
    super(failure.code);
    this.name = "FarmV2PrecheckRefusal";
    if (failure.details) this.details = failure.details;
  }
}

/**
 * Authoritative synthesis material check. Callers pass the state they already
 * hold under a row lock, so the same rule serves both the fast refusal before a
 * journal row exists and the in-transaction backstop against over-consumption.
 */
export function precheckSynthesisMaterials(input: {
  warehouse: WorkshopWarehouse;
  grade: PotGrade;
}): PrecheckResult {
  const index = POT_GRADES.indexOf(input.grade);
  if (index < 0) return { ok: false, code: "INVALID_POT_GRADE" };
  const recipe = getSynthesisMaterials(index);
  return precheckWorkshopMaterials({
    required: { [recipe.material]: recipe.quantity },
    available: workshopState(input.warehouse).materials,
  });
}

export function assertSynthesisMaterials(input: {
  warehouse: WorkshopWarehouse;
  grade: PotGrade;
}): void {
  const result = precheckSynthesisMaterials(input);
  if (!result.ok) throw new FarmV2PrecheckRefusal(result);
}
