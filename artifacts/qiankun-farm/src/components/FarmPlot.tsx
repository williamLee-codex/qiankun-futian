import { useEffect, useState } from 'react';
import { useGame } from '../game/GameContext';
import type { Plot } from '../game/types';

interface Props { plot: Plot; }

function formatCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/* Soil layers: base + mid + highlight colours */
const SOIL: Record<number, { base: string; mid: string; hi: string }> = {
  0: { base: '#7a5800', mid: '#c8a020', hi: '#e8c840' },   // 微芒凡土 golden
  1: { base: '#0a3060', mid: '#1a60b0', hi: '#4090e0' },   // 幽熒沃土 blue
  2: { base: '#4a0a00', mid: '#8a2010', hi: '#c03020' },   // 朱砂烈土 red
  3: { base: '#28004a', mid: '#5a1a80', hi: '#8040b0' },   // 曜紫靈土 purple
  4: { base: '#0a2a08', mid: '#1a5a14', hi: '#3a8a30' },   // 翡翠聖土 green
  5: { base: '#0c0a04', mid: '#1e1a0c', hi: '#302a14' },   // 黑金晶土 dark
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
  const soil = SOIL[plot.id] ?? SOIL[0];

  const soilBg = plot.unlocked
    ? [
        `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)`,
        `repeating-linear-gradient(90deg, transparent, transparent 5px, rgba(0,0,0,0.06) 5px, rgba(0,0,0,0.06) 6px)`,
        `radial-gradient(ellipse 120% 100% at 35% 30%, ${soil.hi} 0%, ${soil.mid} 40%, ${soil.base} 100%)`,
      ].join(', ')
    : 'linear-gradient(135deg, #141008, #0c0a04)';

  return (
    <div
      className={`farm-plot${isSelected ? ' farm-plot--selected' : ''}${!plot.unlocked ? ' farm-plot--locked' : ''}`}
      onClick={() => dispatch({ type: 'SELECT_PLOT', id: plot.id })}
    >
      {/* Outer stone frame */}
      <div className="plot-frame">
        {/* Corner posts */}
        <span className="plot-post tl" /><span className="plot-post tr" />
        <span className="plot-post bl" /><span className="plot-post br" />

        {/* Soil */}
        <div className="plot-soil" style={{ background: soilBg }}>
          {!plot.unlocked ? (
            <span className="plot-lock-icon">🔒</span>
          ) : plot.state === 'growing' ? (
            <div className="plot-crop-wrap">
              <span className="plot-crop sway">🌾</span>
              <span className="plot-timer">{formatCountdown(remaining)}</span>
            </div>
          ) : plot.state === 'ready' ? (
            <div className="plot-crop-wrap ready-bounce">
              <span className="plot-crop">✨</span>
              <span className="plot-ready-badge">收成！</span>
            </div>
          ) : (
            /* empty soil – no text */
            null
          )}
        </div>
      </div>
    </div>
  );
}
