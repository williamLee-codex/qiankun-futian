import { describe, expect, it } from 'vitest';
import {
  claimMissionReward,
  createMissionState,
  recordMissionEvent,
  rollMissionPeriods,
} from './missionRuntime';

const ts = (iso: string) => Date.parse(iso);

describe('Farm V2 mission runtime', () => {
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
