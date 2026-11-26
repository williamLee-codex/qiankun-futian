import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  canCoverShortfall,
  coinShortfallArt,
  coinShortfallDirection,
  coinShortfallText,
  CoinShortfallNotice,
} from "./coinShortfallNotice";

describe("coin shortfall notice", () => {
  it("uses the approved central wording", () => {
    expect(coinShortfallText("core")).toBe(
      "您的中央金幣不足，請按『轉換』切換至金幣轉換",
    );
  });

  it("uses the approved farm wording", () => {
    expect(coinShortfallText("farm")).toBe(
      "您的福田金幣不足，請按『轉換』切換至金幣轉換",
    );
  });

  it("points each scope at its own approved artwork", () => {
    expect(coinShortfallArt("core")).toBe("coin-shortfall-central.png");
    expect(coinShortfallArt("farm")).toBe("coin-shortfall-farm.png");
  });

  it("preselects the direction that fixes the short wallet", () => {
    expect(coinShortfallDirection("core")).toBe("out");
    expect(coinShortfallDirection("farm")).toBe("in");
  });

  it("counts both wallets before offering a conversion", () => {
    expect(canCoverShortfall({ centralCoins: 40, coins: 70 }, 100)).toBe(true);
    expect(canCoverShortfall({ centralCoins: 40, coins: 30 }, 100)).toBe(false);
    expect(canCoverShortfall({ centralCoins: 100, coins: 100 }, 0)).toBe(false);
    expect(canCoverShortfall(null, 100)).toBe(false);
  });

  it("hides the conversion hotspot when the two wallets cannot close the gap", () => {
    const onConvert = vi.fn();
    const html = renderToStaticMarkup(
      createElement(CoinShortfallNotice, {
        scope: "core",
        balances: { centralCoins: 10, coins: 20 },
        deficit: 100,
        onConvert,
        onCancel: vi.fn(),
      }),
    );
    expect(html).toContain("您的中央金幣不足");
    expect(html).not.toContain('aria-label="轉換"');
    expect(onConvert).not.toHaveBeenCalled();
  });
});
