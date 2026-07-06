import { useGame } from '../game/GameContext';

/**
 * HUD – overlays numbers on top of the artwork's drawn HUD frames.
 * No boxes/borders are drawn here – the background image provides those.
 * The 4 value spans are absolutely positioned to match the image's
 * dark display strips inside each frame.
 */
export default function HUD() {
  const { state, dispatch } = useGame();

  return (
    <div className="hud-layer" aria-label="HUD">

      {/* ── 4 value number overlays ── */}
      <span className="hv hv-0">{state.coins}</span>
      <span className="hv hv-1">{state.crystals}</span>
      <span className="hv hv-2">{state.totalDeposit}</span>
      <span className="hv hv-3">{state.weather}</span>

      {/* ── Transparent hotspot over the 天道律法 button in the image ── */}
      <button
        className="law-hot"
        onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'law' })}
        aria-label="天道律法"
      />
    </div>
  );
}
