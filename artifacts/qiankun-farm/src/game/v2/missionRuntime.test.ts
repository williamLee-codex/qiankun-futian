import { describe, expect, it } from 'vitest';
import {
  claimMissionReward,
  createMissionState,
  recordMissionEvent,
  rollMissionPeriods,
} from './missionRuntime';

const ts = (iso: string) => Date.parse(iso);

describe('Farm V2 mission runtime', () => {
  it('matches all eight FINAL mission titles and fixed reward values', async () => {
    const { FARM_V2_MISSIONS } = await import('./missionRuntime');
    expect(FARM_V2_MISSIONS.map(mission => [mission.id, mission.title, mission.reward.coins, mission.reward.materialId, mission.reward.materialQuantity])).toEqual([
      ['MISSION_D01', '今日播種', 2, '蘊靈砂', 1],
      ['MISSION_D02', '今日收成', 3, '蘊靈砂', 1],
      ['MISSION_D03', '福田交易', 3, '蘊靈砂', 1],
      ['MISSION_D04', '今日福田全勤', 5, '蘊靈砂', 3],
      ['MISSION_W01', '耕耘不輟', 10, '九霄玉髓', 1],
      ['MISSION_W02', '靈植豐收', 15, '九霄玉髓', 1],
      ['MISSION_W03', '福田通商', 15, '九霄玉髓', 1],
      ['MISSION_W04', '七日福田', 20, '九霄玉髓', 1],
    ]);
  });

  it('completes daily sow/harvest/exchange and then daily full attendance', () => {
    const now = ts('2026-09-28T10:00:00+08:00');
    let state = createMissionState(now);
    state = recordMissionEvent(state, 'SOW', now);
    state = recordMissionEvent(state, 'HARVEST', now);
    state = recordMissionEvent(state, 'EXCHANGE', now);

    expect(state.progress.MISSION_D01.completed).toBe(true);
    expect(state.progress.MISSION_D02.completed).toBe(true);
    expect(state.progress.MISSION_D03.completed).toBe(true);
    expect(state.progress.MISSION_D04.completed).toBe(true);
  });

  it('tracks weekly targets independently from daily missions', () => {
    const now = ts('2026-09-28T10:00:00+08:00');
    let state = createMissionState(now);
    for (let i = 0; i < 10; i += 1) state = recordMissionEvent(state, 'SOW', now);
    for (let i = 0; i < 10; i += 1) state = recordMissionEvent(state, 'HARVEST', now);
    for (let i = 0; i < 5; i += 1) state = recordMissionEvent(state, 'EXCHANGE', now);

    expect(state.progress.MISSION_W01.completed).toBe(true);
    expect(state.progress.MISSION_W02.completed).toBe(true);
    expect(state.progress.MISSION_W03.completed).toBe(true);
    expect(state.progress.MISSION_W04.completed).toBe(true);
  });

  it('requires explicit claim and prevents duplicate claim', () => {
    const now = ts('2026-09-28T10:00:00+08:00');
    let state = recordMissionEvent(createMissionState(now), 'SOW', now);
    const claimed = claimMissionReward(state, 'MISSION_D01', now);

    expect(claimed.reward).toEqual({ coins: 2, materialId: '蘊靈砂', materialQuantity: 1 });
    expect(claimed.state.progress.MISSION_D01.claimed).toBe(true);
    expect(() => claimMissionReward(claimed.state, 'MISSION_D01', now))
      .toThrow('MISSION_ALREADY_CLAIMED');
  });

  it('expires unclaimed daily rewards at the next 05:00 boundary', () => {
    const before = ts('2026-09-29T04:59:59+08:00');
    let state = recordMissionEvent(createMissionState(before), 'SOW', before);
    expect(state.progress.MISSION_D01.completed).toBe(true);

    state = rollMissionPeriods(state, ts('2026-09-29T05:00:00+08:00'));
    expect(state.progress.MISSION_D01.completed).toBe(false);
    expect(state.progress.MISSION_D01.claimed).toBe(false);
    expect(state.progress.MISSION_D01.progress).toBe(0);
  });

  it('expires unclaimed weekly rewards Monday at 05:00', () => {
    const sunday = ts('2026-10-04T20:00:00+08:00');
    let state = createMissionState(sunday);
    for (let i = 0; i < 10; i += 1) state = recordMissionEvent(state, 'SOW', sunday);
    expect(state.progress.MISSION_W01.completed).toBe(true);

    state = rollMissionPeriods(state, ts('2026-10-05T05:00:00+08:00'));
    expect(state.progress.MISSION_W01.completed).toBe(false);
    expect(state.progress.MISSION_W01.progress).toBe(0);
  });

  it('daily reset does not erase current weekly progress', () => {
    const before = ts('2026-09-29T04:59:59+08:00');
    let state = recordMissionEvent(createMissionState(before), 'SOW', before);
    expect(state.progress.MISSION_W01.progress).toBe(1);

    state = rollMissionPeriods(state, ts('2026-09-29T05:00:00+08:00'));
    expect(state.progress.MISSION_D01.progress).toBe(0);
    expect(state.progress.MISSION_W01.progress).toBe(1);
  });
});
