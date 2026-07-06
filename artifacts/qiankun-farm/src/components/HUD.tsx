/**
 * GameHeader — HUD Overlay（z-index: 50）
 *
 * 疊在底圖頂部的黑金留白區，不推開底圖。
 * 高度 90px，四格平均分佈。
 *
 * 字型規格：
 *   Label（名稱）：12px  DFKai-SB / KaiTi / serif
 *   Value（數值）：20px  Bold  白色
 *
 * 最大位數：金幣 99999（5位）、水晶 9999（4位）、累積儲值 9999（4位）
 */
import { useGame } from '../game/GameContext';

const WEATHER_ICON: Record<string, string> = {
  晴: '☀️', 雨: '🌧️', 雷: '⚡', 雪: '❄️',
};

function cap(value: number, max: number): string {
  return Math.min(value, max).toString();
}

export default function GameHeader() {
  const { state } = useGame();

  const cells = [
    { icon: '🪙', label: '金幣',    value: cap(state.coins,        99999) },
    { icon: '💎', label: '水晶',    value: cap(state.crystals,     9999)  },
    { icon: '📦', label: '累積儲值', value: cap(state.totalDeposit, 9999)  },
    { icon: WEATHER_ICON[state.weather] ?? '☀️', label: '天氣', value: state.weather },
  ];

  return (
    <header className="game-header" onClick={e => e.stopPropagation()}>
      {cells.map(({ icon, label, value }) => (
        <div key={label} className="hud-cell">
          <span className="hud-icon">{icon}</span>
          <span className="hud-label">{label}</span>
          <span className="hud-val">{value}</span>
        </div>
      ))}
    </header>
  );
}
