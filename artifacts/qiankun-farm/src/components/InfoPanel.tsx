/**
 * InfoPanel Component — Game Scene Layer 4
 *
 * 土地解鎖規則：
 *   第2塊（幽熒沃土）：花費 88  金幣直接解鎖
 *   第3塊（朱砂烈土）：花費 888 金幣直接解鎖
 *   第4塊（曜紫靈土）：累積儲值 100 水晶解鎖
 *   第5塊（翡翠聖土）：累積儲值 300 水晶解鎖
 *   第6塊（黑金晶土）：累積儲值 600 水晶解鎖
 */
import { useGame } from '../game/GameContext';

export default function InfoPanel() {
  const { state, dispatch } = useGame();
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  const plot = state.selectedPlotId !== null
    ? state.plots.find(p => p.id === state.selectedPlotId)
    : null;

  /* ── No plot selected ── */
  if (!plot) {
    return (
      <div className="ip-overlay ip-overlay--idle" onClick={stopProp}>
        <span className="ip-idle-hint">點選土地開始耕作</span>
      </div>
    );
  }

  /* ── Locked plot ── */
  if (!plot.unlocked) {
    /* 花費金幣直接解鎖（第2、3塊） */
    if (plot.unlockCoins !== null) {
      const canAfford = state.coins >= plot.unlockCoins;
      return (
        <div className="ip-overlay ip-overlay--locked" onClick={stopProp}>
          <div className="ip-locked-row">
            <span className="ip-locked-icon">🔒</span>
            <div className="ip-locked-info">
              <span className="ip-name">{plot.name}｜尚未解鎖</span>
              <span className="ip-locked-sub">需要 <span className="ip-locked-sub--coins">{plot.unlockCoins} 🪙</span> 金幣解鎖</span>
              <span className="ip-locked-sub">目前金幣：<span className="ip-locked-sub--coins">{state.coins}</span></span>
            </div>
            <button
              className={`ip-unlock-btn${canAfford ? '' : ' ip-unlock-btn--poor'}`}
              disabled={!canAfford}
              onClick={() => dispatch({ type: 'UNLOCK_PLOT', plotId: plot.id })}
            >
              {canAfford ? '購買土地' : '金幣不足'}
            </button>
          </div>
        </div>
      );
    }

    /* 累積儲值水晶解鎖（第4、5、6塊） */
    const pct = Math.min(100, (state.totalDeposit / (plot.unlockCrystals ?? 1)) * 100);
    return (
      <div className="ip-overlay ip-overlay--locked" onClick={stopProp}>
        <div className="ip-locked-row">
          <span className="ip-locked-icon">🔒</span>
          <div className="ip-locked-info">
            <span className="ip-name">{plot.name}</span>
            <span className="ip-locked-sub">需累積儲值 {plot.unlockCrystals} 💎 解鎖</span>
            <div className="ip-progress-bar">
              <div className="ip-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <span className="ip-progress-text">{state.totalDeposit} / {plot.unlockCrystals}</span>
        </div>
      </div>
    );
  }

  /* ── Active (unlocked) plot ── */
  const maxQty = Math.min(state.warehouseSeeds, plot.maxSeeds);

  return (
    <div className="ip-overlay ip-overlay--active" onClick={stopProp}>
      {/* Plot name + seeds */}
      <div className="ip-meta">
        <span className="ip-name">{plot.name}</span>
        <span className="ip-meta-divider">｜</span>
        <span className="ip-meta-item">種子庫存 <strong>{state.warehouseSeeds}</strong></span>
        <span className="ip-meta-divider">｜</span>
        <span className="ip-meta-item">上限 <strong>{plot.maxSeeds}</strong></span>
        <span className="ip-meta-divider">｜</span>
        <span className="ip-meta-item">成熟 <strong>10秒</strong></span>
      </div>

      {/* Action row */}
      <div className="ip-action-row">
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
          <>
            <span className="ip-state-text ip-state--ready">🌾 可收成（{plot.plantCount}）</span>
            <button
              className="ip-act-btn ip-act-btn--harvest"
              onClick={() => dispatch({ type: 'HARVEST', plotId: plot.id })}
            >
              收成
            </button>
          </>
        )}

        <button className="ip-close-btn" onClick={() => dispatch({ type: 'DESELECT_PLOT' })}>✕</button>
      </div>
    </div>
  );
}
