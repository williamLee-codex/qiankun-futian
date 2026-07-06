/**
 * FarmScene Component — Game Scene Layer 2
 *
 * Transparent hotspot layer covering the full 9:16 canvas.
 * Contains:
 *   • Law book polygon hotspot (top-right of scene)
 *   • Building polygon hotspots (warehouse left, shop right)
 *   • 6 farm-plot hotspots (no visible selection state)
 *
 * All positions are % of the 9:16 gc container.
 * Calibrated to: attached_assets/file_000000005f3c7209a603a19ecc1dc495_1783312766928.png (941×1672)
 */
import { useGame } from '../game/GameContext';
import FarmPlot from './FarmPlot';
import type { Plot } from '../game/types';

/* Plot hotspot positions as % of the 9:16 canvas (left/top/width/height) */
const PLOT_POS = [
  { left: '8%',    top: '44%',   width: '24%',  height: '13%' }, // 微芒凡土
  { left: '34.5%', top: '44%',   width: '27%',  height: '13%' }, // 幽熒沃土
  { left: '64%',   top: '44%',   width: '28%',  height: '13%' }, // 朱砂烈土
  { left: '5%',    top: '58%',   width: '28%',  height: '14%' }, // 曜紫靈土
  { left: '36%',   top: '58%',   width: '25%',  height: '14%' }, // 翡翠聖土
  { left: '64%',   top: '58%',   width: '31%',  height: '14%' }, // 黑金晶土
];

export default function FarmScene() {
  const { state, dispatch } = useGame();

  return (
    <div className="hotspot-layer">
      {/* ── 天道律法 book — polygon hotspot only, no extra button ── */}
      <button
        className="law-hotspot"
        onClick={e => { e.stopPropagation(); dispatch({ type: 'OPEN_PANEL', panel: 'law' }); }}
        aria-label="天道律法"
      />

      {/* ── 氣運倉庫 — building polygon hotspot (left) ── */}
      <button
        className="bh bh-left"
        onClick={e => { e.stopPropagation(); dispatch({ type: 'OPEN_PANEL', panel: 'warehouseBuilding' }); }}
        aria-label="氣運倉庫"
      />

      {/* ── 天道商店 — building polygon hotspot (right) ── */}
      <button
        className="bh bh-right"
        onClick={e => { e.stopPropagation(); dispatch({ type: 'OPEN_PANEL', panel: 'shopBuilding' }); }}
        aria-label="天道商店"
      />

      {/* ── 六塊農田 ── */}
      {state.plots.map((plot: Plot, i: number) => (
        <FarmPlot key={plot.id} plot={plot} pos={PLOT_POS[i]} />
      ))}
    </div>
  );
}
