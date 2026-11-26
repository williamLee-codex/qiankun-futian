import type { ChaosSeedState } from './chaosSeedRuntime';
import { settleChaosSeeds } from './chaosSeedRuntime';
import type { FarmAccessState } from './accessRuntime';

export function settleChaosSeedsFromAccess(input: {
  state: ChaosSeedState;
  access: FarmAccessState;
  now: number;
}): ChaosSeedState {
  return settleChaosSeeds({
    state: input.state,
    now: input.now,
    accessActive: input.access.accessActive.has(6),
  });
}
