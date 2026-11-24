import type { CSSProperties, ReactNode } from "react";

const ART_W = 1536;
const ART_H = 1024;
export const FARM_COIN_ART_PATH = "images/farm/coin-conversion-final-approved.png";

// Hotspots are measured on the approved 1536x1024 art. Every control is an
// invisible region over the painted element, so nothing is drawn twice.
const regions = {
  centralBalance: [335, 288, 310, 60],
  farmBalance: [1090, 288, 310, 60],
  directionIn: [395, 435, 455, 70],
  directionOut: [928, 435, 480, 70],
  amountInput: [398, 548, 780, 77],
  maxButton: [1205, 545, 190, 80],
  quick1: [400, 652, 208, 76],
  quick10: [650, 652, 208, 76],
  quick100: [900, 652, 208, 76],
  quick1000: [1150, 652, 208, 76],
  submitButton: [480, 790, 580, 110],
  closeButton: [1436, 24, 84, 84],
} as const;
// The painted circles sit left of their labels, so the selection dot is centred
// on the circle rather than on the whole hotspot.
const directionDot = { in: 7.25, out: 7.08 } as const;
const quickAmounts = [
  [1, "quick1"],
  [10, "quick10"],
  [100, "quick100"],
  [1000, "quick1000"],
] as const;

// The stage keeps the 1536x1024 art ratio but is bounded by BOTH viewport
// dimensions, so a short or narrow screen never clips the panel. 100dvh is the
// game iframe viewport, which already excludes the platform header, and keeps
// room for the one-line status message below the art.
const stageStyle: CSSProperties = {
  width: `min(100%, ${ART_W}px, calc((100dvh - 64px) * ${ART_W / ART_H}))`,
  margin: "0 auto",
};
type Region = keyof typeof regions;
function position(name: Region): CSSProperties {
  const [x, y, w, h] = regions[name];
  return {
    position: "absolute",
    left: `${(x / ART_W) * 100}%`,
    top: `${(y / ART_H) * 100}%`,
    width: `${(w / ART_W) * 100}%`,
    height: `${(h / ART_H) * 100}%`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

export function FarmCoinWalletArtLayout(props: {
  centralBalance: ReactNode;
  farmBalance: ReactNode;
  direction: "in" | "out";
  onDirectionChange: (direction: "in" | "out") => void;
  amount: string;
  onAmountChange: (value: string) => void;
  onAdd: (value: number) => void;
  onMax: () => void;
  onSubmit: () => void;
  onClose: () => void;
  disabled: boolean;
  submitDisabled: boolean;
  message?: ReactNode;
}) {
  const buttonBase: CSSProperties = {
    border: 0,
    background: "transparent",
    color: "transparent",
    cursor: "pointer",
    padding: 0,
  };
  const balanceStyle: CSSProperties = {
    color: "#ffe5a0",
    fontWeight: 800,
    fontSize: "clamp(9px, 2vw, 25px)",
    textAlign: "center",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    textShadow: "0 2px 4px #24101a",
  };
  return (
    <section aria-label="金幣轉換" style={stageStyle}>
      <div style={{ position: "relative", width: "100%", aspectRatio: `${ART_W} / ${ART_H}` }}>
        <img
          src={`${import.meta.env.BASE_URL ?? "/"}${FARM_COIN_ART_PATH}`}
          alt=""
          aria-hidden="true"
          style={{ width: "100%", height: "100%", display: "block" }}
        />
        <output aria-label="中央金幣餘額" style={{ ...position("centralBalance"), ...balanceStyle }}>
          {props.centralBalance}
        </output>
        <output aria-label="福田金幣餘額" style={{ ...position("farmBalance"), ...balanceStyle }}>
          {props.farmBalance}
        </output>
        {(["in", "out"] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            aria-label={dir === "in" ? "中央金幣轉入福田" : "福田金幣回存中央"}
            aria-pressed={props.direction === dir}
            disabled={props.disabled}
            onClick={() => props.onDirectionChange(dir)}
            style={{ ...position(dir === "in" ? "directionIn" : "directionOut"), ...buttonBase }}
          >
            {props.direction === dir && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: `${directionDot[dir]}%`,
                  top: "50%",
                  width: "9.7%",
                  aspectRatio: 1,
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  background: "radial-gradient(circle, #fff6c0 0%, #ffcf57 52%, #c8871f 100%)",
                  boxShadow: "0 0 10px 3px rgba(255, 205, 90, 0.75)",
                }}
              />
            )}
          </button>
        ))}
        <input
          aria-label="轉換金額"
          inputMode="numeric"
          value={props.amount}
          onChange={(e) => props.onAmountChange(e.target.value)}
          disabled={props.disabled}
          style={{
            ...position("amountInput"),
            border: 0,
            outlineOffset: -2,
            background: "transparent",
            color: "#fff0be",
            fontSize: "clamp(10px, 2vw, 25px)",
            fontWeight: 700,
            padding: "0 1%",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          aria-label="最大可轉換金額"
          disabled={props.disabled}
          onClick={props.onMax}
          style={{ ...position("maxButton"), ...buttonBase }}
        >
          最大
        </button>
        {quickAmounts.map(([value, region]) => (
          <button
            key={value}
            type="button"
            aria-label={`增加 ${value} 金幣`}
            disabled={props.disabled}
            onClick={() => props.onAdd(value)}
            style={{ ...position(region), ...buttonBase }}
          />
        ))}
        <button
          type="button"
          aria-label="確認轉換"
          disabled={props.submitDisabled}
          onClick={props.onSubmit}
          style={{ ...position("submitButton"), ...buttonBase, opacity: props.submitDisabled ? 0.6 : 1 }}
        >
          確認轉換
        </button>
        <button
          type="button"
          aria-label="關閉金幣轉換"
          onClick={props.onClose}
          style={{ ...position("closeButton"), ...buttonBase }}
        >
          關閉
        </button>
      </div>
      {props.message && (
        <div
          role="status"
          style={{
            textAlign: "center",
            color: "#f5d99d",
            fontSize: "clamp(10px, 1.6vw, 16px)",
            lineHeight: "20px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {props.message}
        </div>
      )}
    </section>
  );
}
