import { useGame } from '../game/GameContext';
import FarmPlot from './FarmPlot';

export default function FarmScene() {
  const { state, dispatch } = useGame();

  return (
    <div className="farm-scene">
      {/* Sky & mountains background */}
      <div className="scene-bg" />

      {/* Buildings row */}
      <div className="buildings-row">
        <button
          className="building building--warehouse"
          onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'warehouseBuilding' })}
          title="氣運倉庫"
        >
          <span className="building-emoji">🏯</span>
          <span className="building-label">氣運倉庫</span>
        </button>

        <div className="buildings-center" />

        <button
          className="building building--shop"
          onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'shopBuilding' })}
          title="天道商店"
        >
          <span className="building-emoji">🏛</span>
          <span className="building-label">天道商店</span>
        </button>
      </div>

      {/* Farm grid 2×3 */}
      <div className="farm-grid">
        {state.plots.map(plot => (
          <FarmPlot key={plot.id} plot={plot} />
        ))}
      </div>

      {/* Test deposit button */}
      <div className="test-row">
        <button
          className="test-deposit-btn"
          onClick={() => dispatch({ type: 'TEST_DEPOSIT' })}
        >
          測試儲值 +100
        </button>
      </div>
    </div>
  );
}
