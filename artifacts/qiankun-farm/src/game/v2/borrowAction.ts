import {
  assertFriendInteractionEligible,
  recordFriendInteractionSuccess,
  type FriendInteractionState,
} from './friendInteractionRuntime';
import {
  settleBorrow,
  type BorrowPetEffects,
  type BorrowRandomSource,
  type BorrowTarget,
} from './borrowRuntime';

export function executeBorrowAction(input: {
  interactionState: FriendInteractionState;
  friendUid: string;
  now: number;
  mutualFriends: boolean;
  targetFarmerActive: boolean;
  targets: readonly BorrowTarget[];
  pets: BorrowPetEffects;
  rng: BorrowRandomSource;
}): {
  interactionState: FriendInteractionState;
  settlement: ReturnType<typeof settleBorrow>;
} {
  const checkedState = assertFriendInteractionEligible({
    state: input.interactionState,
    kind: 'BORROW',
    friendUid: input.friendUid,
    now: input.now,
    eligibility: {
      mutualFriends: input.mutualFriends,
      targetFarmerActive: input.targetFarmerActive,
    },
  });

  const settlement = settleBorrow({
    targets: input.targets,
    now: input.now,
    pets: input.pets,
    rng: input.rng,
  });

  // No eligible crop / full Qilin block = failure: no quota, no cooldown.
  if (!settlement.successful) {
    return { interactionState: checkedState, settlement };
  }

  return {
    settlement,
    interactionState: recordFriendInteractionSuccess({
      state: checkedState,
      kind: 'BORROW',
      friendUid: input.friendUid,
      now: input.now,
    }),
  };
}
