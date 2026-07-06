/**
 * FarmScene — Game Scene Layer 2 (z-index: 10)
 *
 * 所有位置均相對於 .gc（390×844 設計稿）。
 * 底圖以 object-fit:cover 填滿 390×844，垂直 % 與原始圖片一致。
 *
 * 重要設計原則：
 *   • PLOT_POS  — 每塊農田的可點擊熱區（hotspot），獨立設定
 *   • LOCK_POS  — 每塊未解鎖土地的鎖頭圖示位置，完全獨立於熱區
 *   • 鎖頭由 FarmScene 統一渲染，FarmPlot 只負責點擊與作物狀態
 *   • 若更換底圖，只需調整 LOCK_POS 和 PLOT_POS，不影響任何邏輯
 *
 * 坐標系：X 0%=左 → 100%=右（390px），Y 0%=上 → 100%=下（844px）
 */
import { useGame } from '../game/GameContext';
import FarmPlot from './FarmPlot';
import type { Plot } from '../game/types';

/* ── 農田可點擊熱區（% of 390×844 gc） ──────────────────
   以鎖頭中心點為圓心，向外擴展為矩形熱區。
   熱區用於點擊互動 + 作物狀態顯示，不控制鎖頭位置。
──────────────────────────────────────────────────────── */
const PLOT_POS = [
  /* 上排（遠列，透視較小） */
  { left:  '5%', top: '38%', width: '38%', height: '16%' }, // 微芒凡土  中心≈24%,46%
  { left: '35%', top: '38%', width: '30%', height: '16%' }, // 幽熒沃土  中心≈50%,46%
  { left: '62%', top: '38%', width: '28%', height: '16%' }, // 朱砂烈土  中心≈76%,46%
  /* 下排（近列，透視較大） */
  { left:  '3%', top: '53%', width: '34%', height: '17%' }, // 曜紫靈土  中心≈20%,61%
  { left: '35%', top: '53%', width: '30%', height: '17%' }, // 翡翠聖土  中心≈50%,61%
  { left: '65%', top: '53%', width: '30%', height: '17%' }, // 黑金晶土  中心≈80%,61%
];

/* ── 鎖頭獨立座標表（% of 390×844 gc）────────────────────
   每塊土地逐一手動校正，不使用平均 Grid 計算。
   原則：位於每塊田的中間偏下方，呈梯形視覺分布。

   第1塊 微芒凡土：x=24%, y=47%
   第2塊 幽熒沃土：x=50%, y=47%
   第3塊 朱砂烈土：x=76%, y=47%  ← 已向左修正，不偏右
   第4塊 曜紫靈土：x=20%, y=58%
   第5塊 翡翠聖土：x=50%, y=58%
   第6塊 黑金晶土：x=80%, y=58%
──────────────────────────────────────────────────────── */
const LOCK_POS = [
  { x: '24%', y: '47%' }, // 微芒凡土
  { x: '50%', y: '47%' }, // 幽熒沃土
  { x: '76%', y: '47%' }, // 朱砂烈土 ← 向左修正
  { x: '20%', y: '58%' }, // 曜紫靈土
  { x: '50%', y: '58%' }, // 翡翠聖土
  { x: '80%', y: '58%' }, // 黑金晶土
];

export default function FarmScene() {
  const { state, dispatch } = useGame();

  return (
    <div className="hotspot-layer">

      {/* ── 氣運倉庫 — 左建築 Hotspot ── */}
      <button
        className="bh bh-left"
        onClick={e => { e.stopPropagation(); dispatch({ type: 'OPEN_PANEL', panel: 'warehouse' }); }}
        aria-label="氣運倉庫"
      />

      {/* ── 天道商店 — 右建築 Hotspot ── */}
      <button
        className="bh bh-right"
        onClick={e => { e.stopPropagation(); dispatch({ type: 'OPEN_PANEL', panel: 'shopBuilding' }); }}
        aria-label="天道商店"
      />

      {/* ── 六塊農田 Hotspot（只負責點擊 + 作物狀態，不含鎖頭）── */}
      {state.plots.map((plot: Plot, i: number) => (
        <FarmPlot key={plot.id} plot={plot} pos={PLOT_POS[i]} />
      ))}

      {/* ── 鎖頭：獨立位置渲染，與 Hotspot 完全解耦 ── */}
      {state.plots.map((plot: Plot, i: number) =>
        !plot.unlocked ? (
          <span
            key={`lock-${plot.id}`}
            className="plot-lock-icon"
            style={{ left: LOCK_POS[i].x, top: LOCK_POS[i].y }}
            aria-hidden="true"
          >
            🔒
          </span>
        ) : null
      )}

    </div>
  );
}
