/**
 * ResourceHUD — 頂部四格資源 Overlay（z-index: 30）
 *
 * 底圖只提供外框；icon、數字、名稱全部由系統生成。
 * 佈局：四欄 grid → 每欄內 flex [icon] [value / label]
 *
 * 每欄：
 *   [icon 22×22]  [value 18px bold]
 *                 [label 10px]
 *
 * 最大值預留：金幣 99999、水晶 9999、累積儲值 9999、天氣 2字
 */
import { useGame } from '../game/GameContext';

const WEATHER_ICON: Record<string, string> = {
  '晴': '☀️',
  '雨': '🌧️',
  '雷': '⛈️',
  '雪': '❄️',
};

function cap(value: number, max: number): string {
  return Math.min(value, max).toLocaleString();
}

export default function GameHeader() {
  const { state } = useGame();

  const cells = [
    { label: '金幣',    value: cap(state.coins,        99999), icon: '🪙' },
    { label: '水晶',    value: cap(state.crystals,      9999), icon: '💎' },
    { label: '累積儲值', value: cap(state.totalDeposit,  9999), icon: '📦' },
    {
      label: '天氣',
      value: state.weather,
      icon: WEATHER_ICON[state.weather] ?? '🌤️',
    },
  ];

  return (
    <div className="resource-hud" onClick={e => e.stopPropagation()}>
      {cells.map(({ label, value, icon }) => (
        <div key={label} className="resource-cell">
          <span className="resource-icon" aria-hidden="true">{icon}</span>
          <div className="resource-text">
            <span className="resource-value">{value}</span>
            <span className="resource-label">{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
