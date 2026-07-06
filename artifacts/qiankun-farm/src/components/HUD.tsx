/**
 * HUD Component — Game Scene Layer 1  (V2 — 3-row layout)
 *
 * Each of the 4 cells is stacked vertically:
 *   Row 1: Icon   (28–32 px)
 *   Row 2: Label  (14 px bold)
 *   Row 3: Value  (24 px bold gold)
 *
 * Weather shows icon + text on the same line in row 3.
 * All sizing via clamp() — no absolute positioning.
 */
import { useGame } from '../game/GameContext';

const WEATHER_ICON: Record<string, string> = {
  晴: '☀️',
  雨: '🌧️',
  雷: '⚡',
  雪: '❄️',
};

export default function HUD() {
  const { state } = useGame();

  const cells = [
    { icon: '🪙', label: '金幣',    value: String(state.coins),        max: 99999 },
    { icon: '💎', label: '水晶',    value: String(state.crystals),     max: 9999  },
    { icon: '📦', label: '累積儲值', value: String(state.totalDeposit), max: 9999  },
    {
      icon: WEATHER_ICON[state.weather] ?? '☀️',
      label: '天氣',
      value: state.weather,
      isWeather: true,
    },
  ];

  return (
    <div className="hud-overlay" onClick={e => e.stopPropagation()}>
      {cells.map(({ icon, label, value, isWeather }) => (
        <div key={label} className="hud-cell">
          <span className="hud-icon">{icon}</span>
          <span className="hud-label">{label}</span>
          <span className={`hud-val${isWeather ? ' hud-val--weather' : ''}`}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}
