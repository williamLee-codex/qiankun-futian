/**
 * Canonical Farm V2 runtime boundary.
 *
 * UI code must call exported domain/transaction primitives instead of
 * duplicating economy, timing, entitlement, mission, pet, friend or farmer
 * rules in components. Server persistence remains authoritative for all
 * state-changing actions.
 */
export const FARM_V2_RUNTIME_VERSION = '2.0' as const;

export const FARM_V2_AUTHORITY = {
  persistence: 'SERVER',
  clientRole: 'DISPLAY_AND_INTENT',
  canonicalSource: 'CANONICAL_MASTER',
} as const;

export function assertFarmV2MutationRequest(input: {
  requestId: string;
  actorUid: string;
}): void {
  if (!input.requestId.trim()) throw new Error('REQUEST_ID_REQUIRED');
  if (!input.actorUid.trim()) throw new Error('ACTOR_UID_REQUIRED');
}
