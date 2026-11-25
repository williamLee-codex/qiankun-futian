import { describe, expect, it } from 'vitest';
import {
  assertFriendInteractionEligible,
  createFriendInteractionState,
  recordFriendInteractionSuccess,
  rollFriendDailyLimits,
} from './friendInteractionRuntime';

const ts = (iso: string) => Date.parse(iso);
const eligible = { mutualFriends: true, targetFarmerActive: false };

describe('Farm V2 friend interaction runtime', () => {
  it('tracks borrow and assist as separate daily quotas', () => {
    const now = ts('2026-09-28T10:00:00+08:00');
    let state = createFriendInteractionState(now);
    for (let i = 0; i < 5; i += 1) {
      state = recordFriendInteractionSuccess({ state, kind: 'BORROW', friendUid: `b${i}`, now });
      state = recordFriendInteractionSuccess({ state, kind: 'ASSIST', friendUid: `a${i}`, now });
    }
    expect(state.borrowSuccessCount).toBe(5);
    expect(state.assistSuccessCount).toBe(5);
    expect(() => assertFriendInteractionEligible({
      state, kind: 'BORROW', friendUid: 'b6', now, eligibility: eligible,
    })).toThrow('BORROW_DAILY_LIMIT');
    expect(() => assertFriendInteractionEligible({
      state, kind: 'ASSIST', friendUid: 'a6', now, eligibility: eligible,
    })).toThrow('ASSIST_DAILY_LIMIT');
  });

  it('uses independent 24h cooldowns for borrow and assist against the same friend', () => {
    const now = ts('2026-09-28T10:00:00+08:00');
    let state = createFriendInteractionState(now);
    state = recordFriendInteractionSuccess({ state, kind: 'BORROW', friendUid: 'friend-1', now });

    expect(() => assertFriendInteractionEligible({
      state, kind: 'BORROW', friendUid: 'friend-1', now: now + 1000, eligibility: eligible,
    })).toThrow('BORROW_FRIEND_COOLDOWN');

    expect(() => assertFriendInteractionEligible({
      state, kind: 'ASSIST', friendUid: 'friend-1', now: now + 1000, eligibility: eligible,
    })).not.toThrow();
  });

  it('resets daily quotas at 05:00 but preserves rolling 24h cooldowns', () => {
    const before = ts('2026-09-29T04:59:00+08:00');
    let state = createFriendInteractionState(before);
    state = recordFriendInteractionSuccess({ state, kind: 'BORROW', friendUid: 'friend-1', now: before });
    state = rollFriendDailyLimits(state, ts('2026-09-29T05:00:00+08:00'));

    expect(state.borrowSuccessCount).toBe(0);
    expect(() => assertFriendInteractionEligible({
      state,
      kind: 'BORROW',
      friendUid: 'friend-1',
      now: ts('2026-09-29T05:00:01+08:00'),
      eligibility: eligible,
    })).toThrow('BORROW_FRIEND_COOLDOWN');
  });

  it('requires mutual friendship before interaction', () => {
    const now = ts('2026-09-28T10:00:00+08:00');
    const state = createFriendInteractionState(now);
    expect(() => assertFriendInteractionEligible({
      state,
      kind: 'BORROW',
      friendUid: 'friend-1',
      now,
      eligibility: { mutualFriends: false, targetFarmerActive: false },
    })).toThrow('MUTUAL_FRIEND_REQUIRED');
  });

  it('blocks both interaction types when the target farmer is active', () => {
    const now = ts('2026-09-28T10:00:00+08:00');
    const state = createFriendInteractionState(now);
    for (const kind of ['BORROW', 'ASSIST'] as const) {
      expect(() => assertFriendInteractionEligible({
        state,
        kind,
        friendUid: 'friend-1',
        now,
        eligibility: { mutualFriends: true, targetFarmerActive: true },
      })).toThrow('TARGET_FARMER_ACTIVE');
    }
    expect(state.borrowSuccessCount).toBe(0);
    expect(state.assistSuccessCount).toBe(0);
  });
});
