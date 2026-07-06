import { useGame } from '../game/GameContext';

export default function InfoPanel() {
  const { state, dispatch } = useGame();

  const plot = state.selectedPlotId !== null
    ? state.plots.find(p => p.id === state.selectedPlotId)
    : null;

  if (!plot || !plot.unlocked) {
    return (
      <div className="info-panel info-panel--empty">
        <span className="info-hint">點擊福田查看詳情</span>
      </div>
    );
  }

  function handleHarvest() {
    if (!plot || plot.state !== 'ready') return;
    dispatch({ type: 'HARVEST', plotId: plot.id });
    dispatch({ type: 'SELECT_PLOT', id: plot.id });
  }

  function handlePlant() {
    if (!plot || plot.state !== 'empty') return;
    dispatch({ type: 'PLANT', plotId: plot.id, quantity: state.plantQuantity });
  }

  return (
    <div className="info-panel">
      <div className="info-row">
        <span className="info-field-label">土地名稱</span>
        <span className="info-field-value">{plot.name}</span>
      </div>
      <div className="info-row">
        <span className="info-field-label">目前種子</span>
        <span className="info-field-value">曜金種子</span>
      </div>
      <div className="info-row">
        <span className="info-field-label">種子庫存</span>
        <span className="info-field-value">{state.warehouseSeeds}</span>
      </div>
      <div className="info-row">
        <span className="info-field-label">成熟時間</span>
        <span className="info-field-value">00:00:10（測試）</span>
      </div>
      <div className="info-row">
        <span className="info-field-label">預估產量</span>
        <span className="info-field-value">{state.plantQuantity * 5}</span>
      </div>

      {plot.state === 'empty' && (
        <div className="info-row info-row--qty">
          <span className="info-field-label">播種數量</span>
          <div className="qty-control">
            <button className="qty-btn" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: state.plantQuantity - 1 })}>－</button>
            <span className="qty-value">{state.plantQuantity}</span>
            <button className="qty-btn" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: state.plantQuantity + 1 })}>＋</button>
          </div>
        </div>
      )}

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
        <button className="action-btn action-btn--growing" disabled>
          生長中…
        </button>
      )}

      {plot.state === 'ready' && (
        <button className="action-btn action-btn--harvest" onClick={handleHarvest}>
          收成
        </button>
      )}
    </div>
  );
}
