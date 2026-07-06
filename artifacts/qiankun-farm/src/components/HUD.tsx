import { useGame } from '../game/GameContext';

export default function HUD() {
  const { state, dispatch } = useGame();

  return (
    <div className="hud-bar">
      <div className="hud-stats">
        <div className="hud-stat">
          <div className="hud-stat-icon">🪙</div>
          <div className="hud-stat-body">
            <span className="hud-stat-label">金幣</span>
            <span className="hud-stat-value">{state.coins}</span>
          </div>
        </div>
        <div className="hud-stat">
          <div className="hud-stat-icon hud-icon-crystal">💎</div>
          <div className="hud-stat-body">
            <span className="hud-stat-label">水晶</span>
            <span className="hud-stat-value">{state.crystals}</span>
          </div>
        </div>
        <div className="hud-stat">
          <div className="hud-stat-icon">🎁</div>
          <div className="hud-stat-body">
            <span className="hud-stat-label">累積儲值</span>
            <span className="hud-stat-value">{state.totalDeposit}</span>
          </div>
        </div>
        <div className="hud-stat">
          <div className="hud-stat-icon">☀️</div>
          <div className="hud-stat-body">
            <span className="hud-stat-label">天氣</span>
            <span className="hud-stat-value">{state.weather}</span>
          </div>
        </div>
      </div>
      <button
        className="law-btn"
        onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'law' })}
        title="天道律法"
      >
        <span className="law-icon">📖</span>
        <span className="law-label">天道律法</span>
      </button>
    </div>
  );
}
