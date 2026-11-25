import type { FarmLandEntity } from './landRuntime';
import type { FarmAccessState } from './accessRuntime';

/**
 * Applies entitlement/access state without mutating crop lifecycle.
 * Suspension therefore preserves plantedQuantity/plantedAt/maturesAt.
 */
export function applyAccessToLandEntities(
  lands: readonly FarmLandEntity[],
  access: FarmAccessState,
): FarmLandEntity[] {
  return lands.map((land) => {
    const active = access.accessActive.has(land.landId);
    if (active) {
      return {
        ...land,
        accessActive: true,
        lifecycle: land.lifecycle === 'LOCKED' ? 'EMPTY' : land.lifecycle,
      };
    }

    // Never erase a planted/mature lifecycle because a paid entitlement was suspended.
    // LOCKED is only the visual/action state for an otherwise empty inaccessible land.
    return {
      ...land,
      accessActive: false,
      lifecycle: land.lifecycle === 'EMPTY' ? 'LOCKED' : land.lifecycle,
    };
  });
}
