import { useGame } from '../game/GameContext';

/**
 * HUD – four slot-divs overlaid on the artwork's HUD frames.
 * Each slot is absolutely positioned to match its image frame,
 * with flex centering so the value sits in the middle of the
 * dark display strip regardless of font size.
 *
 * Positions to adjust: .hud-slot-N left/width in index.css.
 */
export default function HUD() {
  const { state, dispatch } = useGame();

  return (
    <div className="hud-layer" aria-label="HUD">

      <div className="hud-slot hud-slot-0">
        <span className="hud-val">{state.coins}</span>
      </div>

      <div className="hud-slot hud-slot-1">
        <span className="hud-val">{state.crystals}</span>
      </div>

      <div className="hud-slot hud-slot-2">
        <span className="hud-val">{state.totalDeposit}</span>
      </div>

      <div className="hud-slot hud-slot-3">
        <span className="hud-val">{state.weather}</span>
      </div>

      {/* Transparent hotspot over the law book button */}
      <button
        className="law-hot"
        onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'law' })}
        aria-label="天道律法"
      />
    </div>
  );
}
