/**
 * ResourceHUD — 頂部四格資源 Overlay（z-index: 30）
 *
 * 底圖已提供四格框線與 icon（金幣/水晶/胸箱/太陽）。
 * 系統只疊加 Value + Label 文字，放在每格右側 62% 區域。
 * 左側 38% 保留給底圖 icon，完全不遮擋。
 *
 * Grid 架構（精確四等分，不用 absolute left 百分比）：
 *   .resource-hud  → grid, repeat(4, 1fr)
 *   .resource-cell → grid, 38% | 62%
 *   .resource-text → grid-column:2, flex-column, 置中
 */
import { useGame } from '../game/GameContext';

function cap(value: number, max: number): string {
  return Math.min(value, max).toLocaleString();
}

export default function GameHeader() {
  const { state } = useGame();

  const cells = [
    { label: '金幣',    value: cap(state.coins,        99999) },
    { label: '水晶',    value: cap(state.crystals,      9999) },
    { label: '累積儲值', value: cap(state.totalDeposit,  9999) },
    { label: '天氣',    value: state.weather },
  ];

  return (
    <div className="resource-hud" onClick={e => e.stopPropagation()}>
      {cells.map(({ label, value }) => (
        <div key={label} className="resource-cell">
          {/* 左側 38%：底圖 icon 區，系統不渲染任何內容 */}
          <div className="resource-text">
            <span className="resource-val">{value}</span>
            <span className="resource-label">{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
