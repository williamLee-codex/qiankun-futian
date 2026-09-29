import { describe, expect, it } from 'vitest';
import {
  acceptFriendship,
  createFriendshipRuntimeState,
  removeFriendship,
  requestFriendship,
} from './friendshipRuntime';
import {
  createFriendInteractionState,
  recordFriendInteractionSuccess,
} from './friendInteractionRuntime';
import { resolveCurrentFriendInteractionContext } from './friendshipInteractionBridge';

describe('Farm V2 friendship interaction bridge', () => {
  it('removal drops rights but preserves existing cooldown state', () => {
    const now = Date.UTC(2026, 8, 30, 0, 0, 0);
    let friendships = requestFriendship(createFriendshipRuntimeState(), 'A', 'B');
    friendships = acceptFriendship(friendships, 'A', 'B');

    let interactions = createFriendInteractionState(now);
    interactions = recordFriendInteractionSuccess({
      state: interactions,
      kind: 'BORROW',
      friendUid: 'B',
      now,
    });

    friendships = removeFriendship(friendships, 'A', 'B');
    const context = resolveCurrentFriendInteractionContext({
      friendships,
      actorUid: 'A',
      targetUid: 'B',
      interactionState: interactions,
    });

    expect(context.mutualFriends).toBe(false);
    expect(context.interactionState.borrowCooldownUntilByFriend.B).toBe(
      now + 24 * 60 * 60 * 1000,
    );
  });

  it('re-adding a friend does not erase the previous cooldown', () => {
    const now = Date.UTC(2026, 8, 30, 0, 0, 0);
    let friendships = requestFriendship(createFriendshipRuntimeState(), 'A', 'B');
    friendships = acceptFriendship(friendships, 'A', 'B');
    friendships = removeFriendship(friendships, 'A', 'B');
    friendships = requestFriendship(friendships, 'A', 'B');
    friendships = acceptFriendship(friendships, 'A', 'B');

    let interactions = createFriendInteractionState(now);
    interactions = recordFriendInteractionSuccess({
      state: interactions,
      kind: 'ASSIST',
      friendUid: 'B',
      now,
    });

    const context = resolveCurrentFriendInteractionContext({
      friendships,
      actorUid: 'A',
      targetUid: 'B',
      interactionState: interactions,
    });
    expect(context.mutualFriends).toBe(true);
    expect(context.interactionState.assistCooldownUntilByFriend.B).toBeGreaterThan(now);
  });
});
