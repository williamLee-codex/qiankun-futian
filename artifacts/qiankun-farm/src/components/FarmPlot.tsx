import { useEffect, useState } from 'react';
import { useGame } from '../game/GameContext';
import type { Plot } from '../game/types';

interface Pos {
  left: string; top: string; width: string; height: string;
}
interface Props { plot: Plot; pos: Pos; }

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * FarmPlot – transparent hotspot only.
 * No visual frame on selection. Feedback = info panel appearing.
 * Click feedback = brief :active highlight via CSS, no permanent border.
 */
export default function FarmPlot({ plot, pos }: Props) {
  const { state, dispatch } = useGame();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      dispatch({ type: 'CHECK_GROWTH' });
    }, 400);
    return () => clearInterval(id);
  }, [dispatch]);

  const selected  = state.selectedPlotId === plot.id;
  const remaining = plot.growthEndTime ? plot.growthEndTime - now : 0;

  return (
    <button
      className={`ph${selected ? ' ph--sel' : ''}`}
      style={pos}
      onClick={() => dispatch({ type: 'SELECT_PLOT', id: plot.id })}
      aria-label={plot.name}
    >
      {/* Lock icon – locked plots only */}
      {!plot.unlocked && (
        <span className="ph-lock">🔒</span>
      )}

      {/* Growing */}
      {plot.unlocked && plot.state === 'growing' && (
        <span className="ph-state">
          <span className="ph-crop ph-crop--sway">🌾</span>
          <span className="ph-timer">{fmt(remaining)}</span>
        </span>
      )}

      {/* Ready */}
      {plot.unlocked && plot.state === 'ready' && (
        <span className="ph-state">
          <span className="ph-crop ph-crop--bounce">✨</span>
          <span className="ph-ready">收成！</span>
        </span>
      )}
    </button>
  );
}
