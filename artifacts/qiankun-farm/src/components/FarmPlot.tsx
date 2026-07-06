import { useEffect, useState } from 'react';
import { useGame } from '../game/GameContext';
import type { Plot } from '../game/types';
import SoilTile from './SoilTile';

interface Props { plot: Plot; }

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

export default function FarmPlot({ plot }: Props) {
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
    <div
      className={`fp${selected ? ' fp--sel' : ''}${!plot.unlocked ? ' fp--locked' : ''}`}
      onClick={() => dispatch({ type: 'SELECT_PLOT', id: plot.id })}
    >
      {/* ── Visual layer: SVG soil tile ── */}
      <div className="fp-tile">
        <SoilTile plotId={plot.id} locked={!plot.unlocked} />
      </div>

      {/* ── Selected glow ring ── */}
      {selected && <div className="fp-glow" />}

      {/* ── State overlays ── */}
      {!plot.unlocked && (
        <div className="fp-overlay fp-overlay--lock">
          <span className="fp-lock">🔒</span>
        </div>
      )}

      {plot.unlocked && plot.state === 'growing' && (
        <div className="fp-overlay fp-overlay--grow">
          <span className="fp-crop fp-crop--sway">🌾</span>
          <span className="fp-timer">{fmt(remaining)}</span>
        </div>
      )}

      {plot.unlocked && plot.state === 'ready' && (
        <div className="fp-overlay fp-overlay--ready">
          <span className="fp-crop fp-crop--bounce">✨</span>
          <span className="fp-ready">收成！</span>
        </div>
      )}
    </div>
  );
}
