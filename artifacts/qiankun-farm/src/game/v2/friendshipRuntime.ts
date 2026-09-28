export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'REMOVED' | 'BLOCKED';

export interface FriendshipRecord {
  userA: string;
  userB: string;
  status: FriendshipStatus;
}

export interface FriendshipRuntimeState {
  records: readonly FriendshipRecord[];
}

function pairMatches(record: FriendshipRecord, a: string, b: string): boolean {
  return (record.userA === a && record.userB === b) ||
    (record.userA === b && record.userB === a);
}

export function createFriendshipRuntimeState(): FriendshipRuntimeState {
  return { records: [] };
}

export function getFriendship(
  state: FriendshipRuntimeState,
  a: string,
  b: string,
): FriendshipRecord | null {
  return state.records.find((record) => pairMatches(record, a, b)) ?? null;
}

export function areMutualFriends(state: FriendshipRuntimeState, a: string, b: string): boolean {
  return getFriendship(state, a, b)?.status === 'ACCEPTED';
}

export function requestFriendship(
  state: FriendshipRuntimeState,
  requester: string,
  target: string,
): FriendshipRuntimeState {
  if (!requester || !target || requester === target) throw new Error('INVALID_FRIEND_REQUEST');
  const existing = getFriendship(state, requester, target);
  if (existing?.status === 'BLOCKED') throw new Error('FRIENDSHIP_BLOCKED');
  if (existing?.status === 'PENDING' || existing?.status === 'ACCEPTED') {
    throw new Error('FRIENDSHIP_ALREADY_EXISTS');
  }

  const records = state.records.filter((record) => !pairMatches(record, requester, target));
  return { records: [...records, { userA: requester, userB: target, status: 'PENDING' }] };
}

export function acceptFriendship(
  state: FriendshipRuntimeState,
  requester: string,
  accepter: string,
): FriendshipRuntimeState {
  const existing = getFriendship(state, requester, accepter);
  if (!existing || existing.status !== 'PENDING' || existing.userA !== requester || existing.userB !== accepter) {
    throw new Error('FRIEND_REQUEST_NOT_PENDING');
  }

  return {
    records: state.records.map((record) =>
      record === existing ? { ...record, status: 'ACCEPTED' as const } : record),
  };
}

export function removeFriendship(
  state: FriendshipRuntimeState,
  a: string,
  b: string,
): FriendshipRuntimeState {
  const existing = getFriendship(state, a, b);
  if (!existing || existing.status !== 'ACCEPTED') throw new Error('NOT_FRIENDS');
  return {
    records: state.records.map((record) =>
      record === existing ? { ...record, status: 'REMOVED' as const } : record),
  };
}

export function blockFriendship(
  state: FriendshipRuntimeState,
  blocker: string,
  blocked: string,
): FriendshipRuntimeState {
  if (!blocker || !blocked || blocker === blocked) throw new Error('INVALID_BLOCK');
  const records = state.records.filter((record) => !pairMatches(record, blocker, blocked));
  return { records: [...records, { userA: blocker, userB: blocked, status: 'BLOCKED' }] };
}
