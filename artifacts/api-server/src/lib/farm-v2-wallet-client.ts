import { farmAuthorityContext } from "./farm-v2-authority-context";
type FarmWalletCurrency = "coin" | "crystal";
type FarmWalletDirection = "credit" | "debit";

export type FarmWalletMutationInput = {
  userId: string;
  amount: number;
  currency: FarmWalletCurrency;
  direction: FarmWalletDirection;
  launchToken: string;
  reason: string;
  referenceId: string;
  referenceType: string;
  requestId: string;
  idempotencySuffix?: string;
  originalTransactionId?: string;
};

export type FarmWalletMutationResult = {
  duplicate: boolean;
  transaction: {
    id: string;
    ownerId: string;
    amount: number;
    currency: string;
    direction: string;
    reason: string;
    referenceId: string;
    referenceType: string;
    idempotencyKey: string;
    reversalOf: string | null;
    walletId: string;
  };
  wallet: { id: string; ownerId: string };
};

export async function mutateFarmV2Wallet(
  input: FarmWalletMutationInput,
): Promise<FarmWalletMutationResult> {
  // Defense in depth: Farm may only request its frozen economy operations.
  // Core must independently authorize the user and enforce idempotency.
  const allowed =
    (input.reason === "farm_seed_purchase" &&
      input.referenceType === "farm_seed_pack" &&
      input.currency === "coin" &&
      input.direction === "debit") ||
    (input.reason === "farm_crop_exchange" &&
      input.referenceType === "farm_crop_exchange" &&
      input.direction === "credit" &&
      (input.currency === "coin" || input.currency === "crystal")) ||
    ([
      "farm_pot_synthesis",
      "farm_decor_purchase",
      "farm_mission_reward",
      "farm_pet_food_purchase",
    ].includes(input.reason) &&
      input.referenceType === input.reason &&
      input.currency === "coin") ||
    (["farm_pet_purchase", "farm_formation_purchase"].includes(input.reason) &&
      input.referenceType === input.reason &&
      input.direction === "debit") ||
    (input.reason === "farm_wallet_compensation" &&
      input.referenceType === "farm_wallet_compensation" &&
      input.idempotencySuffix === "compensation" &&
      Boolean(input.originalTransactionId));
  if (
    !allowed ||
    !input.userId?.trim() ||
    !/^[A-Za-z0-9._:-]{1,120}$/.test(input.requestId) ||
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0 ||
    input.amount > 2147483647 ||
    (input.idempotencySuffix !== undefined &&
      input.idempotencySuffix !== "compensation")
  ) {
    throw new Error("INVALID_FARM_WALLET_OPERATION");
  }
  const platformBaseUrl = process.env.PLATFORM_BASE_URL;
  const sharedSecret = process.env.REPLIT_APP_SHARED_SECRET;
  if (!platformBaseUrl || !sharedSecret || !input.launchToken) {
    throw new Error("FARM_WALLET_BRIDGE_NOT_CONFIGURED");
  }
  const base = new URL(platformBaseUrl);
  if (
    (base.protocol !== "https:" &&
      !(
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
      )) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error("INVALID_FARM_PLATFORM_BASE_URL");
  }

  const response = await fetch(
    new URL("/api/replit/farm-v2/wallet", platformBaseUrl),
    {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        "x-replit-shared-secret": sharedSecret,
        "x-request-id": input.requestId,
      },
      body: JSON.stringify({
        operationId: farmAuthorityContext.getStore()?.operationId,
        amount: input.amount,
        currency: input.currency,
        direction: input.direction,
        idempotencyKey: `farm-v2:${input.requestId}:${input.idempotencySuffix ?? "primary"}`,
        originalTransactionId: input.originalTransactionId,
        launchToken: input.launchToken,
        reason: input.reason,
        referenceId: input.referenceId,
        referenceType: input.referenceType,
      }),
      signal: AbortSignal.timeout(5_000),
    },
  );

  const body = (await response.json().catch(() => null)) as
    | FarmWalletMutationResult
    | { error?: string }
    | null;
  if (!response.ok) {
    const code =
      body && "error" in body && body.error
        ? body.error
        : "FARM_WALLET_BRIDGE_FAILED";
    throw new Error(code);
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("duplicate" in body) ||
    typeof body.duplicate !== "boolean" ||
    !("transaction" in body) ||
    !body.transaction ||
    typeof body.transaction !== "object" ||
    !("wallet" in body) ||
    !body.wallet ||
    typeof body.wallet !== "object"
  ) {
    throw new Error("INVALID_FARM_WALLET_BRIDGE_RESPONSE");
  }
  const transaction = body.transaction;
  const wallet = body.wallet;
  if (
    typeof transaction.id !== "string" ||
    !transaction.id ||
    transaction.ownerId !== input.userId ||
    wallet.ownerId !== input.userId ||
    typeof wallet.id !== "string" ||
    transaction.walletId !== wallet.id ||
    transaction.amount !== input.amount ||
    transaction.currency !== input.currency ||
    transaction.direction !== input.direction ||
    transaction.reason !== input.reason ||
    transaction.referenceId !== input.referenceId ||
    transaction.referenceType !== input.referenceType ||
    transaction.idempotencyKey !==
      `farm-v2:${input.requestId}:${input.idempotencySuffix ?? "primary"}` ||
    transaction.reversalOf !== (input.originalTransactionId ?? null)
  ) {
    throw new Error("INVALID_FARM_WALLET_BRIDGE_RESPONSE");
  }
  return body;
}
