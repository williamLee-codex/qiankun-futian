import { useEffect, useState } from "react";
import type { FarmCoinBalances } from "./farmV2ApiClient";
import { farmV2ErrorMessage } from "./farmV2ErrorMessage";
const controlStyle = { background: "#f8f3e7", color: "#14221c", border: "1px solid #bda365", borderRadius: 8, padding: "10px 12px", width: "100%", font: "inherit" };
type Transfer = { direction: "in" | "out"; amount: number };
export function FarmCoinWallet(props: {
  read: () => Promise<FarmCoinBalances>;
  transfer: (
    direction: "in" | "out",
    amount: number,
  ) => Promise<FarmCoinBalances>;
  pending: () => Transfer[];
  busy: boolean;
}) {
  const [balances, setBalances] = useState<FarmCoinBalances | null>(null),
    [amount, setAmount] = useState(""),
    [direction, setDirection] = useState<"in" | "out">("in");
  const [working, setWorking] = useState(false),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState<Transfer | null>(
      () => props.pending()[0] ?? null,
    );
  useEffect(() => {
    let active = true;
    props
      .read()
      .then((v) => {
        if (active) setBalances(v);
      })
      .catch((e) => {
        if (active) setMessage(farmV2ErrorMessage(e.message));
      });
    return () => {
      active = false;
    };
  }, [props.read]);
  const number = Number(amount),
    valid =
      /^[1-9]\d*$/.test(amount) &&
      Number.isSafeInteger(number) &&
      number <= 2147483647;
  async function submit() {
    if (working || props.busy || (!pending && !valid)) return;
    const command = pending ?? { direction, amount: number };
    setWorking(true);
    setMessage("轉帳確認中…");
    try {
      const v = await props.transfer(command.direction, command.amount);
      setBalances(v);
      setPending(null);
      setAmount("");
      setMessage("轉帳已完成，兩邊餘額已更新。");
    } catch (e) {
      setPending(props.pending()[0] ?? null);
      setMessage(
        farmV2ErrorMessage(
          e instanceof Error ? e.message : "FARM_API_UNAVAILABLE",
        ),
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <div aria-label="福田金幣錢包" style={{ display: "grid", gap: 12 }}>
      <p>
        福田金幣：{balances?.coins ?? "讀取中…"}　中央金幣：
        {balances?.centralCoins ?? "讀取中…"}
      </p>
      <p>
        福田買種子、盆栽合成及一般金幣消費使用福田金幣；金幣獎勵存入福田。需要時請手動轉入或回存中央，系統不會自動轉帳。水晶維持中央錢包。
      </p>
      {pending ? (
        <p role="alert">
          原轉帳尚未確認：{pending.direction === "in" ? "轉入福田" : "回存中央"}{" "}
          {pending.amount} 金幣。請重試原轉帳，確認前不可另開轉帳。
        </p>
      ) : (
        <>
          <label>
            轉帳方向{" "}
            <select
              style={controlStyle}
              aria-label="轉帳方向"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "in" | "out")}
              disabled={working || props.busy}
            >
              <option value="in">中央 → 福田</option>
              <option value="out">福田 → 中央</option>
            </select>
          </label>
          <label>
            金額{" "}
            <input
              style={controlStyle}
              aria-label="轉帳金額"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={working || props.busy}
            />
          </label>
        </>
      )}
      <button
        style={{ ...controlStyle, background: "#d6b76c", fontWeight: 600, opacity: working || props.busy || (!pending && !valid) ? 0.55 : 1 }}
        onClick={() => void submit()}
        disabled={working || props.busy || (!pending && !valid)}
      >
        {working
          ? "確認中…"
          : pending
            ? "重試原轉帳"
            : direction === "in"
              ? "轉入福田"
              : "回存中央"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
