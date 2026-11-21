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
