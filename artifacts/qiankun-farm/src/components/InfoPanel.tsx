/**
 * InfoPanel Component — Game Scene Layer 4
 *
 * Absolute overlay on the parchment/info area of the background image.
 * Shows per-plot data dynamically; covers the static "點選土地開始耕作" text.
 * No agriculture-related buttons here — those are in QuickActions.
 */
import { useGame } from '../game/GameContext';

export default function InfoPanel() {
  const { state, dispatch } = useGame();
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  const plot = state.selectedPlotId !== null
    ? state.plots.find(p => p.id === state.selectedPlotId)
    : null;

  /* ── No plot selected: show idle hint over the parchment text ── */
  if (!plot) {
    return (
      <div className="ip-overlay ip-overlay--idle" onClick={stopProp}>
        <span className="ip-idle-hint">點選土地開始耕作</span>
      </div>
    );
  }

  /* ── Locked plot ── */
  if (!plot.unlocked) {
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
