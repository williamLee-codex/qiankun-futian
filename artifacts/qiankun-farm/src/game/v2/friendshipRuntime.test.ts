import { describe, expect, it } from 'vitest';
import {
  acceptFriendship,
  areMutualFriends,
  blockFriendship,
  cancelPendingFriendship,
  rejectPendingFriendship,
  createFriendshipRuntimeState,
  removeFriendship,
  requestFriendship,
} from './friendshipRuntime';

describe('Farm V2 friendship runtime', () => {
  it('grants mutual rights only after acceptance', () => {
    let state = requestFriendship(createFriendshipRuntimeState(), 'A', 'B');
    expect(areMutualFriends(state, 'A', 'B')).toBe(false);
    state = acceptFriendship(state, 'A', 'B');
    expect(areMutualFriends(state, 'A', 'B')).toBe(true);
    expect(areMutualFriends(state, 'B', 'A')).toBe(true);
  });

  it('removal immediately removes friendship rights', () => {
    let state = requestFriendship(createFriendshipRuntimeState(), 'A', 'B');
    state = acceptFriendship(state, 'A', 'B');
    state = removeFriendship(state, 'B', 'A');
    expect(areMutualFriends(state, 'A', 'B')).toBe(false);
  });

  it('allows requester cancellation and later re-request', () => {
    let state = requestFriendship(createFriendshipRuntimeState(), 'A', 'B');
    state = cancelPendingFriendship(state, 'A', 'B');
    state = requestFriendship(state, 'A', 'B');
    expect(areMutualFriends(state, 'A', 'B')).toBe(false);
  });

  it('allows target rejection without granting rights', () => {
    let state = requestFriendship(createFriendshipRuntimeState(), 'A', 'B');
    state = rejectPendingFriendship(state, 'A', 'B');
    expect(areMutualFriends(state, 'A', 'B')).toBe(false);
  });

  it('block prevents a new request', () => {
    const state = blockFriendship(createFriendshipRuntimeState(), 'A', 'B');
    expect(() => requestFriendship(state, 'B', 'A')).toThrow('FRIENDSHIP_BLOCKED');
  });
});
