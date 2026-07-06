import { useGame } from '../game/GameContext';
import FarmPlot from './FarmPlot';
import type { Plot } from '../game/types';

const PLOT_POS = [
  { left: '11%',   top: '52.5%', width: '23%',  height: '12.5%' },
  { left: '38.5%', top: '52.5%', width: '23%',  height: '12.5%' },
  { left: '66%',   top: '52.5%', width: '22%',  height: '12.5%' },
  { left: '7.5%',  top: '69%',   width: '28.5%',height: '17%'   },
  { left: '38.5%', top: '69%',   width: '23%',  height: '17%'   },
  { left: '65%',   top: '69%',   width: '28%',  height: '17%'   },
];

export default function FarmScene() {
  const { state, dispatch } = useGame();

  return (
    <div className="hotspot-layer">
      <button
        className="bh bh-left"
        onClick={e => { e.stopPropagation(); dispatch({ type: 'OPEN_PANEL', panel: 'warehouseBuilding' }); }}
        aria-label="氣運倉庫"
      />
      <button
        className="bh bh-right"
        onClick={e => { e.stopPropagation(); dispatch({ type: 'OPEN_PANEL', panel: 'shopBuilding' }); }}
        aria-label="天道商店"
      />
      {state.plots.map((plot: Plot, i: number) => (
        <FarmPlot key={plot.id} plot={plot} pos={PLOT_POS[i]} />
      ))}
    </div>
  );
}
