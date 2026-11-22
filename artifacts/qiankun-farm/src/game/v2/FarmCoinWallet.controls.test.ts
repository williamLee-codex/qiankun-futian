import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wallet = readFileSync(new URL("./FarmCoinWallet.tsx", import.meta.url), "utf8");

describe("Farm V2 wallet transfer controls", () => {
  it("always renders direction arrows, amount and submit instead of hiding the entire form", () => {
    expect(wallet).not.toContain("!transferEnabled ? null : pending ?");
    expect(wallet).toContain('aria-label="向下箭頭，中央金幣轉入福田"');
    expect(wallet).toContain('aria-label="向上箭頭，福田金幣回存中央"');
    expect(wallet).toContain('aria-label="轉帳金額"');
    expect(wallet).toContain('onClick={() => void submit()}');
  });
  it("blocks transfers if the server ledger is unavailable", () => {
    expect(wallet).toContain("balances?.localCoinsEnabled === true && !readError");
    expect(wallet).toContain("(!pending && !valid) || !transferEnabled");
    expect(wallet).toContain("!transferEnabled} onClick={() => setDirection");
  });
});
