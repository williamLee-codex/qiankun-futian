/**
 * FarmScene — Game Scene Layer 2
 * Calibrated to: 1023 × 1537 px background image (≈ 2:3 aspect ratio).
 *
 * All positions are % of the gc canvas (which matches the image dimensions).
 * Law hotspot removed — 天道律法 is now exclusively in the bottom nav.
 */
import { useGame } from '../game/GameContext';
import FarmPlot from './FarmPlot';
import type { Plot } from '../game/types';

/**
 * PLOT_POS — 每塊土地獨立定位，% 相對於 game-image-wrap (390×586px)
 *
 * 校正原則：
 *   • 每塊土地獨立設定，不使用平均 Grid 計算
 *   • left + width/2 = 鎖頭 / 作物 Icon 水平中心點
 *   • 若更換底圖，只需重新校正此處，其他邏輯不變
 *
 * 坐標系：X 從左 0% → 右 100%（390px），Y 從上 0% → 下 100%（586px）
 *
 * 視覺對照（底圖透視近大遠小，各列寬度略有差異）：
 *   遠列（top 41%）: 三塊較小，透視壓縮
 *   近列（top 55%）: 三塊較大，透視展開
 */
const PLOT_POS = [
  /* 遠列（上排） */
  { left:  '3%', top: '41%', width: '30%', height: '13%' }, // 微芒凡土  中心 18%
  { left: '35%', top: '41%', width: '28%', height: '13%' }, // 幽熒沃土  中心 49%
  { left: '62%', top: '41%', width: '26%', height: '13%' }, // 朱砂烈土  中心 75% ← 向左修正
  /* 近列（下排） */
  { left:  '2%', top: '55%', width: '32%', height: '15%' }, // 曜紫靈土  中心 18%
  { left: '35%', top: '55%', width: '29%', height: '15%' }, // 翡翠聖土  中心 49.5%
  { left: '62%', top: '55%', width: '28%', height: '15%' }, // 黑金晶土  中心 76% ← 向左修正
];

export default function FarmScene() {
  const { state, dispatch } = useGame();

  return (
    <div className="hotspot-layer">
      {/* ── 氣運倉庫 — polygon hotspot (left building) ── */}
      <button
        className="bh bh-left"
        onClick={e => { e.stopPropagation(); dispatch({ type: 'OPEN_PANEL', panel: 'warehouse' }); }}
        aria-label="氣運倉庫"
      />

      {/* ── 天道商店 — polygon hotspot (right building) ── */}
      <button
        className="bh bh-right"
        onClick={e => { e.stopPropagation(); dispatch({ type: 'OPEN_PANEL', panel: 'shopBuilding' }); }}
        aria-label="天道商店"
      />

      {/* ── Six farm plots ── */}
      {state.plots.map((plot: Plot, i: number) => (
        <FarmPlot key={plot.id} plot={plot} pos={PLOT_POS[i]} />
      ))}
    </div>
  );
}
