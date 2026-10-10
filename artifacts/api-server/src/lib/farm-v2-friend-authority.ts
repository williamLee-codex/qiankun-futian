import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { farmAuthorityPool, farmAuthorityLockKey } from "./farm-v2-authority";
import { farmAuthorityContext } from "./farm-v2-authority-context";
import { farmV2PlatformConnection } from "./farm-v2-platform";
export async function withFarmFriendAuthority<T>(
  input: {
    userId: string;
    targetId: string;
    requestId: string;
    launchToken: string;
    kind: "BORROW" | "ASSIST";
  },
  run: () => Promise<T>,
) {
  if (
    !/^[0-9a-f-]{36}$/i.test(input.targetId) ||
    input.userId === input.targetId ||
    !/^[A-Za-z0-9._:-]{1,120}$/.test(input.requestId)
  )
    throw new Error("INVALID_FRIEND_REQUEST");
  const operationId = randomUUID(),
    targetOperationId = randomUUID(),
    participants = [
      { userId: input.userId, operationId },
      { userId: input.targetId, operationId: targetOperationId },
    ].sort((a, b) => a.userId.localeCompare(b.userId));
  const client = await farmAuthorityPool.connect();
  client.on("error", () => {});
  let registered = false;
  async function call(phase: "begin" | "end") {
    const { base, secret } = farmV2PlatformConnection();
    const response = await fetch(
      new URL("/api/replit/farm-v2/friends/authorization", base),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-replit-shared-secret": secret,
        },
        body: JSON.stringify({
          ...input,
          userId: undefined,
          operationId,
          targetOperationId,
          phase,
        }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "MUTUAL_FRIEND_REQUIRED"
          : "FARM_FRIEND_AUTHORITY_UNAVAILABLE",
      );
    const data = (await response.json()) as {
      settled?: boolean;
      operationId?: string;
      targetOperationId?: string;
      effectivePaidCrystals?: number;
      targetPaidCrystals?: number;
    };
    if (phase === "end") {
      if (data.settled !== true)
        throw new Error("FARM_FRIEND_AUTHORITY_UNAVAILABLE");
      return data;
    }
    if (
      data.operationId !== operationId ||
      data.targetOperationId !== targetOperationId ||
      ![data.effectivePaidCrystals, data.targetPaidCrystals].every(
        (n) => Number.isSafeInteger(n) && n! >= 0 && n! <= 2147483647,
      )
    )
      throw new Error("INVALID_FRIEND_AUTHORIZATION");
    return data;
  }
  try {
    for (const p of participants)
      await client.query("select pg_advisory_lock(hashtextextended($1,0))", [
        farmAuthorityLockKey(p.userId),
      ]);
    await pool.query(
      "INSERT INTO farm_v2_authorization_attempt(id,user_id,request_id,action,state) VALUES($1,$2,$5,$6,'OPEN'),($3,$4,$5,$6,'OPEN')",
      [
        operationId,
        input.userId,
        targetOperationId,
        input.targetId,
        input.requestId,
        "FRIEND:" + input.kind,
      ],
    );
    registered = true;
    const grant = await call("begin");
    return await farmAuthorityContext.run(
      {
        operationId,
        userId: input.userId,
        qualification: grant.effectivePaidCrystals!,
        targetQualification: grant.targetPaidCrystals!,
        participants,
      },
      run,
    );
  } finally {
    try {
      if (registered) {
        await pool.query(
          "UPDATE farm_v2_authorization_attempt SET state='SETTLED',settled_at=now() WHERE id=ANY($1::uuid[]) AND state='OPEN'",
          [participants.map((p) => p.operationId)],
        );
        await call("end");
        await pool.query(
          "UPDATE farm_v2_authorization_attempt SET core_settled_at=now() WHERE id=ANY($1::uuid[])",
          [participants.map((p) => p.operationId)],
        );
      }
    } finally {
      client.release(true);
    }
  }
}
