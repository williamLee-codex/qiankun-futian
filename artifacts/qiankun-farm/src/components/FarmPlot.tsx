/**
 * FarmPlot — 農田點擊熱區（純點擊，不含作物渲染）
 *
 * 作物狀態、鎖頭均由 FarmScene 統一渲染；
 * 此元件只負責點擊事件處理。
 *
 * 點擊規則：
 *   - 成熟（ready）農田 → 立即收成，不跳確認
 *   - 空地（empty）/ 生長中（growing） → 開啟 InfoPanel 選擇播種
 *   - 鎖定農田 → 開啟 InfoPanel 顯示解鎖資訊
 */
import { useGame } from '../game/GameContext';
import type { Plot } from '../game/types';

interface Pos { left: string; top: string; width: string; height: string; }
interface Props { plot: Plot; pos: Pos; }

export default function FarmPlot({ plot, pos }: Props) {
  const { state, dispatch } = useGame();

  const selected = state.selectedPlotId === plot.id;

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!plot.unlocked) {
      dispatch({ type: 'SELECT_PLOT', id: plot.id });
      return;
    }
    if (plot.state === 'ready') {
      dispatch({ type: 'HARVEST', plotId: plot.id });
    } else {
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
    />
  );
}
