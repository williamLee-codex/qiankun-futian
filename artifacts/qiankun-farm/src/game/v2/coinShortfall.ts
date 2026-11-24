export type CoinWallet = "central" | "farm";

export type ShortfallOutcome =
  | { kind: "sufficient" }
  | { kind: "convert"; from: CoinWallet; to: CoinWallet; amount: number }
  | { kind: "blocked"; code: "BOTH_INSUFFICIENT" | "BALANCE_UNAVAILABLE" };

/**
 * Decides what a short wallet can do. Conversion only ever runs from the other
 * wallet into the wallet that has to pay, and nothing is spent here: the caller
 * shows the prompt and the player decides.
 */
export function planCoinShortfall(input: {
  paying: CoinWallet;
  required: number;
  payingBalance: number | null;
  otherBalance: number | null;
}): ShortfallOutcome {
  const { paying, required, payingBalance, otherBalance } = input;
  if (payingBalance === null) return { kind: "blocked", code: "BALANCE_UNAVAILABLE" };
  if (payingBalance >= required) return { kind: "sufficient" };
  if (otherBalance === null) return { kind: "blocked", code: "BALANCE_UNAVAILABLE" };
  const missing = required - payingBalance;
  if (otherBalance < missing) return { kind: "blocked", code: "BOTH_INSUFFICIENT" };
  return {
    kind: "convert",
    from: paying === "central" ? "farm" : "central",
    to: paying,
    amount: missing,
  };
}

export function shortfallImage(paying: CoinWallet): string {
  return paying === "central"
    ? "/images/farm/coin-conversion-final-approved.png"
    : "/images/farm/coin-conversion-approved.legacy.png";
}
