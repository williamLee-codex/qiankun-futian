import { useGame } from '../game/GameContext';

export default function InfoPanel() {
  const { state, dispatch } = useGame();

  const plot = state.selectedPlotId !== null
    ? state.plots.find(p => p.id === state.selectedPlotId)
    : null;

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  /* ── No plot selected ── */
  if (!plot) {
    return (
      <div className="info-panel info-panel--idle" onClick={stopProp}>
        <span className="ip-idle-hint">點選土地開始耕作</span>
      </div>
    );
  }

  /* ── Locked plot ── */
  if (!plot.unlocked) {
    const pct = Math.min(100, (state.totalDeposit / (plot.unlockCrystals ?? 1)) * 100);
    return (
      <div className="info-panel info-panel--locked" onClick={stopProp}>
        <div className="ip-locked-header">
          <span className="ip-locked-icon">🔒</span>
          <div>
            <div className="ip-locked-name">{plot.name}</div>
            <div className="ip-locked-sub">需累積儲值 {plot.unlockCrystals} 💎 解鎖</div>
          </div>
          <div className="ip-locked-right">
            <span className="ip-locked-progress-text">{state.totalDeposit} / {plot.unlockCrystals}</span>
            <div className="ip-locked-bar">
              <div className="ip-locked-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <div className="ip-locked-actions">
          <button className="ip-action-btn ip-action-btn--deposit" onClick={() => dispatch({ type: 'TEST_DEPOSIT' })}>
            ＋ 測試儲值 +100
          </button>
          <button className="ip-action-btn ip-action-btn--close" onClick={() => dispatch({ type: 'DESELECT_PLOT' })}>
            ✕ 關閉
          </button>
        </div>
      </div>
    );
  }

  /* ── Active (unlocked) plot ── */
  const maxQty = Math.min(state.warehouseSeeds, plot.maxSeeds);

  return (
    <div className="info-panel info-panel--active" onClick={stopProp}>
      {/* Row 1: plot name + meta */}
      <div className="ip-row ip-row--title">
        <div className="ip-name-group">
          <span className="ip-plot-name">{plot.name}</span>
          <span className="ip-plot-max">上限 {plot.maxSeeds}</span>
        </div>
        <div className="ip-seeds-group">
          <span className="ip-seeds-label">種子庫存</span>
          <span className="ip-seeds-val">{state.warehouseSeeds}</span>
        </div>
        <div className="ip-time-group">
          <span className="ip-time-label">成熟時間</span>
          <span className="ip-time-val">10 秒</span>
        </div>
      </div>

      {/* Row 2: qty + action */}
      <div className="ip-row ip-row--action">
        {plot.state === 'empty' && (
          <>
            <div className="ip-qty-row">
              <button className="ip-qty-btn" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: state.plantQuantity - 1 })}>－</button>
              <span className="ip-qty-num">{state.plantQuantity}</span>
              <button className="ip-qty-btn" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: state.plantQuantity + 1 })}>＋</button>
              <button className="ip-qty-btn ip-qty-btn--max" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: maxQty })}>最大</button>
            </div>
            <button
              className="ip-action-btn ip-action-btn--plant"
              disabled={state.warehouseSeeds <= 0}
              onClick={() => dispatch({ type: 'PLANT', plotId: plot.id, quantity: state.plantQuantity })}
            >
              🌱 播種
            </button>
          </>
        )}

        {plot.state === 'growing' && (
          <div className="ip-growing-state">🌿 生長中…</div>
        )}

        {plot.state === 'ready' && (
          <>
            <div className="ip-ready-state">🌾 可收成（{plot.plantCount}）</div>
            <button
              className="ip-action-btn ip-action-btn--harvest"
              onClick={() => dispatch({ type: 'HARVEST', plotId: plot.id })}
            >
              收成
            </button>
          </>
        )}

        <button className="ip-action-btn ip-action-btn--close" onClick={() => dispatch({ type: 'DESELECT_PLOT' })}>✕</button>
      </div>
    </div>
  );
}
