/**
 * GameHeader — 固定頂部 Header（Layer 0）
 *
 * 兩層結構：
 *   Row 1 (60px)：金幣 / 水晶 / 累積儲值 / 天氣 — 平均排列
 *   Row 2 (50px)：完全留白（預留 Banner / 公告 / 限時活動）
 *
 * 字型規格：
 *   名稱 Label：14px  標楷體 / DFKai-SB
 *   數值 Value：22px  Bold  白色
 *
 * 最大位數：金幣 99999（5位）、水晶 9999（4位）、累積儲值 9999（4位）。
 */
import { useGame } from '../game/GameContext';

const WEATHER_ICON: Record<string, string> = {
  晴: '☀️',
  雨: '🌧️',
  雷: '⚡',
  雪: '❄️',
};

function capDigits(value: number, max: number): string {
  return Math.min(value, max).toString();
}

export default function GameHeader() {
  const { state } = useGame();

  const cells = [
    { icon: '🪙', label: '金幣',    value: capDigits(state.coins,        99999) },
    { icon: '💎', label: '水晶',    value: capDigits(state.crystals,     9999)  },
    { icon: '📦', label: '累積儲值', value: capDigits(state.totalDeposit, 9999)  },
    {
      icon:  WEATHER_ICON[state.weather] ?? '☀️',
      label: '天氣',
      value: state.weather,
    },
  ];

  return (
    <header className="game-header" onClick={e => e.stopPropagation()}>
      {/* ── Row 1：數值顯示 ── */}
      <div className="game-header-stats">
        {cells.map(({ icon, label, value }) => (
          <div key={label} className="hud-cell">
            <span className="hud-icon">{icon}</span>
            <span className="hud-label">{label}</span>
            <span className="hud-val">{value}</span>
          </div>
        ))}
      </div>

      {/* ── Row 2：預留留白 ── */}
      <div className="game-header-blank" aria-hidden="true" />
    </header>
  );
}
