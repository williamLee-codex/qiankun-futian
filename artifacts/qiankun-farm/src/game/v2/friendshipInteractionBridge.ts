import type { FriendshipRuntimeState } from './friendshipRuntime';
import { areMutualFriends } from './friendshipRuntime';
import type { FriendInteractionState } from './friendInteractionRuntime';

/**
 * Friendship rights are resolved at request time from the current relationship.
 * Interaction cooldown state is deliberately separate: removing/re-adding a
 * friend never clears an existing rolling 24h borrow/assist cooldown.
 */
export function resolveCurrentFriendInteractionContext(input: {
  friendships: FriendshipRuntimeState;
  actorUid: string;
  targetUid: string;
  interactionState: FriendInteractionState;
}): {
  mutualFriends: boolean;
  interactionState: FriendInteractionState;
} {
  return {
    mutualFriends: areMutualFriends(input.friendships, input.actorUid, input.targetUid),
    interactionState: input.interactionState,
  };
}
