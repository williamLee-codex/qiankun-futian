// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FarmCoinWallet } from "./FarmCoinWallet";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const balances = { coins: 100, centralCoins: 200, localCoinsEnabled: true };
it("does not enable a transfer before the wallet read is confirmed", () => {
  const read = vi.fn(() => new Promise<typeof balances>(() => {}));
  const transfer = vi.fn(async () => balances);
  render(<FarmCoinWallet read={read} transfer={transfer} pending={() => []} busy={false} />);
  expect(screen.getByRole("button", { name: "轉入福田" }).hasAttribute("disabled")).toBe(true);
  expect(transfer).not.toHaveBeenCalled();
});
it("keeps transfers disabled if the backend says the farm ledger is off", async () => {
  const read = vi.fn(async () => ({ ...balances, localCoinsEnabled: false }));
  const transfer = vi.fn(async () => balances);
  render(<FarmCoinWallet read={read} transfer={transfer} pending={() => []} busy={false} />);
  await waitFor(() => expect(screen.getByText(/福田金幣帳本尚未啟用/)).toBeTruthy());
  expect(screen.getByRole("button", { name: "轉入福田" }).hasAttribute("disabled")).toBe(true);
  expect(transfer).not.toHaveBeenCalled();
});
it("enables transfer only after confirmed enabled balances", async () => {
  const read = vi.fn(async () => balances);
  const transfer = vi.fn(async () => balances);
  render(<FarmCoinWallet read={read} transfer={transfer} pending={() => []} busy={false} />);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "轉帳金額" })).toBeTruthy());
  fireEvent.change(screen.getByRole("textbox", { name: "轉帳金額" }), { target: { value: "10" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "轉入福田" }).hasAttribute("disabled")).toBe(false));
});
it("does not reuse a prior reader's verified balances while the replacement reader is pending", async () => {
  const transfer=vi.fn(async()=>balances);
  const view=render(<FarmCoinWallet read={async()=>balances} transfer={transfer} pending={()=>[]} busy={false}/>);
  await waitFor(()=>expect(screen.getByRole("textbox",{name:"轉帳金額"})).toBeTruthy());
  fireEvent.change(screen.getByRole("textbox",{name:"轉帳金額"}),{target:{value:"10"}});
  expect((screen.getByRole("button",{name:"轉入福田"}) as HTMLButtonElement).disabled).toBe(false);
  view.rerender(<FarmCoinWallet read={()=>new Promise(()=>{})} transfer={transfer} pending={()=>[]} busy={false}/>);
  expect((screen.getByRole("button",{name:"轉入福田"}) as HTMLButtonElement).disabled).toBe(true);
  expect(transfer).not.toHaveBeenCalled();
});

// The approved art path only mounts once the art image loads; jsdom never
// decodes images, so resolve the load synchronously.
function loadArt() {
  vi.stubGlobal("Image", class { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { queueMicrotask(() => this.onload?.()); } });
}
async function artWallet(overrides: Partial<typeof balances> = {}) {
  loadArt();
  const value = { ...balances, ...overrides };
  const transfer = vi.fn(async () => value);
  render(<FarmCoinWallet read={async () => value} transfer={transfer} pending={() => []} busy={false} onClose={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "增加 1000 金幣" })).toBeTruthy());
  return { transfer };
}
const amountInput = () => screen.getByRole("textbox", { name: "轉換金額" }) as HTMLInputElement;
it("adds quick amounts cumulatively and never submits", async () => {
  const { transfer } = await artWallet({ centralCoins: 5000, coins: 5000 });
  for (const name of ["增加 1000 金幣", "增加 100 金幣", "增加 10 金幣", "增加 1 金幣"]) fireEvent.click(screen.getByRole("button", { name }));
  expect(amountInput().value).toBe("1111");
  expect(transfer).not.toHaveBeenCalled();
});
it("caps quick amounts at the source balance", async () => {
  await artWallet({ centralCoins: 150 });
  fireEvent.click(screen.getByRole("button", { name: "增加 1000 金幣" }));
  expect(amountInput().value).toBe("150");
  fireEvent.click(screen.getByRole("button", { name: "增加 100 金幣" }));
  expect(amountInput().value).toBe("150");
  expect((screen.getByRole("button", { name: "確認轉換" }) as HTMLButtonElement).disabled).toBe(false);
});
it("clears the amount when the transfer direction changes", async () => {
  await artWallet();
  fireEvent.click(screen.getByRole("button", { name: "增加 100 金幣" }));
  expect(amountInput().value).toBe("100");
  fireEvent.click(screen.getByRole("button", { name: "福田金幣回存中央" }));
  expect(amountInput().value).toBe("");
  expect((screen.getByRole("button", { name: "確認轉換" }) as HTMLButtonElement).disabled).toBe(true);
});
