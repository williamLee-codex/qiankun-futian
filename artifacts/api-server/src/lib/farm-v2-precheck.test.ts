import { describe, expect, it } from "vitest";
import {
  precheckHarvest,
  precheckSeedPurchase,
  precheckSow,
  precheckSynthesis,
} from "./farm-v2-precheck";

describe("transaction pre-checks", () => {
  it("reports a coin shortfall with the wallet that needs topping up", () => {
    expect(
      precheckSeedPurchase({
        playerExists: true,
        landUnlocked: true,
        unitPrice: 1,
        packs: 3,
        availableCoins: 2,
        wallet: "farm",
      }),
    ).toEqual({
      ok: false,
      code: "FARM_COIN_INSUFFICIENT",
      wallet: "farm",
      details: { cost: 3, available: 2 },
    });
  });

  it("passes a seed purchase that the balance covers", () => {
    expect(
      precheckSeedPurchase({
        playerExists: true,
        landUnlocked: true,
        unitPrice: 1,
        packs: 3,
        availableCoins: 3,
        wallet: "farm",
      }),
    ).toEqual({ ok: true });
  });

  it("refuses the purchase when the authoritative balance cannot be read", () => {
    expect(
      precheckSeedPurchase({
        playerExists: true,
        landUnlocked: true,
        unitPrice: 1,
        packs: 3,
        availableCoins: null,
        wallet: "farm",
      }),
    ).toEqual({
      ok: false,
      code: "WALLET_BALANCE_UNAVAILABLE",
      wallet: "farm",
      details: { cost: 3 },
    });
  });

  it("debits only the wallet it names", () => {
    const base = { playerExists: true, landUnlocked: true, unitPrice: 2, packs: 1 };
    expect(precheckSeedPurchase({ ...base, availableCoins: 1, wallet: "farm" })).toMatchObject({
      code: "FARM_COIN_INSUFFICIENT",
    });
    expect(precheckSeedPurchase({ ...base, availableCoins: 1, wallet: "core" })).toMatchObject({
      code: "CORE_COIN_INSUFFICIENT",
    });
    expect(precheckSeedPurchase({ ...base, availableCoins: 5, wallet: "core" })).toEqual({ ok: true });
  });

  it("refuses locked land and missing player state before any charge", () => {
    const base = {
      playerExists: true,
      landUnlocked: true,
      unitPrice: 1,
      packs: 1,
      availableCoins: 10,
      wallet: "farm" as const,
    };
    expect(precheckSeedPurchase({ ...base, landUnlocked: false })).toMatchObject({
      code: "FARM_SEED_LAND_LOCKED",
    });
    expect(precheckSeedPurchase({ ...base, playerExists: false })).toMatchObject({
      code: "FARM_PLAYER_STATE_NOT_FOUND",
    });
  });

  it("names the missing material and quantity", () => {
    expect(
      precheckSynthesis({
        material: "蘊靈砂",
        materialStock: 1,
        required: 3,
        freeSlots: 2,
        potCost: 0,
        availableCrystals: null,
      }),
    ).toEqual({
      ok: false,
      code: "MATERIAL_INSUFFICIENT",
      details: { material: "蘊靈砂", required: 3, available: 1 },
    });
  });

  it("checks crystals only when a balance is supplied", () => {
    const base = { material: "蘊靈砂", materialStock: 5, required: 1, freeSlots: 1, potCost: 20 };
    expect(precheckSynthesis({ ...base, availableCrystals: 19 })).toMatchObject({
      code: "CRYSTAL_INSUFFICIENT",
    });
    expect(precheckSynthesis({ ...base, availableCrystals: null })).toEqual({ ok: true });
  });

  it("treats an immature crop as a normal outcome with remaining time", () => {
    expect(precheckHarvest({ hasCrop: true, matureAt: 2_000, now: 1_500 })).toEqual({
      ok: false,
      code: "CROP_NOT_MATURE",
      details: { remainingMs: 500 },
    });
    expect(precheckHarvest({ hasCrop: true, matureAt: 1_000, now: 1_500 })).toEqual({ ok: true });
    expect(precheckHarvest({ hasCrop: false, matureAt: 0, now: 1 })).toMatchObject({
      code: "FARM_LAND_EMPTY",
    });
  });

  it("keeps sow checks separate from harvest checks", () => {
    expect(precheckSow({ seedStock: 0, landUnlocked: true, landBusy: false })).toMatchObject({
      code: "SEED_INSUFFICIENT",
    });
    expect(precheckSow({ seedStock: 2, landUnlocked: true, landBusy: true })).toMatchObject({
      code: "FARM_LAND_BUSY",
    });
    expect(precheckSow({ seedStock: 2, landUnlocked: true, landBusy: false })).toEqual({ ok: true });
  });
});
