import { useGame } from '../game/GameContext';
import FarmPlot from './FarmPlot';
import type { Plot } from '../game/types';

/**
 * Hotspot positions calibrated to the INNER SOIL of each plot —
 * excludes the stone border and outer frame.
 * All values are % of the 1:1 game canvas.
 *
 * Tweak these to adjust hit targets without touching any visual code.
 */
const PLOT_POS = [
  { left: '11%',   top: '52.5%', width: '23%',  height: '12.5%' }, // 微芒凡土 (gold, top-left)
  { left: '38.5%', top: '52.5%', width: '23%',  height: '12.5%' }, // 幽熒沃土 (blue, top-mid)
  { left: '66%',   top: '52.5%', width: '22%',  height: '12.5%' }, // 朱砂烈土 (red,  top-right)
  { left: '7.5%',  top: '69%',   width: '28.5%',height: '17%'   }, // 曜紫靈土 (purple, bot-left)
  { left: '38.5%', top: '69%',   width: '23%',  height: '17%'   }, // 翡翠聖土 (green,  bot-mid)
  { left: '65%',   top: '69%',   width: '28%',  height: '17%'   }, // 黑金晶土 (dark,   bot-right)
];

export default function FarmScene() {
  const { state, dispatch } = useGame();

  return (
    <div className="hotspot-layer">
      {/* Building hotspots – covers building body only */}
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

      {/* Plot hotspots */}
      {state.plots.map((plot: Plot, i: number) => (
        <FarmPlot key={plot.id} plot={plot} pos={PLOT_POS[i]} />
      ))}
    </div>
  );
}
