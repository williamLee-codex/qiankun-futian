export type CompensationLedgerEntry = {
  idempotencyKey: string;
  wallet: "central" | "farm";
  amount: number;
  reason: string;
};

export type CompensationDecision =
  | { action: "none"; why: "balanced" }
  | { action: "compensate"; entry: CompensationLedgerEntry }
  | { action: "escalate"; why: "unknown_direction" | "ambiguous_amount" };

/**
 * A coin transfer that never reached the farm must be reversed exactly once.
 * The key is derived from the request, so a retry can never pay twice.
 */
export function planCompensation(input: {
  requestId: string;
  wallet: "central" | "farm";
  amount: number | null;
  coreApplied: boolean;
  farmApplied: boolean;
}): CompensationDecision {
  if (input.amount === null || !Number.isInteger(input.amount) || input.amount <= 0) {
    return { action: "escalate", why: "ambiguous_amount" };
  }
  if (!input.coreApplied && !input.farmApplied) return { action: "escalate", why: "unknown_direction" };
  if (input.coreApplied === input.farmApplied) return { action: "none", why: "balanced" };
  const source: "central" | "farm" = input.coreApplied ? "central" : "farm";
  return {
    action: "compensate",
    entry: {
      idempotencyKey: `compensate:${input.requestId}:${source}`,
      wallet: source,
      amount: input.amount,
      reason: input.coreApplied ? "core_debited_farm_missing" : "farm_credited_core_missing",
    },
  };
}
