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

const SOIL_COLORS: Record<number, { base: string; dark: string; glow: string }> = {
  0: { base: '#c8a830', dark: '#a07820', glow: 'rgba(220,180,50,0.6)' },
  1: { base: '#2a7ab8', dark: '#1a5888', glow: 'rgba(60,140,220,0.6)' },
  2: { base: '#8a2820', dark: '#601810', glow: 'rgba(160,60,50,0.5)' },
  3: { base: '#6a3090', dark: '#4a1a6a', glow: 'rgba(130,60,180,0.5)' },
  4: { base: '#2a7a3a', dark: '#1a5228', glow: 'rgba(60,160,80,0.5)' },
  5: { base: '#1a1410', dark: '#0e0c08', glow: 'rgba(80,60,20,0.4)' },
};

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
  const soil = SOIL_COLORS[plot.id] ?? SOIL_COLORS[0];

  function handleClick() {
    if (!plot.unlocked) return;
    dispatch({ type: 'SELECT_PLOT', id: plot.id });
  }

  const soilStyle = plot.unlocked
    ? { background: `radial-gradient(ellipse at 40% 35%, ${soil.base}, ${soil.dark})` }
    : { background: 'radial-gradient(ellipse at 40% 35%, #2a2010, #161008)' };

  return (
    <div
      className={`farm-plot ${isSelected ? 'farm-plot--selected' : ''} ${!plot.unlocked ? 'farm-plot--locked' : ''}`}
      onClick={handleClick}
      style={plot.unlocked && isSelected ? { boxShadow: `0 0 0 2px #f0c84a, 0 0 20px ${soil.glow}` } : {}}
    >
      {/* Stone border frame */}
      <div className="plot-stone-frame">
        {/* Corner posts */}
        <div className="plot-post plot-post--tl" />
        <div className="plot-post plot-post--tr" />
        <div className="plot-post plot-post--bl" />
        <div className="plot-post plot-post--br" />

        {/* Soil area */}
        <div className="plot-soil" style={soilStyle}>
          {!plot.unlocked ? (
            <div className="plot-lock">
              <span className="lock-icon">🔒</span>
              <span className="lock-cost">{plot.unlockCrystals}💎</span>
            </div>
          ) : plot.state === 'empty' ? (
            <div className="plot-content plot-content--empty">
              <span className="plot-name">{plot.name}</span>
            </div>
          ) : plot.state === 'growing' ? (
            <div className="plot-content">
              <span className="plot-crop-icon growing-anim">🌾</span>
              <span className="plot-timer">{formatCountdown(remaining)}</span>
            </div>
          ) : (
            <div className="plot-content ready-anim">
              <span className="plot-crop-icon">✨</span>
              <span className="plot-ready-text">收成！</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
