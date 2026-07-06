import { useGame } from '../game/GameContext';

const STATS = [
  { key: 'coins',        icon: '🪙', label: '金幣' },
  { key: 'crystals',     icon: '💎', label: '水晶' },
  { key: 'totalDeposit', icon: '📦', label: '累積儲值' },
  { key: 'weather',      icon: '☀️', label: '天氣' },
] as const;

type StatKey = typeof STATS[number]['key'];

export default function HUD() {
  const { state, dispatch } = useGame();

  return (
    <div className="hud-bar" onClick={e => e.stopPropagation()}>
      <div className="hud-stats">
        {STATS.map(({ key, icon, label }) => (
          <div key={key} className="hud-stat">
            <span className="hud-stat-icon">{icon}</span>
            <div className="hud-stat-text">
              <span className="hud-stat-label">{label}</span>
              <span className="hud-stat-val">{state[key as StatKey]}</span>
            </div>
          </div>
        ))}
      </div>

      <button
        className="hud-law-btn"
        onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'law' })}
        aria-label="天道律法"
      >
        <span className="hud-law-icon">📖</span>
        <span className="hud-law-label">天道律法</span>
      </button>
    </div>
  );
}
