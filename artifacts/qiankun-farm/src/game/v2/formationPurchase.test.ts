import { describe, expect, it } from 'vitest';
import { planFormationMutation, workshopState } from './workshopRuntime';
import type { WorkshopWarehouse } from './workshopRuntime';
import { emptyFarmQuantities } from './warehouseRuntime';
import { applyGrowthSpeed, formationBonuses } from './formationEffects';
import {
  PREMIUM_FORMATION_ID,
  PREMIUM_FORMATION_PRICE_CRYSTALS,
} from './formationCatalog';

const NOW = Date.UTC(2026, 10, 22, 4, 0, 0);

function emptyWarehouse(): WorkshopWarehouse {
  return { seeds: emptyFarmQuantities(), crops: emptyFarmQuantities() };
}

describe('FORMATION-PREMIUM-001 purchase and ownership', () => {
  it('charges the canonical 388 crystals once and keeps ownership permanent', () => {
    const plan = planFormationMutation(emptyWarehouse(), { kind: 'buyFormation' }, NOW);
    expect(plan.cost).toBe(PREMIUM_FORMATION_PRICE_CRYSTALS);
    expect(plan.cost).toBe(388);
    expect(plan.referenceId).toBe(PREMIUM_FORMATION_ID);
    const state = workshopState(plan.warehouse);
    expect(state.formations).toEqual([
      { id: PREMIUM_FORMATION_ID, expiresAt: null },
    ]);
    // No automatic activation: the player equips it explicitly.
    expect(state.activeFormation ?? null).toBeNull();
  });

  it('rejects a second purchase instead of charging again', () => {
    const bought = planFormationMutation(
      emptyWarehouse(),
      { kind: 'buyFormation' },
      NOW,
    ).warehouse;
    expect(() =>
      planFormationMutation(bought, { kind: 'buyFormation' }, NOW + 1),
    ).toThrow('FORMATION_ALREADY_OWNED');
  });

  it('equips, switches off and refuses unowned formations for free', () => {
    const bought = planFormationMutation(
      emptyWarehouse(),
      { kind: 'buyFormation' },
      NOW,
    ).warehouse;
    const equipped = planFormationMutation(
      bought,
      { kind: 'switchFormation', formationId: PREMIUM_FORMATION_ID },
      NOW + 1,
    );
    expect(equipped.cost).toBe(0);
    expect(workshopState(equipped.warehouse).activeFormation).toBe(
      PREMIUM_FORMATION_ID,
    );

    const off = planFormationMutation(
      equipped.warehouse,
      { kind: 'switchFormation', formationId: null },
      NOW + 2,
    );
    expect(off.cost).toBe(0);
    expect(workshopState(off.warehouse).activeFormation).toBeNull();

    expect(() =>
      planFormationMutation(
        bought,
        { kind: 'switchFormation', formationId: 'FORMATION_FESTIVAL_X' },
        NOW + 3,
      ),
    ).toThrow('FORMATION_NOT_OWNED');
  });

  it('drops expired timed rights and clears their active slot', () => {
    const warehouse: WorkshopWarehouse = {
      ...emptyWarehouse(),
      workshop: {
        pots: [],
        decor: [],
        potGallery: {},
        decorGallery: {},
        materials: { 蘊靈砂: 0, 九霄玉髓: 0 },
        formations: [
          { id: 'FORMATION_ATTEND_1', expiresAt: NOW - 1 },
          { id: PREMIUM_FORMATION_ID, expiresAt: null },
        ],
        activeFormation: 'FORMATION_ATTEND_1',
      },
    };
    const plan = planFormationMutation(
      warehouse,
      { kind: 'switchFormation', formationId: null },
      NOW,
    );
    const state = workshopState(plan.warehouse);
    expect(state.formations).toEqual([
      { id: PREMIUM_FORMATION_ID, expiresAt: null },
    ]);
    expect(state.activeFormation).toBeNull();
  });

  it('keeps ownership and benefits across a re-login round trip', () => {
    const bought = planFormationMutation(
      emptyWarehouse(),
      { kind: 'buyFormation' },
      NOW,
    ).warehouse;
    const equipped = planFormationMutation(
      bought,
      { kind: 'switchFormation', formationId: PREMIUM_FORMATION_ID },
      NOW,
    ).warehouse;

    // Persisted warehouse state is JSON in PostgreSQL; simulate a fresh login.
    const reloaded = JSON.parse(JSON.stringify(equipped)) as WorkshopWarehouse;
    expect(workshopState(reloaded).formations).toEqual([
      { id: PREMIUM_FORMATION_ID, expiresAt: null },
    ]);
    expect(workshopState(reloaded).activeFormation).toBe(PREMIUM_FORMATION_ID);
    const later = NOW + 400 * 86400000;
    expect(formationBonuses(reloaded, later).growthSpeed).toEqual({
      numerator: 120,
      denominator: 100,
    });
    expect(
      applyGrowthSpeed(4 * 3600_000, formationBonuses(reloaded, later)),
    ).toBe(3 * 3600_000 + 20 * 60_000);
  });

  it('grants no benefit before the formation is equipped', () => {
    const bought = planFormationMutation(
      emptyWarehouse(),
      { kind: 'buyFormation' },
      NOW,
    ).warehouse;
    expect(formationBonuses(bought, NOW).harvestYield).toEqual({
      numerator: 1,
      denominator: 1,
    });
  });
});
