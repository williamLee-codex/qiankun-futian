import { useGame } from '../game/GameContext';

export default function HUD() {
  const { state, dispatch } = useGame();

  return (
    <div className="hud-bar">
      <div className="hud-item">
        <span className="hud-label">💰 金幣</span>
        <span className="hud-value">{state.coins}</span>
      </div>
      <div className="hud-item">
        <span className="hud-label">💎 水晶</span>
        <span className="hud-value">{state.crystals}</span>
      </div>
      <div className="hud-item">
        <span className="hud-label">📦 儲值</span>
        <span className="hud-value">{state.totalDeposit}</span>
      </div>
      <div className="hud-item">
        <span className="hud-label">🌤 天氣</span>
        <span className="hud-value">{state.weather}</span>
      </div>
      <button
        className="law-btn"
        onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'law' })}
      >
        天道律法
      </button>
    </div>
  );
}
