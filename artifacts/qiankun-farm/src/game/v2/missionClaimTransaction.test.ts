import { describe, expect, it } from 'vitest';
import { createMissionState, recordMissionEvent } from './missionRuntime';
import {
  createEmptyFarmMaterialInventory,
  executeMissionClaimTransaction,
} from './missionClaimTransaction';

describe('Farm V2 mission claim transaction', () => {
  it('credits coins and materials atomically after a valid manual claim', () => {
    const now = Date.parse('2026-09-28T10:00:00+08:00');
    const missions = recordMissionEvent(createMissionState(now), 'SOW', now);

    const result = executeMissionClaimTransaction({
      missions,
      wallet: { coins: 10, crystals: 5 },
      materials: createEmptyFarmMaterialInventory(),
      missionId: 'MISSION_D01',
      now,
    });

    expect(result.wallet).toEqual({ coins: 12, crystals: 5 });
    expect(result.materials.蘊靈砂).toBe(1);
    expect(result.missions.progress.MISSION_D01.claimed).toBe(true);
  });

  it('cannot credit a reward twice', () => {
    const now = Date.parse('2026-09-28T10:00:00+08:00');
    const missions = recordMissionEvent(createMissionState(now), 'SOW', now);
    const first = executeMissionClaimTransaction({
      missions,
      wallet: { coins: 0, crystals: 0 },
      materials: createEmptyFarmMaterialInventory(),
      missionId: 'MISSION_D01',
      now,
    });

    expect(() => executeMissionClaimTransaction({
      missions: first.missions,
      wallet: first.wallet,
      materials: first.materials,
      missionId: 'MISSION_D01',
      now,
    })).toThrow('MISSION_ALREADY_CLAIMED');
  });
});
