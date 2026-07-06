/**
 * FarmPlot — 農田點擊熱區 + 作物狀態顯示
 *
 * 不再負責渲染鎖頭（已移至 FarmScene.LOCK_POS 獨立渲染）。
 * 只負責：
 *   1. 點擊 → SELECT_PLOT
 *   2. Growing 狀態：顯示作物 Icon + 倒計時
 *   3. Ready 狀態：顯示收成 Icon + 文字
 */
import { useEffect, useState } from 'react';
import { useGame } from '../game/GameContext';
import type { Plot } from '../game/types';

interface Pos { left: string; top: string; width: string; height: string; }
interface Props { plot: Plot; pos: Pos; }

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

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
      style={{
        ...(pos as React.CSSProperties),
        position: 'absolute',  /* 相對 hotspot-layer 定位 */
      }}
      onClick={e => {
        e.stopPropagation();
        dispatch({ type: 'SELECT_PLOT', id: plot.id });
      }}
      aria-label={plot.name}
    >
      {/* 鎖頭由 FarmScene 統一渲染，此處不再顯示 */}

      {/* 作物錨點：left 50% / top 55% / translate(-50%,-50%)
          所有作物狀態都掛在此 anchor 上，不使用絕對 pixel 座標 */}
      {plot.unlocked && plot.state === 'growing' && (
        <span className="ph-state">
          <span className="ph-crop ph-crop--sway">🌾</span>
          <span className="ph-timer">{fmt(remaining)}</span>
        </span>
      )}

      {plot.unlocked && plot.state === 'ready' && (
        <span className="ph-state">
          <span className="ph-crop ph-crop--bounce">✨</span>
          <span className="ph-ready">收成！</span>
        </span>
      )}
    </button>
  );
}
