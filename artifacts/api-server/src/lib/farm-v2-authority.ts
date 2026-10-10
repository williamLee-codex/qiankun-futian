import { randomUUID } from "node:crypto";
import { createDatabaseConnection, pool } from "@workspace/db";
import { farmV2PlatformConnection } from "./farm-v2-platform";
import { farmAuthorityContext } from "./farm-v2-authority-context";
export const { pool: farmAuthorityPool } = createDatabaseConnection({
  max: 1,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 5000,
  allowExitOnIdle: true,
});
export const farmAuthorityLockKey = (userId: string) =>
  "farm-v2-authority:" + userId;
async function callAuthority(
  input: {
    userId: string;
    launchToken: string;
    operationId: string;
    requestId: string;
    action: string;
  },
  phase: "begin" | "end",
) {
  const { base, secret } = farmV2PlatformConnection();
  const response = await fetch(
    new URL("/api/replit/farm-v2/authorization", base),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-replit-shared-secret": secret,
      },
      body: JSON.stringify({
        launchToken: input.launchToken,
        operationId: input.operationId,
        requestId: input.requestId,
        action: input.action,
        phase,
      }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    },
  );
  const data = (await response.json().catch(() => null)) as {
    settled?: boolean;
    operationId?: string;
    effectivePaidCrystals?: number;
  } | null;
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "FARM_SESSION_NOT_ACTIVE"
        : "FARM_PAID_AUTHORITY_UNAVAILABLE",
    );
  if (phase === "end") {
    if (data?.settled !== true)
      throw new Error("FARM_PAID_AUTHORITY_UNAVAILABLE");
    return 0;
  }
  if (
    data?.operationId !== input.operationId ||
    !Number.isSafeInteger(data.effectivePaidCrystals) ||
    (data.effectivePaidCrystals ?? -1) < 0 ||
    (data.effectivePaidCrystals ?? Infinity) > 2147483647
  )
    throw new Error("INVALID_FARM_PAID_AUTHORIZATION");
  return data.effectivePaidCrystals as number;
}
/** No lease expiry: only a proven local settlement/fence releases the Core refund barrier. */
export async function withFarmAuthority<T>(
  input: {
    userId: string;
    launchToken: string;
    requestId: string;
    action: string;
  },
  run: () => Promise<T>,
) {
  const client = await farmAuthorityPool.connect();
  client.on("error", () => {
    /* Core barrier remains until local fencing/settlement. */
  });
  const operationId = randomUUID();
  let registered = false;
  try {
    await client.query("select pg_advisory_lock(hashtextextended($1,0))", [
      farmAuthorityLockKey(input.userId),
    ]);
    await pool.query(
      "insert into farm_v2_authorization_attempt(id,user_id,request_id,action,state) values($1,$2,$3,$4,'OPEN')",
      [operationId, input.userId, input.requestId, input.action],
    );
    registered = true;
    const qualification = await callAuthority(
      { ...input, operationId },
      "begin",
    );
    return await farmAuthorityContext.run(
      { operationId, userId: input.userId, qualification },
      run,
    );
  } finally {
    try {
      if (registered) {
        // Every awaited domain transaction has committed/rolled back at this point.
        await pool.query(
          "update farm_v2_authorization_attempt set state='SETTLED',settled_at=now() where id=$1 and state='OPEN'",
          [operationId],
        );
        await callAuthority({ ...input, operationId }, "end");
        await pool.query(
          "update farm_v2_authorization_attempt set core_settled_at=now() where id=$1",
          [operationId],
        );
      }
    } finally {
      // Destroy rather than pooling a connection that might retain a session lock.
      client.release(true);
    }
  }
}
