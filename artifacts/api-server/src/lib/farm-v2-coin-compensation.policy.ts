/**
 * The approved coin compensation policy as one pure decision, kept free of any
 * database import so it can be exercised without a connection.
 */

export type CoinWalletScope = "central" | "farm";

export type CoinCompensationDecision =
  | { due: false; reason: string }
  | {
      due: true;
      scope: CoinWalletScope;
      amount: number;
      evidence: string;
    };

type Journal = {
  transactionState: string;
  walletCurrency: string | null;
  walletAmount: number | null;
  walletTransaction: unknown;
};

const COMMAND_ATTEMPTED = "wallet_charge_attempted";

/**
 * The approved policy as one pure decision. Anything it cannot prove stays
 * un-compensated rather than guessed.
 */
export function decideFarmV2CoinCompensation(
  journal: Journal,
): CoinCompensationDecision {
  if (journal.walletCurrency !== "coin")
    return { due: false, reason: "NOT_A_COIN_WALLET" };
  const amount = journal.walletAmount;
  if (!Number.isSafeInteger(amount) || (amount as number) <= 0)
    return { due: false, reason: "NO_RECORDED_AMOUNT" };
  const scope: CoinWalletScope =
    (journal.walletTransaction as { settlement?: string } | null)?.settlement ===
    "ATOMIC_FARM_COINS"
      ? "farm"
      : "central";
  const command = (journal.walletTransaction as { command?: unknown } | null)
    ?.command;
  switch (journal.transactionState) {
    case "COMPLETED":
      return { due: false, reason: "DELIVERED" };
    case "COMPENSATING":
    case "COMPENSATED":
      return { due: false, reason: "ALREADY_COMPENSATED" };
    case "WALLET_APPLIED":
      // Charged, but the goods were never confirmed. Refund in full.
      return {
        due: true,
        scope,
        amount: amount as number,
        evidence: "CHARGED_NOT_DELIVERED",
      };
    case "WALLET_PENDING":
      // The request was sent and no answer came back. Refund in full.
      return {
        due: true,
        scope,
        amount: amount as number,
        evidence: "CHARGE_OUTCOME_UNKNOWN",
      };
    case "PENDING":
      // Only an accepted request with a persisted wallet intent is evidence.
      return command
        ? {
            due: true,
            scope,
            amount: amount as number,
            evidence: COMMAND_ATTEMPTED.toUpperCase(),
          }
        : { due: false, reason: "NOT_CHARGED" };
    default:
      return { due: false, reason: "UNKNOWN_STATE" };
  }
}

