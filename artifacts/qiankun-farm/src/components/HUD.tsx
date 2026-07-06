import { useGame } from '../game/GameContext';

/**
 * HUD overlay – four item-divs cover each frame in the artwork.
 * Each item aligns content to the bottom (where the dark value strip is).
 * A semi-transparent .hud-valbox ensures readability regardless of exact
 * image alignment.
 *
 * To adjust positions: change .hud-item-N left/width in index.css.
 * To adjust vertical position: change .hud-item top/height.
 */
export default function HUD() {
  const { state, dispatch } = useGame();

  const slots = [
    { cls: 'hud-item-0', val: String(state.coins)        },
    { cls: 'hud-item-1', val: String(state.crystals)     },
    { cls: 'hud-item-2', val: String(state.totalDeposit) },
    { cls: 'hud-item-3', val: state.weather              },
  ];

  return (
    <div className="hud-layer" aria-label="HUD">
      {slots.map(({ cls, val }) => (
        <div key={cls} className={`hud-item ${cls}`}>
          <div className="hud-valbox">
            <span className="hud-val">{val}</span>
          </div>
        </div>
      ))}

      {/* Transparent clickable overlay over the law book button */}
      <button
        className="law-hot"
        onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'law' })}
        aria-label="天道律法"
      />
    </div>
  );
}
