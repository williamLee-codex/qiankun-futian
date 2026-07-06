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

/* Farm plot hotspot positions (left/top/width/height as % of canvas) */
const PLOT_POS = [
  { left: '4%',    top: '41%',  width: '28%', height: '13%' }, // 微芒凡土
  { left: '35%',   top: '41%',  width: '28%', height: '13%' }, // 幽熒沃土
  { left: '66%',   top: '41%',  width: '28%', height: '13%' }, // 朱砂烈土
  { left: '3%',    top: '55%',  width: '30%', height: '15%' }, // 曜紫靈土
  { left: '35%',   top: '55%',  width: '29%', height: '15%' }, // 翡翠聖土
  { left: '66%',   top: '55%',  width: '30%', height: '15%' }, // 黑金晶土
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
