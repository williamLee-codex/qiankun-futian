import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (relative: string) =>
  readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

// Approved artwork must stay wired to the live UI. Commit 0cf5c6d deleted the
// 30-day sign-in panel <img> and replaced it with plain text buttons; these
// guards make that regression fail instead of silently shipping.
test("approved 30-day sign-in panel art renders inside the live sign-in dialog", () => {
  const view = read("game/v2/FarmV2AuthenticatedView.tsx");
  expect(view).toContain("images/farm/30-day-signin-panel.png");
});

test("sign-in dialog exposes all 30 claimable cells over the approved panel", () => {
  const view = read("game/v2/FarmV2AuthenticatedView.tsx");
  expect(view).toContain("signInRewards.map");
  expect(view).toContain("claimSignInMakeup");
  expect(view).toContain("claimSignInPerfect");
});

test("approved newcomer and first-purchase panel art stay wired", () => {
  const view = read("game/v2/FarmV2AuthenticatedView.tsx");
  const newcomer = read("game/v2/FarmNewbieBoost.tsx");
  expect(newcomer).toContain("images/farm/newcomer-6x-panel.png");
  expect(view).toContain("images/farm/first-recharge-panel.png");
});

test("first-purchase renders the three approved plan images, not a nine-card grid", () => {
  const source = read("game/v2/FarmFirstPurchaseRewards.tsx");
  expect(source).toContain("first-purchase/${plan.id}.png");
  for (const id of ['id:"A"', 'id:"B"', 'id:"C"']) expect(source).toContain(id);
});
