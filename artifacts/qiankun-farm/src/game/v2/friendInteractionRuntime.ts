import { startOfFarmDay } from './timeRuntime';

export type FriendInteractionKind = 'BORROW' | 'ASSIST';

export interface FriendInteractionState {
  dayStart: number;
  borrowSuccessCount: number;
  assistSuccessCount: number;
  borrowCooldownUntilByFriend: Record<string, number>;
  assistCooldownUntilByFriend: Record<string, number>;
}

export interface FriendInteractionEligibility {
  mutualFriends: boolean;
  targetFarmerActive: boolean;
}

export const DAILY_BORROW_LIMIT = 5;
export const DAILY_ASSIST_LIMIT = 5;
export const FRIEND_INTERACTION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function createFriendInteractionState(now: number): FriendInteractionState {
  return {
    dayStart: startOfFarmDay(now),
    borrowSuccessCount: 0,
    assistSuccessCount: 0,
    borrowCooldownUntilByFriend: {},
    assistCooldownUntilByFriend: {},
  };
}

export function rollFriendDailyLimits(
  state: FriendInteractionState,
  now: number,
): FriendInteractionState {
  const dayStart = startOfFarmDay(now);
  if (dayStart === state.dayStart) return state;
  return {
    ...state,
    dayStart,
    borrowSuccessCount: 0,
    assistSuccessCount: 0,
  };
}

export function assertFriendInteractionEligible(input: {
  state: FriendInteractionState;
  kind: FriendInteractionKind;
  friendUid: string;
  now: number;
  eligibility: FriendInteractionEligibility;
}): FriendInteractionState {
  const state = rollFriendDailyLimits(input.state, input.now);

  // Canonical validation order: mutual friendship, then target farmer guard.
  if (!input.eligibility.mutualFriends) throw new Error('MUTUAL_FRIEND_REQUIRED');
  if (input.eligibility.targetFarmerActive) throw new Error('TARGET_FARMER_ACTIVE');

  if (input.kind === 'BORROW') {
    if (state.borrowSuccessCount >= DAILY_BORROW_LIMIT) throw new Error('BORROW_DAILY_LIMIT');
    if ((state.borrowCooldownUntilByFriend[input.friendUid] ?? 0) > input.now) {
      throw new Error('BORROW_FRIEND_COOLDOWN');
    }
  } else {
    if (state.assistSuccessCount >= DAILY_ASSIST_LIMIT) throw new Error('ASSIST_DAILY_LIMIT');
    if ((state.assistCooldownUntilByFriend[input.friendUid] ?? 0) > input.now) {
      throw new Error('ASSIST_FRIEND_COOLDOWN');
    }
  }
  return state;
}

/**
 * Record only a successful interaction.
 * Failed/blocked attempts must never call this function, so they consume
 * neither daily quota nor cooldown.
 */
export function recordFriendInteractionSuccess(input: {
  state: FriendInteractionState;
  kind: FriendInteractionKind;
  friendUid: string;
  now: number;
}): FriendInteractionState {
  const state = rollFriendDailyLimits(input.state, input.now);
  const cooldownUntil = input.now + FRIEND_INTERACTION_COOLDOWN_MS;

  if (input.kind === 'BORROW') {
    return {
      ...state,
      borrowSuccessCount: state.borrowSuccessCount + 1,
      borrowCooldownUntilByFriend: {
        ...state.borrowCooldownUntilByFriend,
        [input.friendUid]: cooldownUntil,
      },
    };
  }

  return {
    ...state,
    assistSuccessCount: state.assistSuccessCount + 1,
    assistCooldownUntilByFriend: {
      ...state.assistCooldownUntilByFriend,
      [input.friendUid]: cooldownUntil,
    },
  };
}
