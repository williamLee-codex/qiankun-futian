import { and, eq, sql } from "drizzle-orm";
import { farmV2LandTable, farmV2PlayerStateTable } from "@workspace/db";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";
import { bankError } from "./farm-v2-local-coins";
import { projectCoreCoinLands } from "../../../qiankun-farm/src/game/v2/coinLandProjection";
import {
  decodeFarmAccessState,
  encodeFarmAccessState,
} from "./farm-v2-json-codecs";
import {
  farmV2LandRowToEntity,
  farmV2LandEntityToPersistence,
} from "./farm-v2-mappers";
import type { CoreCoinLand } from "./farm-v2-core-coin-land";
export function purchaseLocalCoinLand(input: {
  userId: string;
  requestId: string;
  landId: 2 | 3;
}) {
  return runFarmV2IdempotentMutation({
    userId: input.userId,
    requestId: input.requestId,
    action: `coin-land-unlock:${input.landId}`,
    execute: async (tx) => {
      try {
        await tx.execute(
          sql`select farm_v2_bank.purchase_land(${input.userId}::uuid,${input.requestId},${input.landId}::smallint)`,
        );
        const r = await tx.execute(
          sql`select farm_v2_bank.coin_land_rights(${input.userId}::uuid) as result`,
        );
        const value = r.rows[0]?.result as {
          result_status: string;
          lands: {
            landId: 2 | 3;
            historicallyUnlocked: boolean;
            accessActive: boolean;
            firstUnlockedAt: string | null;
          }[];
        };
        if (value?.result_status !== "ok")
          throw Error("CORE_COIN_LAND_UNAVAILABLE");
        const rights: CoreCoinLand[] = value.lands.map((v) => ({
          ...v,
          firstUnlockedAt: v.firstUnlockedAt
            ? Date.parse(v.firstUnlockedAt)
            : null,
        }));
        const [player] = await tx
          .select()
          .from(farmV2PlayerStateTable)
          .where(eq(farmV2PlayerStateTable.userId, input.userId));
        if (!player) throw Error("FARM_PLAYER_STATE_NOT_FOUND");
        const rows = await tx
          .select()
          .from(farmV2LandTable)
          .where(eq(farmV2LandTable.userId, input.userId))
          .orderBy(farmV2LandTable.landId);
        const next = projectCoreCoinLands(
          decodeFarmAccessState(player.accessState),
          rows.map(farmV2LandRowToEntity),
          rights,
        );
        await tx
          .update(farmV2PlayerStateTable)
          .set({
            accessState: encodeFarmAccessState(next.access),
            updatedAt: new Date(),
          })
          .where(eq(farmV2PlayerStateTable.userId, input.userId));
        for (const land of next.lands.filter(
          (l) => l.landId === 2 || l.landId === 3,
        ))
          await tx
            .update(farmV2LandTable)
            .set({
              ...farmV2LandEntityToPersistence(land),
              version: rows.find((r) => r.landId === land.landId)!.version + 1,
            })
            .where(
              and(
                eq(farmV2LandTable.userId, input.userId),
                eq(farmV2LandTable.landId, land.landId),
              ),
            );
        return {
          landId: input.landId,
          accessActive: next.access.accessActive.has(input.landId),
          historicallyUnlocked: true,
        };
      } catch (error) {
        return bankError(error);
      }
    },
  });
}
