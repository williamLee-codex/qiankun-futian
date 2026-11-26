import { describe, expect, it } from 'vitest';
import { acceptFriendship, createFriendshipRuntimeState, requestFriendship } from './friendshipRuntime';
import { acceptFriendshipWithCapacity, getFriendCapacitySnapshot } from './friendCapacityRuntime';

describe('Farm V2 friend capacity runtime', () => {
  it('does not count pending requests as accepted friends', () => {
    const state = requestFriendship(createFriendshipRuntimeState(), 'A', 'B');
    expect(getFriendCapacitySnapshot(state, 'A')).toEqual({
      acceptedFriends: 0,
      pendingIncoming: 0,
      pendingOutgoing: 1,
    });
    expect(getFriendCapacitySnapshot(state, 'B')).toEqual({
      acceptedFriends: 0,
      pendingIncoming: 1,
      pendingOutgoing: 0,
    });
  });

  it('rechecks both capacities at acceptance time', () => {
    let state = requestFriendship(createFriendshipRuntimeState(), 'A', 'B');
    state = requestFriendship(state, 'A', 'C');
    state = acceptFriendship(state, 'A', 'C');

    expect(() => acceptFriendshipWithCapacity({
      state,
      requester: 'A',
      accepter: 'B',
      requesterCapacity: 1,
      accepterCapacity: 30,
    })).toThrow('REQUESTER_FRIEND_CAPACITY_FULL');
  });

  it('accepts when both users still have capacity', () => {
    const state = requestFriendship(createFriendshipRuntimeState(), 'A', 'B');
    const accepted = acceptFriendshipWithCapacity({
      state,
      requester: 'A',
      accepter: 'B',
      requesterCapacity: 30,
      accepterCapacity: 30,
    });
    expect(getFriendCapacitySnapshot(accepted, 'A').acceptedFriends).toBe(1);
    expect(getFriendCapacitySnapshot(accepted, 'B').acceptedFriends).toBe(1);
  });
});
