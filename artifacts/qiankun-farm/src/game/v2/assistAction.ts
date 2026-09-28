import {
  assertFriendInteractionEligible,
  recordFriendInteractionSuccess,
  type FriendInteractionState,
} from './friendInteractionRuntime';
import { settleAssist, type AssistTarget } from './assistRuntime';

export interface AssistActionResult {
  interactionState: FriendInteractionState;
  settlement: ReturnType<typeof settleAssist>;
}

/**
 * Server transaction boundary:
 * caller must acquire/hold the target-land row lock before invoking the final
 * mutation. Owner harvest and helper assist compete for the same row; first
 * committed mutation wins. A stale/empty target must return failure and must
 * not consume assist quota/cooldown.
 */
export function executeAssistAction(input: {
  interactionState: FriendInteractionState;
  friendUid: string;
  now: number;
  mutualFriends: boolean;
  targetFarmerActive: boolean;
  target: AssistTarget;
}): AssistActionResult {
  const checkedState = assertFriendInteractionEligible({
    state: input.interactionState,
    kind: 'ASSIST',
    friendUid: input.friendUid,
    now: input.now,
    eligibility: {
      mutualFriends: input.mutualFriends,
      targetFarmerActive: input.targetFarmerActive,
    },
  });

  const settlement = settleAssist(input.target, input.now);
  if (!settlement.successful) {
    return { interactionState: checkedState, settlement };
  }

  return {
    settlement,
    interactionState: recordFriendInteractionSuccess({
      state: checkedState,
      kind: 'ASSIST',
      friendUid: input.friendUid,
      now: input.now,
    }),
  };
}
