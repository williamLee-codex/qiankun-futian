import type { FarmAccessState } from "./accessRuntime";
import type { FarmLandEntity } from "./landRuntime";
export type CoreCoinLandProjectionRecord = {
  landId: 2 | 3;
  historicallyUnlocked: boolean;
  accessActive: boolean;
  firstUnlockedAt: number | null;
};
export function projectCoreCoinLands(
  access: FarmAccessState,
  lands: readonly FarmLandEntity[],
  rights: readonly CoreCoinLandProjectionRecord[],
) {
  if (
    lands.length !== 6 ||
    rights.length !== 2 ||
    new Set(rights.map((r) => r.landId)).size !== 2
  )
    throw new Error("INVALID_CORE_COIN_LAND_SNAPSHOT");
  const nextAccess: FarmAccessState = {
    ...access,
    historicallyUnlocked: new Set(access.historicallyUnlocked),
    accessActive: new Set(access.accessActive),
    firstUnlockedAt: { ...access.firstUnlockedAt },
  };
  const history = nextAccess.historicallyUnlocked as Set<2 | 3>,
    active = nextAccess.accessActive as Set<2 | 3>;
  for (const right of rights) {
    if (
      (right.landId !== 2 && right.landId !== 3) ||
      (right.accessActive && !right.historicallyUnlocked) ||
      (right.historicallyUnlocked && right.firstUnlockedAt === null)
    )
      throw new Error("INVALID_CORE_COIN_LAND_SNAPSHOT");
    if (history.has(right.landId) && !right.historicallyUnlocked)
      throw new Error("CORE_COIN_LAND_HISTORY_CONFLICT");
    if (right.historicallyUnlocked) {
      const old = nextAccess.firstUnlockedAt[right.landId];
      if (old !== undefined && old !== right.firstUnlockedAt)
        throw new Error("CORE_COIN_LAND_HISTORY_CONFLICT");
      history.add(right.landId);
      nextAccess.firstUnlockedAt[right.landId] = right.firstUnlockedAt!;
    }
    if (right.accessActive) active.add(right.landId);
    else active.delete(right.landId);
  }
  return {
    access: nextAccess,
    lands: lands.map((land) => {
      const right = rights.find((r) => r.landId === land.landId);
      if (!right) return { ...land };
      return {
        ...land,
        accessActive: right.accessActive,
        lifecycle:
          land.lifecycle === "LOCKED" && right.accessActive
            ? ("EMPTY" as const)
            : land.lifecycle,
      };
    }),
  };
}
