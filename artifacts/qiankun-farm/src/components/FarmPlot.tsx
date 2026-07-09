/**
 * FarmPlot — 農田點擊熱區 + 作物狀態顯示
 *
 * 點擊規則：
 *   - 成熟（ready）農田 → 立即收成，不跳確認
 *   - 空地（empty）/ 生長中（growing） → 開啟 InfoPanel 選擇播種
 * 作物圖示：使用 plot.cropEmoji 而非硬編碼 🌾
 * 對齊：ph-state 以 left:50% / top:55% / translate(-50%,-50%) 置中
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

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!plot.unlocked) {
      /* 鎖定農田：開啟 InfoPanel 顯示解鎖資訊 */
      dispatch({ type: 'SELECT_PLOT', id: plot.id });
      return;
    }
    if (plot.state === 'ready') {
      /* 成熟：立即收成，不跳確認彈窗 */
      dispatch({ type: 'HARVEST', plotId: plot.id });
    } else {
      /* 空地 / 生長中：開啟 InfoPanel */
      dispatch({ type: 'SELECT_PLOT', id: plot.id });
    }
  }

  return (
    <button
      className={`ph${selected ? ' ph--sel' : ''}`}
      style={{
        ...(pos as React.CSSProperties),
        position: 'absolute',
      }}
      onClick={handleClick}
      aria-label={plot.name}
    >
      {/* 鎖頭由 FarmScene 統一渲染，此處不顯示 */}

      {/* 生長中：顯示各田正確 cropEmoji + 倒計時 */}
      {plot.unlocked && plot.state === 'growing' && (
        <span className="ph-state">
          <span className="ph-crop ph-crop--sway">{plot.cropEmoji}</span>
          <span className="ph-timer">{fmt(remaining)}</span>
        </span>
      )}

      {/* 成熟：顯示各田正確 cropEmoji + 收成提示 */}
      {plot.unlocked && plot.state === 'ready' && (
        <span className="ph-state">
          <span className="ph-crop ph-crop--bounce">{plot.cropEmoji}</span>
          <span className="ph-ready">收成！</span>
        </span>
      )}
    </button>
  );
}
