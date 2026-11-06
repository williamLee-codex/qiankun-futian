import { measureFarmV2Stage } from "./farm-v2-stage-timing";
import { farmV2PlatformFetch } from "./farm-v2-platform-fetch";
import { randomUUID } from "node:crypto";
import { createDatabaseConnection } from "@workspace/db";
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
  let response: Response;
  try {
    response = await farmV2PlatformFetch(
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
  } catch (error) {
    // Distinguish a transport/OIDC failure from an HTTP response without exposing secrets.
    try {
      console.error(JSON.stringify({
        code: "FARM_AUTHORITY_CORE_TRANSPORT_FAILURE",
        traceId: input.operationId,
        phase,
      }));
    } catch { /* Logging must not replace the original failure. */ }
    throw error;
  }
  const data = (await response.json().catch(() => null)) as {
    settled?: boolean;
    operationId?: string;
    effectivePaidCrystals?: number;
  } | null;
  if (!response.ok) {
    // The HTTP status distinguishes a Core 503 from an upstream timeout or DB failure.
    // Never log the launch token, request ID, response body, or shared secret.
    try {
      console.error(JSON.stringify({
        code: "FARM_AUTHORITY_CORE_HTTP_FAILURE",
        traceId: input.operationId,
        phase,
        status: Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
          ? response.status : 0,
      }));
    } catch { /* Logging must never replace the authorization failure. */ }
    throw new Error(
      response.status === 401
        ? "FARM_SESSION_NOT_ACTIVE"
        : "FARM_PAID_AUTHORITY_UNAVAILABLE",
    );
  }
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
  // Internal per-operation correlation ID; no user, token or request ID in logs.
  const operationId = randomUUID();
  const client = await measureFarmV2Stage("authority_connect", () => farmAuthorityPool.connect(), operationId);
  client.on("error", () => {
    /* Core barrier remains until local fencing/settlement. */
  });
  let registered = false;
  let originalFailure = false;
  try {
    await measureFarmV2Stage("authority_lock", () => client.query("select pg_advisory_lock(hashtextextended($1,0))", [
      farmAuthorityLockKey(input.userId),
    ]), operationId);
    await measureFarmV2Stage("authority_register", () => client.query(
      "insert into farm_v2_authorization_attempt(id,user_id,request_id,action,state) values($1,$2,$3,$4,'OPEN')",
      [operationId, input.userId, input.requestId, input.action],
    ), operationId);
    registered = true;
    const qualification = await measureFarmV2Stage("authority_begin", () => callAuthority(
      { ...input, operationId },
      "begin",
    ), operationId);
    return await farmAuthorityContext.run(
      { operationId, userId: input.userId, qualification },
      run,
    );
  } catch (error) {
    originalFailure = true;
    throw error;
  } finally {
    try {
      if (registered) {
        // Every awaited domain transaction has committed/rolled back at this point.
        await client.query(
          "update farm_v2_authorization_attempt set state='SETTLED',settled_at=now() where id=$1 and state='OPEN'",
          [operationId],
        );
        await measureFarmV2Stage("authority_end", async () => {
          // Core end is idempotent by operationId. Retry once for a lost response
          // or a transient Core failure; never retry a revoked session.
          try {
            await callAuthority({ ...input, operationId }, "end");
          } catch (error) {
            if (error instanceof Error && error.message === "FARM_SESSION_NOT_ACTIVE") throw error;
            await callAuthority({ ...input, operationId }, "end");
          }
        }, operationId);
        await client.query(
          "update farm_v2_authorization_attempt set core_settled_at=now() where id=$1",
          [operationId],
        );
      }
    } catch (cleanupFailure) {
      if (!originalFailure) throw cleanupFailure;
      // Log only a correlation ID and safe SQLSTATE; never log the token or error message.
      try {
        const sqlstate = cleanupFailure && typeof cleanupFailure === "object" && "code" in cleanupFailure
          && typeof cleanupFailure.code === "string" && /^[0-9A-Z]{5}$/.test(cleanupFailure.code)
          ? cleanupFailure.code : undefined;
        console.error(JSON.stringify({
          code: "FARM_AUTHORITY_CLEANUP_FAILED",
          traceId: operationId,
          ...(sqlstate ? { sqlstate } : {}),
        }));
      } catch { /* Logging must never replace the primary failure. */ }
    } finally {
      // Destroy rather than pooling a connection that might retain a session lock.
      client.release(true);
    }
  }
}
