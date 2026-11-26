/**
 * Approved wording for a coin shortfall. The approved artwork for these two
 * notices is not in the repository, so the notice shows the text and the
 * conversion entry only; nothing is redrawn or substituted.
 */
export type CoinScope = "core" | "farm";

export function coinShortfallText(scope: CoinScope): string {
  return scope === "core"
    ? "您的中央金幣不足，請按『轉換』切換至金幣轉換"
    : "您的福田金幣不足，請按『轉換』切換至金幣轉換";
}

/** Central short of coins moves farm coins back; a farm short moves central coins in. */
export function coinShortfallDirection(scope: CoinScope): "in" | "out" {
  return scope === "core" ? "out" : "in";
}

export function CoinShortfallNotice(props: {
  scope: CoinScope;
  onConvert: (direction: "in" | "out") => void;
}) {
  return (
    <section role="status" aria-live="polite" className="farm-v2-coin-shortfall">
      <p>{coinShortfallText(props.scope)}</p>
      <button
        type="button"
        onClick={() => props.onConvert(coinShortfallDirection(props.scope))}
      >
        轉換
      </button>
    </section>
  );
}
