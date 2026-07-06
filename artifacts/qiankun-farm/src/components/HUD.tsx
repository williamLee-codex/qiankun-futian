/**
 * HUD Component — Game Scene Layer 1
 *
 * Overlaid on the black HUD strip reserved at the top of the background image.
 * Flex layout — NO absolute positioning of individual values.
 * No background. No box. Text directly on the strip.
 * Label: 16–18 px  |  Value: 32–40 px Bold
 */
import { useGame } from '../game/GameContext';

const STATS = [
  { key: 'coins',        icon: '🪙', label: '金幣'    },
  { key: 'crystals',     icon: '💎', label: '水晶'    },
  { key: 'totalDeposit', icon: '📦', label: '累積儲值' },
  { key: 'weather',      icon: '☀️', label: '天氣'    },
] as const;

type StatKey = typeof STATS[number]['key'];

export default function HUD() {
  const { state } = useGame();

  return (
    <div className="hud-overlay" onClick={e => e.stopPropagation()}>
      {STATS.map(({ key, icon, label }) => (
        <div key={key} className="hud-cell">
          <span className="hud-icon">{icon}</span>
          <div className="hud-text">
            <span className="hud-label">{label}</span>
            <span className="hud-val">{state[key as StatKey]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
