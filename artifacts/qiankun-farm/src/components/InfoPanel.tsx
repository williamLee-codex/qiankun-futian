import { useGame } from '../game/GameContext';

export default function InfoPanel() {
  const { state, dispatch } = useGame();

  const plot = state.selectedPlotId !== null
    ? state.plots.find(p => p.id === state.selectedPlotId)
    : null;

  if (!plot || !plot.unlocked) {
    return (
      <div className="info-panel info-panel--empty">
        <span className="info-hint">↑ 點擊福田查看詳情</span>
        <button
          className="test-deposit-btn"
          onClick={() => dispatch({ type: 'TEST_DEPOSIT' })}
        >
          測試儲值 +100
        </button>
      </div>
    );
  }

  function handleHarvest() {
    if (!plot || plot.state !== 'ready') return;
    dispatch({ type: 'HARVEST', plotId: plot.id });
  }

  function handlePlant() {
    if (!plot || plot.state !== 'empty') return;
    dispatch({ type: 'PLANT', plotId: plot.id, quantity: state.plantQuantity });
  }

  return (
    <div className="info-panel">
      <div className="info-fields">
        <div className="info-field">
          <span className="info-field-label">土地</span>
          <span className="info-field-value">{plot.name}</span>
        </div>
        <div className="info-field">
          <span className="info-field-label">種子</span>
          <span className="info-field-value">曜金種子</span>
        </div>
        <div className="info-field">
          <span className="info-field-label">庫存</span>
          <span className="info-field-value">{state.warehouseSeeds}</span>
        </div>
        <div className="info-field">
          <span className="info-field-label">時間</span>
          <span className="info-field-value">10秒</span>
        </div>
        <div className="info-field">
          <span className="info-field-label">產量</span>
          <span className="info-field-value">{state.plantQuantity * 5}</span>
        </div>

        {plot.state === 'empty' && (
          <div className="info-field info-field--qty">
            <span className="info-field-label">數量</span>
            <div className="qty-control">
              <button className="qty-btn" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: state.plantQuantity - 1 })}>－</button>
              <span className="qty-value">{state.plantQuantity}</span>
              <button className="qty-btn" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: state.plantQuantity + 1 })}>＋</button>
            </div>
          </div>
        )}
      </div>

      <div className="info-actions">
        {plot.state === 'empty' && (
          <button
            className="action-btn action-btn--plant"
            onClick={handlePlant}
            disabled={state.warehouseSeeds < state.plantQuantity}
          >
            播種
          </button>
        )}
        {plot.state === 'growing' && (
          <button className="action-btn action-btn--growing" disabled>生長中…</button>
        )}
        {plot.state === 'ready' && (
          <button className="action-btn action-btn--harvest" onClick={handleHarvest}>
            ✨ 收成
          </button>
        )}
      </div>
    </div>
  );
}
