export type FarmMissionId =
  | "MISSION_D01"
  | "MISSION_D02"
  | "MISSION_D03"
  | "MISSION_D04"
  | "MISSION_W01"
  | "MISSION_W02"
  | "MISSION_W03"
  | "MISSION_W04";

const REWARD_COINS: Readonly<Record<FarmMissionId, number>> = {
  MISSION_D01: 2,
  MISSION_D02: 3,
  MISSION_D03: 3,
  MISSION_D04: 5,
  MISSION_W01: 10,
  MISSION_W02: 15,
  MISSION_W03: 15,
  MISSION_W04: 20,
};
const MISSION_IDS = new Set(Object.keys(REWARD_COINS));

export type CoreMissionRewardReceipt = {
  duplicate: boolean;
  missionId: FarmMissionId;
  amount: number;
  transactionId: string;
  transaction: Record<string, unknown>;
  wallet: Record<string, unknown>;
};

export class CoreMissionRewardError extends Error {
  constructor(
    message: string,
    readonly definitive = false,
  ) {
    super(message);
    this.name = "CoreMissionRewardError";
  }
}

export async function claimCoreFarmMissionReward(
  launchToken: string,
  missionId: FarmMissionId,
  requestId: string,
): Promise<CoreMissionRewardReceipt> {
  if (
    !MISSION_IDS.has(missionId) ||
    !/^[A-Za-z0-9._:-]{1,120}$/.test(requestId)
  )
    throw new CoreMissionRewardError("INVALID_CORE_MISSION_CLAIM", true);
  const base = process.env.PLATFORM_BASE_URL;
  const secret = process.env.REPLIT_APP_SHARED_SECRET;
  if (!base || !secret || !launchToken)
    throw new CoreMissionRewardError("CORE_MISSION_REWARD_NOT_CONFIGURED");
  const url = new URL(base);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new CoreMissionRewardError("INVALID_FARM_PLATFORM_BASE_URL");

  let response: Response;
  try {
    response = await fetch(
      new URL("/api/replit/farm-v2/mission-rewards", base),
      {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "x-replit-shared-secret": secret,
          "x-request-id": requestId,
        },
        body: JSON.stringify({ missionId, launchToken }),
        signal: AbortSignal.timeout(5_000),
      },
    );
  } catch {
    throw new CoreMissionRewardError("CORE_MISSION_REWARD_UNAVAILABLE");
  }

  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = value as { error?: unknown; definitive?: unknown } | null;
    const definitiveErrors = [
      "invalid_request",
      "identity_unavailable",
      "wallet_unavailable",
      "duplicate_conflict",
    ];
    const definitive =
      [400, 409].includes(response.status) &&
      body?.definitive === true &&
      typeof body.error === "string" &&
      definitiveErrors.includes(body.error);
    throw new CoreMissionRewardError(
      definitive
        ? `CORE_MISSION_REWARD_${String(body?.error).toUpperCase()}`
        : "CORE_MISSION_REWARD_UNAVAILABLE",
      definitive,
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CoreMissionRewardError("INVALID_CORE_MISSION_REWARD_RESPONSE");

  const body = value as Record<string, any>;
  const amount = REWARD_COINS[missionId];
  const transaction = body.transaction;
  if (
    !["created", "duplicate"].includes(body.result_status) ||
    body.mission_id !== missionId ||
    body.amount !== amount ||
    !transaction ||
    typeof transaction !== "object" ||
    Array.isArray(transaction) ||
    typeof transaction.id !== "string" ||
    !transaction.id ||
    transaction.owner_id == null ||
    transaction.amount !== amount ||
    transaction.currency !== "coin" ||
    transaction.direction !== "credit" ||
    transaction.reason !== "farm_v2_mission_reward" ||
    transaction.reference_type !== "farm_v2_mission_reward" ||
    transaction.reference_id !== missionId ||
    transaction.idempotency_key !== `farm-v2:mission-claim:${requestId}` ||
    !body.wallet ||
    typeof body.wallet !== "object" ||
    Array.isArray(body.wallet)
  )
    throw new CoreMissionRewardError("INVALID_CORE_MISSION_REWARD_RESPONSE");

  return {
    duplicate: body.result_status === "duplicate",
    missionId,
    amount,
    transactionId: transaction.id,
    transaction,
    wallet: body.wallet,
  };
}
