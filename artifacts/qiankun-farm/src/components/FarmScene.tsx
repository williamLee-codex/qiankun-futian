import { useGame } from '../game/GameContext';
import FarmPlot from './FarmPlot';
import type { Plot } from '../game/types';

/**
 * Hotspot positions as % of the 1:1 canvas, calibrated to match the
 * farm plots and buildings drawn in the background artwork.
 *
 * Tweak these numbers to shift hotspots without touching any visual code.
 */
const PLOT_POS: { left: string; top: string; width: string; height: string }[] = [
  { left: '9%',    top: '51%', width: '27%', height: '15%' }, // 微芒凡土  (gold)
  { left: '37%',   top: '51%', width: '26%', height: '15%' }, // 幽熒沃土  (blue)
  { left: '64%',   top: '51%', width: '27%', height: '15%' }, // 朱砂烈土  (red)
  { left: '5.5%',  top: '67%', width: '32%', height: '21%' }, // 曜紫靈土  (purple)
  { left: '37%',   top: '67%', width: '26%', height: '21%' }, // 翡翠聖土  (green)
  { left: '63%',   top: '67%', width: '31%', height: '21%' }, // 黑金晶土  (dark)
];

export default function FarmScene() {
  const { state, dispatch } = useGame();

  return (
    <div className="hotspot-layer">
      {/* ── Building hotspots ── */}
      <button
        className="bh bh-left"
        onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'warehouseBuilding' })}
        aria-label="氣運倉庫"
      />
      <button
        className="bh bh-right"
        onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'shopBuilding' })}
        aria-label="天道商店"
      />

      {/* ── Plot hotspots ── */}
      {state.plots.map((plot: Plot, i: number) => (
        <FarmPlot key={plot.id} plot={plot} pos={PLOT_POS[i]} />
      ))}
    </div>
  );
}
