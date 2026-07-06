/**
 * StatusBar — 狀態資訊欄（取代 InfoPanel）
 *
 * 位置：乾坤福田牌匾下方、一鍵功能按鈕上方。
 * 功能：
 *   • 第一行：根據遊戲狀態顯示圖示 + 訊息
 *   • 第二行（僅在農田選中且解鎖時）：互動控制（播種 / 收成 / ✕）
 *
 * 訊息優先順序：
 *   已選中農田 > 全域狀態（成熟 > 生長中 > 空閒）
 */
import { useEffect, useState } from 'react';
import { useGame } from '../game/GameContext';

const HARVEST_COINS = 10;

function fmtSec(ms: number) {
  return Math.max(0, Math.ceil(ms / 1000));
}

export default function StatusBar() {
  const { state, dispatch } = useGame();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  const plot = state.selectedPlotId !== null
    ? state.plots.find(p => p.id === state.selectedPlotId)
    : undefined;

  const maxQty = plot?.unlocked ? Math.min(state.warehouseSeeds, plot.maxSeeds) : 0;

  /* ── 狀態訊息列（第一行）── */
  type Line = { icon: string; text: string; cls?: string };
  const lines: Line[] = [];

  if (plot) {
    if (!plot.unlocked) {
      if (plot.unlockCoins !== null) {
        const can = state.coins >= plot.unlockCoins;
        lines.push({ icon: '🔒', text: `${plot.name}：解鎖費用 ${plot.unlockCoins} 🪙 金幣` });
        if (!can) lines.push({ icon: '⚠', text: '金幣不足', cls: 'sb-text--warn' });
      } else {
        lines.push({ icon: '🔒', text: `${plot.name}：需累積儲值 ${plot.unlockCrystals} 💎 解鎖` });
        const pct = Math.min(100, Math.round((state.totalDeposit / (plot.unlockCrystals ?? 1)) * 100));
        lines.push({ icon: '📊', text: `進度 ${state.totalDeposit} / ${plot.unlockCrystals}（${pct}%）` });
      }
    } else if (plot.state === 'growing') {
      const remMs = plot.growthEndTime ? plot.growthEndTime - now : 0;
      lines.push({ icon: '🌱', text: `已播種：${plot.name}（${plot.plantCount} 顆）` });
      lines.push({ icon: '⏳', text: `剩餘 ${fmtSec(remMs)} 秒成熟` });
      lines.push({ icon: '💰', text: `收成可獲得 ${plot.plantCount * HARVEST_COINS} 金幣` });
    } else if (plot.state === 'ready') {
      lines.push({ icon: '✅', text: `${plot.name} 已成熟，可收成！`, cls: 'sb-text--ready' });
      lines.push({ icon: '💰', text: `收成可獲得 ${plot.plantCount * HARVEST_COINS} 金幣` });
    } else {
      lines.push({ icon: '🌾', text: `${plot.name}（可種上限 ${plot.maxSeeds} 顆）` });
      if (state.warehouseSeeds <= 0) {
        lines.push({ icon: '⚠', text: '種子不足，請至市場補充', cls: 'sb-text--warn' });
      } else {
        lines.push({ icon: '🌿', text: `倉庫種子：${state.warehouseSeeds} 顆` });
      }
    }
  } else {
    const ready   = state.plots.filter(p => p.state === 'ready');
    const growing = state.plots.filter(p => p.state === 'growing');
    if (ready.length > 0) {
      const totalCoins = ready.reduce((s, p) => s + p.plantCount * HARVEST_COINS, 0);
      lines.push({ icon: '✅', text: `${ready.length} 塊農田已成熟可收成`, cls: 'sb-text--ready' });
      lines.push({ icon: '💰', text: `收成可獲得 ${totalCoins} 金幣` });
    } else if (growing.length > 0) {
      const minRem = Math.min(...growing.map(p =>
        p.growthEndTime ? Math.max(0, p.growthEndTime - now) : 0
      ));
      lines.push({ icon: '🌱', text: `${growing.length} 塊農田生長中` });
      lines.push({ icon: '⏳', text: `最快 ${fmtSec(minRem)} 秒成熟` });
    } else {
      lines.push({ icon: '🌾', text: '點選農田開始耕作' });
    }
  }

  return (
    <div className="sb-overlay" onClick={stopProp}>

      {/* ── 第一行：狀態訊息 ── */}
      <div className="sb-msgs">
        {lines.map((l, i) => (
          <span key={i} className="sb-line">
            <span className="sb-icon">{l.icon}</span>
            <span className={`sb-text${l.cls ? ' ' + l.cls : ''}`}>{l.text}</span>
          </span>
        ))}
      </div>

      {/* ── 第二行：互動控制（農田選中且解鎖）── */}
      {plot?.unlocked && (
        <div className="sb-ctrl">
          {plot.state === 'empty' && (
            <>
              <div className="ip-qty">
                <button className="ip-qty-btn" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: state.plantQuantity - 1 })}>－</button>
                <span className="ip-qty-num">{state.plantQuantity}</span>
                <button className="ip-qty-btn" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: state.plantQuantity + 1 })}>＋</button>
                <button className="ip-qty-btn ip-qty-btn--max" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: maxQty })}>最大</button>
              </div>
              <button
                className="ip-act-btn ip-act-btn--plant"
                disabled={state.warehouseSeeds <= 0}
                onClick={() => dispatch({ type: 'PLANT', plotId: plot.id, quantity: state.plantQuantity })}
              >
                🌱 播種
              </button>
            </>
          )}
          {plot.state === 'growing' && (
            <span className="ip-state-text ip-state--growing">🌿 生長中…</span>
          )}
          {plot.state === 'ready' && (
            <button
              className="ip-act-btn ip-act-btn--harvest"
              onClick={() => dispatch({ type: 'HARVEST', plotId: plot.id })}
            >
              收成
            </button>
          )}
          <button className="ip-close-btn" onClick={() => dispatch({ type: 'DESELECT_PLOT' })}>✕</button>
        </div>
      )}

      {/* ── 鎖定農田：顯示解鎖按鈕（限金幣解鎖）── */}
      {plot && !plot.unlocked && plot.unlockCoins !== null && (
        <div className="sb-ctrl">
          <button
            className={`ip-unlock-btn${state.coins >= plot.unlockCoins ? '' : ' ip-unlock-btn--poor'}`}
            disabled={state.coins < plot.unlockCoins}
            onClick={() => dispatch({ type: 'UNLOCK_PLOT', plotId: plot.id })}
          >
            {state.coins >= plot.unlockCoins ? '✨ 解鎖' : '金幣不足'}
          </button>
          <button className="ip-close-btn" onClick={() => dispatch({ type: 'DESELECT_PLOT' })}>✕</button>
        </div>
      )}

    </div>
  );
}
