type FarmWalletCurrency = "coin" | "crystal";
type FarmWalletDirection = "credit" | "debit";

export type FarmWalletMutationInput = {
  amount: number;
  currency: FarmWalletCurrency;
  direction: FarmWalletDirection;
  launchToken: string;
  reason: string;
  referenceId: string;
  referenceType: string;
  requestId: string;
  idempotencySuffix?: string;
};

export type FarmWalletMutationResult = {
  duplicate: boolean;
  transaction: unknown;
  wallet: unknown;
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
    (input.reason === "farm_wallet_compensation" &&
      input.referenceType === "farm_wallet_compensation" &&
      input.idempotencySuffix === "compensation");
  if (!allowed || !Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error("INVALID_FARM_WALLET_OPERATION");
  }
  const platformBaseUrl = process.env.PLATFORM_BASE_URL;
  const sharedSecret = process.env.REPLIT_APP_SHARED_SECRET;
  if (!platformBaseUrl || !sharedSecret || !input.launchToken) {
    throw new Error("FARM_WALLET_BRIDGE_NOT_CONFIGURED");
  }
  const base = new URL(platformBaseUrl);
  if (
    (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error("INVALID_FARM_PLATFORM_BASE_URL");
  }

  const response = await fetch(new URL("/api/replit/farm-v2/wallet", platformBaseUrl), {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      "x-replit-shared-secret": sharedSecret,
      "x-request-id": input.requestId,
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      direction: input.direction,
      idempotencyKey: `farm-v2:${input.requestId}:${input.idempotencySuffix ?? "primary"}:${input.direction}:${input.currency}`,
      launchToken: input.launchToken,
      reason: input.reason,
      referenceId: input.referenceId,
      referenceType: input.referenceType,
    }),
    signal: AbortSignal.timeout(5_000),
  });

  const body = await response.json().catch(() => null) as
    | FarmWalletMutationResult
    | { error?: string }
    | null;
  if (!response.ok) {
    const code = body && "error" in body && body.error ? body.error : "FARM_WALLET_BRIDGE_FAILED";
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
  return body;
}
