import bgImage from '@assets/file_00000000a6ec72098c772094f2ee675f_1783303369645.png';
import { useGame } from '../game/GameContext';
import FarmPlot from './FarmPlot';

export default function FarmScene() {
  const { state, dispatch } = useGame();

  return (
    <div className="farm-scene" style={{ backgroundImage: `url(${bgImage})` }}>

      {/* Left building clickable overlay */}
      <button
        className="building-overlay building-overlay--left"
        onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'warehouseBuilding' })}
        title="氣運倉庫"
      />

      {/* Right building clickable overlay */}
      <button
        className="building-overlay building-overlay--right"
        onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'shopBuilding' })}
        title="天道商店"
      />

      {/* Farm grid overlay – lower portion of scene */}
      <div className="farm-grid-overlay">
        <div className="farm-grid">
          {state.plots.map(plot => (
            <FarmPlot key={plot.id} plot={plot} />
          ))}
        </div>
      </div>

      {/* Title plaque */}
      <div className="farm-title-plaque">乾　坤　福　田</div>
    </div>
  );
}
