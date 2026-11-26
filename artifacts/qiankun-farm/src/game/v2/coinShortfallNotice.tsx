import { useState } from "react";

export type CoinScope = "core" | "farm";

/**
 * Approved wording. The approved artwork ships as
 * images/farm/coin-shortfall-{central,farm}.png; until those files exist the
 * notice falls back to this sentence so the screen never shows a broken image.
 */
export function coinShortfallText(scope: CoinScope): string {
  return scope === "core"
    ? "您的中央金幣不足，請按『轉換』切換至金幣轉換"
    : "您的福田金幣不足，請按『轉換』切換至金幣轉換";
}

/** Central short of coins moves farm coins back; a farm short moves central coins in. */
export function coinShortfallDirection(scope: CoinScope): "in" | "out" {
  return scope === "core" ? "out" : "in";
}

export function coinShortfallArt(scope: CoinScope): string {
  return scope === "core"
    ? "coin-shortfall-central.png"
    : "coin-shortfall-farm.png";
}

/**
 * Both wallets fund one purchase, so only their sum decides whether a
 * conversion can close the gap. A single error code never decides this.
 */
export function canCoverShortfall(
  balances: { centralCoins: number; coins: number } | null,
  deficit: number,
): boolean {
  if (!balances || !Number.isFinite(deficit) || deficit <= 0) return false;
  return balances.centralCoins + balances.coins >= deficit;
}

export function CoinShortfallNotice(props: {
  scope: CoinScope;
  balances?: { centralCoins: number; coins: number } | null;
  deficit?: number;
  onConvert: (direction: "in" | "out") => void;
  onCancel: () => void;
}) {
  const [artMissing, setArtMissing] = useState(false);
  const direction = coinShortfallDirection(props.scope);
  const coverable =
    props.deficit === undefined
      ? true
      : canCoverShortfall(props.balances ?? null, props.deficit);
  const base = import.meta.env.BASE_URL ?? "/";
  const hotspot = (label: string, onClick: () => void, style: React.CSSProperties) => (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{ position: "absolute", background: "transparent", border: 0, padding: 0, ...style }}
    />
  );

  if (!artMissing) {
    return (
      <section role="status" aria-live="polite" className="farm-v2-coin-shortfall">
        <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
          <img
            src={`${base}images/farm/${coinShortfallArt(props.scope)}`}
            alt={coinShortfallText(props.scope)}
            style={{ maxWidth: "100%", display: "block" }}
            onError={() => setArtMissing(true)}
          />
          {hotspot("取消", props.onCancel, { left: "4%", bottom: "6%", width: "26%", height: "14%" })}
          {coverable
            ? hotspot("轉換", () => props.onConvert(direction), { left: "37%", bottom: "6%", width: "26%", height: "14%" })
            : null}
          {hotspot("關閉", props.onCancel, { right: "3%", top: "3%", width: "12%", height: "12%" })}
        </div>
      </section>
    );
  }

  return (
    <section role="status" aria-live="polite" className="farm-v2-coin-shortfall">
      <p>{coinShortfallText(props.scope)}</p>
      {coverable && (
        <button type="button" onClick={() => props.onConvert(direction)}>
          轉換
        </button>
      )}
      <button type="button" onClick={props.onCancel}>
        取消
      </button>
    </section>
  );
}
