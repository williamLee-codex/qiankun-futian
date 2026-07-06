/**
 * ResourceHUD — 頂部四格資源 Overlay（z-index: 30）
 *
 * 底圖已提供四格框線與 icon（金幣/水晶/胸箱/太陽）。
 * 系統只疊加 Value + Label 文字，放在每格右側文字區。
 * 左側固定 34px 保留給底圖 icon，系統不渲染任何 icon。
 *
 * Grid 架構（精確四等分，不用 absolute left 百分比）：
 *   .resource-hud  → grid, repeat(4, 1fr)
 *   .resource-cell → grid, 34px | 1fr, padding 0 8px
 *   .resource-text → flex-column, 置中
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
          {/* 左側 34px：底圖 icon 佔位，系統不渲染 */}
          <div />
          <div className="resource-text">
            <span className="resource-value">{value}</span>
            <span className="resource-label">{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
