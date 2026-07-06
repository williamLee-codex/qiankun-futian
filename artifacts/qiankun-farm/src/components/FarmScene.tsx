import bgImage from '@assets/file_00000000a6ec72098c772094f2ee675f_1783305419891.png';
import { useGame } from '../game/GameContext';
import FarmPlot from './FarmPlot';

export default function FarmScene() {
  const { state, dispatch } = useGame();

  return (
    <div className="scene" style={{ backgroundImage: `url(${bgImage})` }}>
      {/* Building click zones */}
      <button
        className="bldg-zone bldg-zone--left"
        onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'warehouseBuilding' })}
        aria-label="氣運倉庫"
      />
      <button
        className="bldg-zone bldg-zone--right"
        onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'shopBuilding' })}
        aria-label="天道商店"
      />

      {/* Six plots – landscape 2×3 grid */}
      <div className="field-layer">
        {state.plots.map(p => <FarmPlot key={p.id} plot={p} />)}
      </div>

      {/* Wooden title plaque */}
      <div className="plaque">乾　坤　福　田</div>
    </div>
  );
}
