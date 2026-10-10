import { eq } from "drizzle-orm";
import { db, farmV2PlayerStateTable } from "@workspace/db";
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
  await readAuthority(input.launchToken, input.targetId);
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
  // Explicit public projection: no warehouse, wallet, inventory IDs or RPG stats.
  return {
    ownerId: input.targetId,
    readOnly: true,
    lingyun,
    pots: state.pots
      .filter((p) => p.displayed)
      .map((p) => ({ species: p.species, grade: p.grade })),
    decor: state.decor
      .filter((d) => d.slot !== null)
      .map((d) => ({ catalogId: d.catalogId, slot: d.slot })),
    activeFormation: state.activeFormation ?? null,
  };
}
