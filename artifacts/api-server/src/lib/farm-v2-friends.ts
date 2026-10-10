import { reconcileMilestonePets } from "../../../qiankun-farm/src/game/v2/petRuntime";
import { decodeFarmPetState, encodeFarmPetState } from "./farm-v2-json-codecs";
function publicPets(value: unknown, qualification: number, now: number) {
  const state = Array.isArray((value as { owned?: unknown })?.owned)
    ? decodeFarmPetState(value)
    : { owned: new Set<never>(), activePetId: null, activeUntil: null };
  const active = reconcileMilestonePets({
    state,
    effectivePaidCrystals: qualification,
    now,
  });
  return {
    owned: [...active.owned],
    activePetId: active.activePetId,
    activeUntil: active.activeUntil,
  };
}
import { eq } from "drizzle-orm";
import { db, farmV2PlayerStateTable, farmV2LandTable } from "@workspace/db";
import { farmV2PlatformConnection } from "./farm-v2-platform";
import {
  workshopPublicState,
  settleWorkshopTimedRights,
  type WorkshopWarehouse,
} from "../../../qiankun-farm/src/game/v2/workshopRuntime";
async function readAuthority(launchToken: string, targetId?: string) {
  const { base, secret } = farmV2PlatformConnection();
  const response = await fetch(new URL("/api/replit/farm-v2/friends", base), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-replit-shared-secret": secret,
    },
    body: JSON.stringify({ launchToken, ...(targetId ? { targetId } : {}) }),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "FRIEND_NOT_ALLOWED"
        : "FRIEND_AUTHORITY_UNAVAILABLE",
    );
  const data = (await response.json()) as {
    allowed?: boolean;
    targetPaidCrystals?: number;
    friends?: { id: string }[];
  };
  if (targetId && data.allowed !== true) throw new Error("FRIEND_NOT_ALLOWED");
  if (!targetId && !Array.isArray(data.friends))
    throw new Error("FRIEND_AUTHORITY_UNAVAILABLE");
  return data;
}
export function readFarmV2Friends(launchToken: string) {
  return readAuthority(launchToken);
}
export async function visitFarmV2Cave(input: {
  launchToken: string;
  targetId: string;
}) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.targetId,
    )
  )
    throw new Error("INVALID_FRIEND_REQUEST");
  const grant = await readAuthority(input.launchToken, input.targetId);
  if (
    !Number.isSafeInteger(grant.targetPaidCrystals) ||
    grant.targetPaidCrystals! < 0
  )
    throw new Error("FRIEND_AUTHORITY_UNAVAILABLE");
  const [player] = await db
    .select()
    .from(farmV2PlayerStateTable)
    .where(eq(farmV2PlayerStateTable.userId, input.targetId));
  if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
  const { state, lingyun } = workshopPublicState(
    settleWorkshopTimedRights(
      player.warehouseState as WorkshopWarehouse,
      Date.now(),
    ),
  );
  const rows = await db
    .select()
    .from(farmV2LandTable)
    .where(eq(farmV2LandTable.userId, input.targetId))
    .orderBy(farmV2LandTable.landId);
  // Explicit public projection: no warehouse, wallet, inventory IDs or RPG stats.
  return {
    ownerId: input.targetId,
    readOnly: true,
    lands: rows.map((row) => ({
      landId: row.landId,
      lifecycle: row.lifecycle,
      accessActive:
        row.accessActive &&
        (row.landId < 4 ||
          grant.targetPaidCrystals! >=
            (row.landId === 4 ? 100 : row.landId === 5 ? 300 : 600)),
      plantedQuantity: row.plantedQuantity,
      maturesAt: row.maturesAt?.toISOString() ?? null,
    })),
    pets: publicPets(player.petState, grant.targetPaidCrystals!, Date.now()),
    lingyun,
    pots: state.pots
      .filter((p) => p.displayed)
      .map((p) => ({ species: p.species, grade: p.grade })),
    decor: state.decor
      .filter((d) => d.slot !== null)
      .map((d) => ({ catalogId: d.catalogId, slot: d.slot })),
    activeFormation: state.activeFormation ?? null,
    activeFormationExpiresAt:
      state.formations?.find((f) => f.id === state.activeFormation)
        ?.expiresAt ?? null,
  };
}
