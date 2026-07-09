/**
 * FarmScene — Game Scene Layer 2 (z-index: 10)
 *
 * 所有位置均相對於 .game-shell（390×843 設計稿）。
 *
 * 重要設計原則：
 *   • PLOT_POS  — 每塊農田的可點擊熱區（hotspot），獨立設定
 *   • LOCK_POS  — 每塊未解鎖土地的鎖頭圖示位置，完全獨立於熱區
 *   • CROP_POS  — 作物 / 計時器顯示錨點，與鎖頭同一套 X，解耦於 button
 *   • 鎖頭、作物均由 FarmScene 統一渲染；FarmPlot 只負責點擊
 *   • 若更換底圖，只需調整各 POS，不影響任何邏輯
 *
 * 坐標系：X 0%=左 → 100%=右（390px），Y 0%=上 → 100%=下（843px）
 */
import { useEffect, useState } from 'react';
import { useGame } from '../game/GameContext';
import FarmPlot from './FarmPlot';
import type { Plot } from '../game/types';

/* ── 農田可點擊熱區（% of 390×843）────────────────────────
   每塊田手動校正，對齊底圖農田視覺邊界。
   上排（遠列，透視較小），下排（近列，透視較大）。
──────────────────────────────────────────────────────── */
const PLOT_POS = [
  /* 上排（遠列）— 上移對齊視覺田格頂部 ≈43% */
  { left:  '4%', top: '43%', width: '30%', height: '15%' }, // 微芒凡土
  { left: '35%', top: '42%', width: '30%', height: '15%' }, // 幽熒沃土
  { left: '63%', top: '42%', width: '29%', height: '15%' }, // 朱砂烈土
  /* 下排（近列）— 避免與上排重疊，從 59% 開始 */
  { left:  '2%', top: '59%', width: '33%', height: '12%' }, // 曜紫靈土
  { left: '34%', top: '58%', width: '32%', height: '12%' }, // 翡翠聖土
  { left: '65%', top: '58%', width: '31%', height: '12%' }, // 黑金晶土
];

/* ── 鎖頭 / 作物共用錨點座標表（% of 390×843）────────────
   規則：
   • 同排三塊共用同一 Y 常數，不允許各自微調
   • 只修 X 座標來對應每塊田的橫向位置
   • 換底圖時只改 Y1 / Y2 即可
──────────────────────────────────────────────────────── */
const ICON_Y1 = '49%'; // 第一排（遠列）共用 Y：上排田中心 43+15/2≈50%，略高一點美觀
const ICON_Y2 = '65%'; // 第二排（近列）共用 Y：下排田中心 59+12/2=65%

const ICON_POS = [
  /* 第一排（遠列）— 三塊共用 ICON_Y1 */
  { x: '19%', y: ICON_Y1 }, // 微芒凡土
  { x: '50%', y: ICON_Y1 }, // 幽熒沃土
  { x: '78%', y: ICON_Y1 }, // 朱砂烈土
  /* 第二排（近列）— 三塊共用 ICON_Y2 */
  { x: '18%', y: ICON_Y2 }, // 曜紫靈土
  { x: '50%', y: ICON_Y2 }, // 翡翠聖土
  { x: '81%', y: ICON_Y2 }, // 黑金晶土
];

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function FarmScene() {
  const { state, dispatch } = useGame();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      dispatch({ type: 'CHECK_GROWTH' });
    }, 400);
    return () => clearInterval(id);
  }, [dispatch]);

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

      {/* ── 六塊農田 Hotspot（只負責點擊，不含作物渲染）── */}
      {state.plots.map((plot: Plot, i: number) => (
        <FarmPlot key={plot.id} plot={plot} pos={PLOT_POS[i]} />
      ))}

      {/* ── 鎖頭：未解鎖田地，用 ICON_POS 絕對座標渲染 ── */}
      {state.plots.map((plot: Plot, i: number) =>
        !plot.unlocked ? (
          <span
            key={`lock-${plot.id}`}
            className="plot-lock-icon"
            style={{ left: ICON_POS[i].x, top: ICON_POS[i].y }}
            aria-hidden="true"
          >
            🔒
          </span>
        ) : null
      )}

      {/* ── 作物狀態：生長中 — 用 ICON_POS 絕對座標渲染，與 button 完全解耦 ── */}
      {state.plots.map((plot: Plot, i: number) => {
        if (!plot.unlocked || plot.state !== 'growing') return null;
        const remaining = plot.growthEndTime ? plot.growthEndTime - now : 0;
        return (
          <span
            key={`crop-growing-${plot.id}`}
            className="ph-state"
            style={{ left: ICON_POS[i].x, top: ICON_POS[i].y }}
            aria-hidden="true"
          >
            <span className="ph-crop ph-crop--sway">{plot.cropEmoji}</span>
            <span className="ph-timer">{fmt(remaining)}</span>
          </span>
        );
      })}

      {/* ── 作物狀態：成熟收成 — 用 ICON_POS 絕對座標渲染 ── */}
      {state.plots.map((plot: Plot, i: number) => {
        if (!plot.unlocked || plot.state !== 'ready') return null;
        return (
          <span
            key={`crop-ready-${plot.id}`}
            className="ph-state"
            style={{ left: ICON_POS[i].x, top: ICON_POS[i].y }}
            aria-hidden="true"
          >
            <span className="ph-crop ph-crop--bounce">{plot.cropEmoji}</span>
            <span className="ph-ready">收成！</span>
          </span>
        );
      })}

    </div>
  );
}
