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
    [readError, setReadError] = useState<string | null>(null),
    [pending, setPending] = useState<Transfer | null>(
      () => props.pending()[0] ?? null,
    );
  useEffect(() => {
    let active = true;
    setReadError(null);
    props
      .read()
      .then((v) => {
        if (active) {
          setBalances(v);
          setReadError(null);
        }
      })
      .catch((e) => {
        if (active) {
          setReadError(
            farmV2ErrorMessage(e instanceof Error ? e.message : String(e)),
          );
        }
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
  // Transfers only exist once the Farm ledger is enabled server-side. Until
  // then the Central balance is read-only and no transfer may be created.
  const transferEnabled = balances?.localCoinsEnabled !== false;
  const balanceText = (value: number | undefined) => {
    if (value !== undefined) return String(value);
    return readError ? "讀取失敗" : "讀取中…";
  };
  async function reload() {
    setReadError(null);
    setMessage("");
    try {
      setBalances(await props.read());
    } catch (e) {
      setReadError(
        farmV2ErrorMessage(e instanceof Error ? e.message : String(e)),
      );
    }
  }
  async function submit() {
    if (working || props.busy || (!pending && !valid) || !transferEnabled)
      return;
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
      <div aria-label="金幣餘額" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{border:"1px solid #977b3e",borderRadius:8,padding:12,background:"#1b332a"}}>
          <div style={{color:"#d4c6a5",fontSize:13}}>福田金幣</div>
          <strong style={{color:"#f4d06f",fontSize:23}}>{balanceText(balances?.coins)}</strong>
        </div>
        <div style={{border:"1px solid #977b3e",borderRadius:8,padding:12,background:"#1b332a"}}>
          <div style={{color:"#d4c6a5",fontSize:13}}>中央金幣</div>
          <strong style={{color:"#f4d06f",fontSize:23}}>{balanceText(balances?.centralCoins)}</strong>
        </div>
      </div>
      <div style={{display:"grid",gap:5,fontSize:14,lineHeight:1.5}}>
        <p><strong style={{color:"#f1d27e"}}>中央 → 福田：</strong>手動轉入，用於買種子、盆栽合成與福田消費。</p>
        <p><strong style={{color:"#9fe0b4"}}>福田 → 中央：</strong>將福田金幣手動回存中央錢包。</p>
        <p style={{color:"#c6d3c9",fontSize:12}}>中央金幣為御策羅盤帳本；福田金幣為獨立記帳，兩者僅能手動轉換，不自動合併。金幣獎勵存入福田；水晶仍使用中央錢包。</p>
      </div>
      {readError && (
        <p role="alert" style={{ display: "grid", gap: 8 }}>
          {readError}
          <button type="button" onClick={() => void reload()} disabled={working || props.busy}>
            重新讀取餘額
          </button>
        </p>
      )}
      {balances && !transferEnabled && (
        <p role="status" style={{ color: "#f1d27e" }}>
          福田金幣帳本尚未啟用，目前僅顯示中央金幣餘額；啟用後即可手動轉入或回存。
        </p>
      )}
      {!transferEnabled ? null : pending ? (
        <p role="alert">
          原轉帳尚未確認：{pending.direction === "in" ? "轉入福田" : "回存中央"}{" "}
          {pending.amount} 金幣。請重試原轉帳，確認前不可另開轉帳。
        </p>
      ) : (
        <>
          <div role="group" aria-label="金幣轉帳方向" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button type="button" aria-label="向下箭頭，中央金幣轉入福田" aria-pressed={direction === "in"} disabled={working || props.busy} onClick={() => setDirection("in")} style={{ ...controlStyle, cursor: "pointer", fontWeight: 700, background: direction === "in" ? "#d6b76c" : "#f8f3e7", borderWidth: direction === "in" ? 2 : 1 }}>
              <span aria-hidden="true" style={{ fontSize: 26, display: "block", lineHeight: 1.2 }}>↓</span>中央 → 福田
            </button>
            <button type="button" aria-label="向上箭頭，福田金幣回存中央" aria-pressed={direction === "out"} disabled={working || props.busy} onClick={() => setDirection("out")} style={{ ...controlStyle, cursor: "pointer", fontWeight: 700, background: direction === "out" ? "#d6b76c" : "#f8f3e7", borderWidth: direction === "out" ? 2 : 1 }}>
              <span aria-hidden="true" style={{ fontSize: 26, display: "block", lineHeight: 1.2 }}>↑</span>福田 → 中央
            </button>
          </div>
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
        style={{ ...controlStyle, background: "#d6b76c", fontWeight: 600, opacity: working || props.busy || (!pending && !valid) || !transferEnabled ? 0.55 : 1 }}
        onClick={() => void submit()}
        disabled={working || props.busy || (!pending && !valid) || !transferEnabled}
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
