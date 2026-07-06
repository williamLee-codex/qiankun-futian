import { useEffect, useState } from 'react';
import { useGame } from '../game/GameContext';
import type { Plot } from '../game/types';

interface Props {
  plot: Plot;
}

function formatCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function FarmPlot({ plot }: Props) {
  const { state, dispatch } = useGame();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      dispatch({ type: 'CHECK_GROWTH' });
    }, 500);
    return () => clearInterval(id);
  }, [dispatch]);

  const isSelected = state.selectedPlotId === plot.id;
  const remaining = plot.growthEndTime ? plot.growthEndTime - now : 0;

  function handleClick() {
    if (!plot.unlocked) return;
    dispatch({ type: 'SELECT_PLOT', id: plot.id });
  }

  const plotColors: Record<number, string> = {
    0: '#c8a96e',
    1: '#8b9e7a',
    2: '#c06040',
    3: '#7b5fa0',
    4: '#4a9e6a',
    5: '#1a1a2e',
  };

  const bgColor = plotColors[plot.id] ?? '#8a7060';

  return (
    <div
      className={`farm-plot ${isSelected ? 'farm-plot--selected' : ''} ${!plot.unlocked ? 'farm-plot--locked' : ''}`}
      style={{ background: plot.unlocked ? bgColor : '#1a1a2e' }}
      onClick={handleClick}
    >
      {!plot.unlocked ? (
        <div className="plot-lock">
          <span className="lock-icon">🔒</span>
          <span className="lock-cost">{plot.unlockCrystals}💎</span>
        </div>
      ) : plot.state === 'empty' ? (
        <div className="plot-content">
          <span className="plot-emoji">🌱</span>
          <span className="plot-name">{plot.name}</span>
        </div>
      ) : plot.state === 'growing' ? (
        <div className="plot-content">
          <span className="plot-emoji growing-anim">🌾</span>
          <span className="plot-name">{plot.name}</span>
          <span className="plot-timer">{formatCountdown(remaining)}</span>
        </div>
      ) : (
        <div className="plot-content">
          <span className="plot-emoji ready-glow">✨</span>
          <span className="plot-name">{plot.name}</span>
          <span className="plot-ready">可收成！</span>
        </div>
      )}
    </div>
  );
}
