import { describe, expect, it, vi } from "vitest";
import {
  coinShortfallDirection,
  coinShortfallText,
  CoinShortfallNotice,
} from "./coinShortfallNotice";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

  it("preselects the direction that fixes the short wallet", () => {
    expect(coinShortfallDirection("core")).toBe("out");
    expect(coinShortfallDirection("farm")).toBe("in");
  });

  it("offers one conversion entry and no automatic purchase", () => {
    const onConvert = vi.fn();
    const html = renderToStaticMarkup(
      createElement(CoinShortfallNotice, { scope: "core", onConvert }),
    );
    expect(html).toContain("轉換");
    expect(html).not.toContain("images/farm");
    expect(onConvert).not.toHaveBeenCalled();
  });
});
