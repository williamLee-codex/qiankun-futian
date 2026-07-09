/**
 * FarmScene — Game Scene Layer 2 (z-index: 10)
 *
 * 所有位置均相對於 .game-shell（390×844 設計稿）。
 *
 * 重要設計原則：
 *   • PLOT_POS  — 每塊農田的可點擊熱區（hotspot），獨立設定
 *   • LOCK_POS  — 每塊未解鎖土地的鎖頭圖示位置，完全獨立於熱區
 *   • 鎖頭由 FarmScene 統一渲染，FarmPlot 只負責點擊與作物狀態
 *   • 若更換底圖，只需調整 LOCK_POS 和 PLOT_POS，不影響任何邏輯
 *
 * 坐標系：X 0%=左 → 100%=右（390px），Y 0%=上 → 100%=下（844px）
 *
 * 底圖版本：V2 Production（file_00000000bd7c720998a29498f36f2661）
 *   六塊農田呈 3×2 梯形透視排列：
 *   上排（遠列）：棕色、藍色、紅色
 *   下排（近列）：紫色、綠色、黑色
 */
import { useGame } from '../game/GameContext';
import FarmPlot from './FarmPlot';
import type { Plot } from '../game/types';

/* ── 農田可點擊熱區（% of 390×844）────────────────────────
   每塊田手動校正，對齊底圖農田視覺邊界。
   上排（遠列，透視較小），下排（近列，透視較大）。
──────────────────────────────────────────────────────── */
const PLOT_POS = [
  /* 上排（遠列）— 對齊背景圖農田圖形 top≈47% */
  { left:  '4%', top: '47%', width: '30%', height: '16%' }, // 微芒凡土
  { left: '35%', top: '46%', width: '30%', height: '16%' }, // 幽熒沃土
  { left: '63%', top: '46%', width: '29%', height: '16%' }, // 朱砂烈土
  /* 下排（近列）— 對齊背景圖農田圖形 top≈62% */
  { left:  '2%', top: '62%', width: '33%', height: '12%' }, // 曜紫靈土
  { left: '34%', top: '61%', width: '32%', height: '12%' }, // 翡翠聖土
  { left: '65%', top: '61%', width: '31%', height: '12%' }, // 黑金晶土
];

/* ── 鎖頭獨立座標表（% of 390×844）──────────────────────────
   規則：
   • 同排三塊共用同一 Y 常數，不允許各自微調
   • 只修 X 座標來對應每塊田的橫向位置
   • 換底圖時只改 LOCK_Y1 / LOCK_Y2 即可
──────────────────────────────────────────────────────── */
const LOCK_Y1 = '52%'; // 第一排（遠列）共用 Y：上排田視覺中心約 52%
const LOCK_Y2 = '68%'; // 第二排（近列）共用 Y：下排田視覺中心約 68%

const LOCK_POS = [
  /* 第一排（遠列）— 三塊共用 LOCK_Y1 */
  { x: '19%', y: LOCK_Y1 }, // 微芒凡土
  { x: '50%', y: LOCK_Y1 }, // 幽熒沃土
  { x: '78%', y: LOCK_Y1 }, // 朱砂烈土
  /* 第二排（近列）— 三塊共用 LOCK_Y2 */
  { x: '18%', y: LOCK_Y2 }, // 曜紫靈土
  { x: '50%', y: LOCK_Y2 }, // 翡翠聖土
  { x: '81%', y: LOCK_Y2 }, // 黑金晶土
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
