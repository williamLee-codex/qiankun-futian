export type CoinWallet = "central" | "farm";

export type ShortfallOutcome =
  | { kind: "sufficient" }
  | { kind: "convert"; from: CoinWallet; to: CoinWallet; amount: number | null }
  | { kind: "blocked"; code: "BOTH_INSUFFICIENT" | "BALANCE_UNAVAILABLE" };

/**
 * Decides what a short wallet can do. Conversion only ever runs from the other
 * wallet into the wallet that has to pay, and nothing is spent here: the caller
 * shows the prompt and the player decides.
 */
export function planCoinShortfall(input: {
  paying: CoinWallet;
  required: number | null;
  payingBalance: number | null;
  otherBalance: number | null;
}): ShortfallOutcome {
  const { paying, required, payingBalance, otherBalance } = input;
  if (payingBalance === null) return { kind: "blocked", code: "BALANCE_UNAVAILABLE" };
  // A refusal reported by the server carries no price, so the conversion is
  // offered without an amount and the wallet decides how much can move.
  if (required === null)
    return { kind: "convert", from: paying === "central" ? "farm" : "central", to: paying, amount: null };
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

/** Dedicated artwork slots; conversion artwork must not stand in for these. */
export function shortfallImage(paying: CoinWallet): string {
  return paying === "central"
    ? "/images/farm/coin-shortfall-central.png"
    : "/images/farm/coin-shortfall-farm.png";
}

const SHORTFALL_CODES: Record<string, CoinWallet | "crystal"> = {
  CORE_COIN_INSUFFICIENT: "central",
  FARM_COIN_INSUFFICIENT: "farm",
  CRYSTAL_INSUFFICIENT: "crystal",
};

export function shortfallWalletForCode(code: string): CoinWallet | "crystal" | null {
  return SHORTFALL_CODES[code] ?? null;
}
