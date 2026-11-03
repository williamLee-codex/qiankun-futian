import { useEffect, useRef, useState } from "react";
import { FARM_V2_LANDS, type FarmLandId } from "./canonicalLandData";
import { POT_GRADES, POT_GRADE_COSTS, POT_FIRST_UNLOCK_REWARDS } from "./potRuntime";
import { workshopState, planWorkshopMutation, type WorkshopCommand, type WorkshopWarehouse } from "./workshopRuntime";
import "./potSynthesisGrid.css";
import { potDisplayBonus } from "./potDisplayRuntime";

type Selection = { species: FarmLandId; level: number };
const gradeColors = ["#b7e3b0", "#d5c36a", "#70b9ef", "#c19bef", "#efcd73", "#f08d8d", "#dfc5ff"];
const imageFor = (s: Selection) => `/farm-v2/images/plants/${s.species}-${s.level}.webp`;

export function PotSynthesisGrid(props: {
  warehouse: WorkshopWarehouse;
  busy: boolean;
  readWallet: () => Promise<{ coins: number }>;
  transact: (command: WorkshopCommand) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<Selection>({ species: 1, level: 1 });
  const [useDisplayed, setUseDisplayed] = useState(false);
  const [coins, setCoins] = useState<number | null>(null);
  const [walletError, setWalletError] = useState(false);
  const [stage, setStage] = useState<"recipe" | "working" | "success" | "failed">("recipe");
  const inFlight = useRef(false);
  const state = workshopState(props.warehouse);
  const land = FARM_V2_LANDS[selected.species - 1];
  const grade = POT_GRADES[Math.max(0, selected.level - 1)];
  const command = { kind: "synthesize", species: selected.species, grade, useDisplayed } as const;
  const material = selected.level <= 3 ? "蘊靈砂" : "九霄玉髓";
  const materialCost = [1, 1, 4, 2, 4, 10][Math.max(0, selected.level - 1)];
  const required = selected.level === 1 ? 3 : selected.species === 6 ? 2 : 3;
  const sourceGrade = POT_GRADES[selected.level - 2];
  const displayed = state.pots.find(p => p.species === selected.species && p.displayed && p.grade === sourceGrade);
  const available = selected.level === 1 ? props.warehouse.crops[selected.species] : state.pots.filter(p => p.species === selected.species && p.grade === sourceGrade && !p.displayed).length + (useDisplayed && displayed ? 1 : 0);
  const cost = POT_GRADE_COSTS[grade].coins;
  let recipeValid = selected.level > 0;
  if (recipeValid) {
    try { planWorkshopMutation(props.warehouse, command, "preview-only", Date.now()); }
    catch { recipeValid = false; }
  }
  const ready = recipeValid && coins !== null && coins >= cost && !props.busy && stage !== "working" && stage !== "failed";
  async function reloadWallet() {
    setCoins(null); setWalletError(false);
    try { const wallet = await props.readWallet(); if (!Number.isSafeInteger(wallet.coins) || wallet.coins < 0) throw Error(); setCoins(wallet.coins); }
    catch { setWalletError(true); }
  }
  useEffect(() => { let active = true; props.readWallet().then(w => { if (!Number.isSafeInteger(w.coins) || w.coins < 0) throw Error("INVALID_WALLET"); if (active) setCoins(w.coins); }).catch(() => { if (active) setWalletError(true); }); return () => { active = false; }; }, [props.readWallet]);
  function select(s: Selection) { setSelected(s); setUseDisplayed(false); setStage("recipe"); }
  async function synthesize() {
    if (!ready || inFlight.current) return;
    inFlight.current = true; setStage("working");
    try { const ok = await props.transact(command); setStage(ok ? "success" : "failed"); if (ok) await reloadWallet(); }
    catch { setStage("failed"); }
    finally { inFlight.current = false; }
  }
  return <section className="pot-synthesis" aria-label="42 格靈植與盆栽合成">
    <header><div><h3>靈植合成圖鑑</h3><p>點選目標盆栽，查看配方與合成條件</p></div><p>蘊靈砂 {state.materials.蘊靈砂} · 九霄玉髓 {state.materials.九霄玉髓}<br/>金幣 {coins === null ? "確認中" : coins}</p></header>
    <div className="pot-synthesis-layout">
      <div className="pot-grid-scroll"><div className="pot-grid" aria-label="六物種七階總覽">
        <span aria-hidden="true"/>{FARM_V2_LANDS.map(l => <strong className="pot-grid-heading" key={l.id}>{l.cropName}</strong>)}
        {Array.from({ length: 7 }, (_, level) => [<strong className="pot-grade-heading" key={`grade-${level}`}>{level === 0 ? "靈植" : POT_GRADES[level - 1] + "階"}</strong>, ...FARM_V2_LANDS.map(l => {
          const s = { species: l.id, level }; const g = POT_GRADES[level - 1];
          const count = level === 0 ? props.warehouse.crops[l.id] : state.pots.filter(p => p.species === l.id && p.grade === g).length;
          const active = selected.species === l.id && selected.level === level;
          return <button type="button" key={`${l.id}-${level}`} className={`pot-grid-cell${active ? " selected" : ""}`} style={{ borderColor: gradeColors[level] }} aria-pressed={active} aria-label={`${l.cropName} ${level === 0 ? "靈植" : g + "階盆栽"}，持有 ${count}`} disabled={stage === "working" || props.busy} onClick={() => select(s)}>
            <img src={imageFor(s)} alt="" width="128" height="192" loading="eager"/><small>持有 {count}</small>
          </button>;
        })]).flat()}
      </div></div>
      <aside className={`pot-recipe ${stage === "working" ? "working" : ""}`} aria-label="選中配方">
        <img className="pot-result-image" src={imageFor(selected)} alt={`${land.cropName}${selected.level ? grade + "階盆栽" : "靈植"}`} width="128" height="192"/>
        <div className="pot-recipe-info"><h4>{land.cropName} · {selected.level ? grade + "階盆栽" : "靈植"}</h4>
        {selected.level === 0 ? <><p>持有 {props.warehouse.crops[selected.species]} 株靈植</p><p>3 株靈植可合成一株黃階盆栽。</p><button type="button" onClick={() => select({ ...selected, level: 1 })}>查看黃階合成配方</button></> : <>
          <div className="pot-effects" aria-label="盆栽作用">
            <strong>盆栽作用（展示後生效）</strong>
            <p>靈韻 +{potDisplayBonus(selected.species, grade)} · 好友上限 +{potDisplayBonus(selected.species, grade)}</p>
            <small>靈韻每達 20 點解鎖下一陳設位，最多 6 位。同物種僅一株生效，取下即停止加成。</small>
          </div>
          <h5>所需盆栽及材料</h5>
          <ul className="pot-requirements">
            <li className={available < required ? "missing" : "enough"}>{selected.level === 1 ? land.cropName + "靈植" : sourceGrade + "階同種盆栽"}<b>{available} / {required}</b></li>
            <li className={state.materials[material] < materialCost ? "missing" : "enough"}>{material}<b>{state.materials[material]} / {materialCost}</b></li>
            <li className={coins !== null && coins >= cost ? "enough" : "missing"}>金幣<b>{coins ?? "確認中"} / {cost}</b></li>
          </ul>
          {selected.level > 1 && displayed && <label className="pot-display-choice"><input type="checkbox" checked={useDisplayed} disabled={props.busy || stage === "working"} onChange={e => setUseDisplayed(e.target.checked)}/>使用展示中的 {sourceGrade} 階盆栽，並以成品替換</label>}
          {state.potGallery[`${selected.species}:${grade}`] === undefined && <p>首次取得圖鑑獎勵：{POT_FIRST_UNLOCK_REWARDS[grade]} 金幣</p>}
          <p role="status" aria-live="polite">{stage === "working" ? "靈氣匯聚中，正在確認合成…" : stage === "success" ? "合成成功！成品已入倉。" : stage === "failed" ? "尚未確認合成結果，請先更新農田並查核庫存，暫勿重複送出。" : ready ? "材料與金幣齊全，可以合成" : "暫不可合成，請補足上方標示的缺項"}</p>
          {walletError && <button type="button" onClick={() => void reloadWallet()}>金幣讀取失敗，重新確認</button>}
          <button type="button" className="pot-craft-button" disabled={!ready} onClick={() => void synthesize()}>{stage === "working" ? "合成中…" : `合成${grade}階盆栽`}</button>
          <small>金幣與材料以伺服器最後確認為準。</small>
        </>}
        </div>
      </aside>
    </div>
    <details><summary>展示中的盆栽與倉庫管理</summary>{state.pots.map(p => <div key={p.id} className="pot-owned-row">{FARM_V2_LANDS[p.species - 1].cropName} · {p.grade}階 · {p.displayed ? "展示中" : "倉庫"}<button type="button" disabled={props.busy || stage === "working"} onClick={() => void props.transact(p.displayed ? { kind: "removePot", species: p.species } : { kind: "displayPot", potId: p.id })}>{p.displayed ? "取下" : "展示／替換"}</button></div>)}</details>
  </section>;
}
