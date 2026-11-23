import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("./FarmV2AuthenticatedView.tsx", import.meta.url), "utf8");
const firstPurchase = readFileSync(new URL("./FarmFirstPurchaseRewards.tsx", import.meta.url), "utf8");
const newbie = readFileSync(new URL("./FarmNewbieBoost.tsx", import.meta.url), "utf8");

describe("Farm V2 approved notice artwork", () => {
  it("does not stack the old first-recharge banner or explanatory copy above the functional purchase plans", () => {
    expect(view).not.toContain('images/farm/first-recharge-panel.png');
    expect(view).not.toContain("下方卡片為實際領取與儲值入口");
    expect(view).toContain('<FarmFirstPurchaseRewards apiBaseUrl={props.apiBaseUrl} launchToken={props.launchToken} />');
    expect(view).toContain('<DialogTitle className="sr-only">首儲獎勵</DialogTitle>');
  });
  it("preserves actual purchase and claim actions while removing duplicate plan headers", () => {
    expect(firstPurchase).toContain('action="/api/checkout/create"');
    expect(firstPurchase).toContain("api.claimFirstPurchase(planId,day)");
    expect(firstPurchase).toContain('/farm-v2/first-purchase/${plan.id}.png');
    expect(firstPurchase).not.toContain("三種首儲方案各限購一次。付款完成後");
    expect(firstPurchase).not.toContain("<header");
  });
  it("keeps the illustrated newcomer close hotspot and countdown, without a visible modal title", () => {
    expect(view).toContain('<DialogTitle className="sr-only">新手 7 日六倍</DialogTitle>');
    expect(newbie).toContain('aria-label="關閉新手六倍公告"');
    expect(newbie).toContain("formatRemaining(remaining)");
    expect(newbie).toContain("newcomer-6x-panel.png");
  });
});
