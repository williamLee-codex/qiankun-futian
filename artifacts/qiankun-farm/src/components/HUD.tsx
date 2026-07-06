/**
 * GameHeader — HUD Overlay（z-index: 50）
 *
 * 底圖已內嵌四格框與 icon（金幣/水晶/累積儲值/天氣）。
 * 系統只疊加「Label + Value」文字，不另加 icon。
 *
 * 版面規則（底圖提供）：
 *   • 四格平均寬度，各占 390/4 = 97.5px
 *   • 每格：icon 在底圖左側；系統文字靠右顯示
 *   • Label 小（10px）、Value 中等（16px），標楷體
 *   • 最大位數：金幣 99999、水晶 9999、累積儲值 9999
 *   • 天氣：晴／雨／雷／雪
 *
 * 高度：與底圖 HUD 列對齊（60px）
 */
import { useGame } from '../game/GameContext';

function cap(value: number, max: number): string {
  return Math.min(value, max).toLocaleString();
}

export default function GameHeader() {
  const { state } = useGame();

  const cells = [
    { label: '金幣',    value: cap(state.coins,        99999) },
    { label: '水晶',    value: cap(state.crystals,     9999)  },
    { label: '累積儲值', value: cap(state.totalDeposit, 9999)  },
    { label: '天氣',    value: state.weather },
  ];

  return (
    <header className="game-header" onClick={e => e.stopPropagation()}>
      {cells.map(({ label, value }) => (
        <div key={label} className="hud-cell">
          <span className="hud-val">{value}</span>
          <span className="hud-label">{label}</span>
        </div>
      ))}
    </header>
  );
}
