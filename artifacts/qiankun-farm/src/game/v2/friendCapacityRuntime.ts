import type { FriendshipRuntimeState } from './friendshipRuntime';
import { acceptFriendship, getFriendship } from './friendshipRuntime';

export interface FriendCapacitySnapshot {
  acceptedFriends: number;
  pendingIncoming: number;
  pendingOutgoing: number;
}

export function getFriendCapacitySnapshot(
  state: FriendshipRuntimeState,
  userId: string,
): FriendCapacitySnapshot {
  let acceptedFriends = 0;
  let pendingIncoming = 0;
  let pendingOutgoing = 0;

  for (const record of state.records) {
    if (record.status === 'ACCEPTED' && (record.userA === userId || record.userB === userId)) {
      acceptedFriends += 1;
    } else if (record.status === 'PENDING') {
      if (record.userB === userId) pendingIncoming += 1;
      if (record.userA === userId) pendingOutgoing += 1;
    }
  }

  return { acceptedFriends, pendingIncoming, pendingOutgoing };
}

/**
 * Acceptance rechecks both users' current capacities. Capacity is supplied by
 * the caller from the current six displayed pots; pending requests grant no
 * rights and do not reserve capacity.
 */
export function acceptFriendshipWithCapacity(input: {
  state: FriendshipRuntimeState;
  requester: string;
  accepter: string;
  requesterCapacity: number;
  accepterCapacity: number;
}): FriendshipRuntimeState {
  const existing = getFriendship(input.state, input.requester, input.accepter);
  if (!existing || existing.status !== 'PENDING') throw new Error('FRIEND_REQUEST_NOT_PENDING');

  const requester = getFriendCapacitySnapshot(input.state, input.requester);
  const accepter = getFriendCapacitySnapshot(input.state, input.accepter);

  if (requester.acceptedFriends >= input.requesterCapacity) {
    throw new Error('REQUESTER_FRIEND_CAPACITY_FULL');
  }
  if (accepter.acceptedFriends >= input.accepterCapacity) {
    throw new Error('ACCEPTER_FRIEND_CAPACITY_FULL');
  }

  return acceptFriendship(input.state, input.requester, input.accepter);
}
