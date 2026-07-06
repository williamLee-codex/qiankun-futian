import { useGame } from '../game/GameContext';

export default function InfoPanel() {
  const { state, dispatch } = useGame();

  const plot = state.selectedPlotId !== null
    ? state.plots.find(p => p.id === state.selectedPlotId)
    : null;

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  /* ── Locked plot ── */
  if (plot && !plot.unlocked) {
    const pct = Math.min(100, (state.totalDeposit / (plot.unlockCrystals ?? 1)) * 100);
    return (
      <div className="info-panel info-panel--visible info-panel--locked" onClick={stopProp}>
        <div className="locked-header">
          <span className="locked-icon">🔒</span>
          <div>
            <div className="locked-name">{plot.name}</div>
            <div className="locked-sub">尚未解鎖</div>
          </div>
        </div>
        <div className="locked-details">
          <div className="locked-row">
            <span className="lr-label">解鎖需求</span>
            <span className="lr-val">累積儲值 {plot.unlockCrystals} 💎</span>
          </div>
          <div className="locked-row">
            <span className="lr-label">目前儲值</span>
            <span className="lr-val">{state.totalDeposit} 💎</span>
          </div>
          <div className="locked-progress">
            <div className="locked-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="ip-side-btns">
          <button className="test-deposit-btn" onClick={() => dispatch({ type: 'TEST_DEPOSIT' })}>＋ 測試儲值 +100</button>
          <button className="ip-cancel-btn" onClick={() => dispatch({ type: 'DESELECT_PLOT' })}>✕ 關閉</button>
        </div>
      </div>
    );
  }

  /* ── Unlocked plot ── */
  if (plot && plot.unlocked) {
    return (
      <div className="info-panel info-panel--visible info-panel--active" onClick={stopProp}>
        <div className="ip-title-row">
          <span className="ip-plot-name">{plot.name}</span>
          <span className="ip-seed-name">曜金種子</span>
        </div>

        <div className="ip-stats">
          <div className="ip-stat">
            <span className="ip-stat-label">種子庫存</span>
            <span className="ip-stat-val">{state.warehouseSeeds}</span>
          </div>
          <div className="ip-stat">
            <span className="ip-stat-label">成熟時間</span>
            <span className="ip-stat-val">10 秒</span>
          </div>
          <div className="ip-stat">
            <span className="ip-stat-label">預估產量</span>
            <span className="ip-stat-val">{state.plantQuantity * 5}</span>
          </div>
          {plot.state === 'empty' && (
            <div className="ip-stat ip-stat--qty">
              <span className="ip-stat-label">播種數量</span>
              <div className="qty-row">
                <button className="qty-btn" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: state.plantQuantity - 1 })}>－</button>
                <span className="qty-num">{state.plantQuantity}</span>
                <button className="qty-btn" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: state.plantQuantity + 1 })}>＋</button>
              </div>
            </div>
          )}
        </div>

        <div className="ip-actions">
          {plot.state === 'empty' && (
            <button className="ip-btn ip-btn--plant" onClick={() => dispatch({ type: 'PLANT', plotId: plot.id, quantity: state.plantQuantity })}
              disabled={state.warehouseSeeds < state.plantQuantity}>
              播種
            </button>
          )}
          {plot.state === 'growing' && (
            <button className="ip-btn ip-btn--growing" disabled>生長中…</button>
          )}
          {plot.state === 'ready' && (
            <button className="ip-btn ip-btn--harvest" onClick={() => dispatch({ type: 'HARVEST', plotId: plot.id })}>✨ 收成</button>
          )}
          <button className="ip-cancel-btn" onClick={() => dispatch({ type: 'DESELECT_PLOT' })}>✕</button>
        </div>
      </div>
    );
  }

  return <div className="info-panel info-panel--hidden" />;
}
