import { useState } from 'react';
import { useGame } from '../game/GameContext';

const VIP_THRESHOLD = 600;

/* ms delay per plot × number of ready plots + base animation time */
function harvestAnimDuration(readyCount: number) {
  return readyCount * 130 + 850;
}

export default function InfoPanel() {
  const { state, dispatch } = useGame();
  const [vipPrompt, setVipPrompt] = useState(false);

  const plot = state.selectedPlotId !== null
    ? state.plots.find(p => p.id === state.selectedPlotId)
    : null;

  /* Global computed values */
  const canPlantAny = state.plots.some(p => p.unlocked && p.state === 'empty' && state.warehouseSeeds > 0);
  const canHarvestAny = state.plots.some(p => p.state === 'ready');
  const vipUnlocked = state.totalDeposit >= VIP_THRESHOLD;

  const handlePlantAll = () => dispatch({ type: 'PLANT_ALL' });
  const handleHarvestAll = () => dispatch({ type: 'HARVEST_ALL' });

  const handleHarvestAndPlant = () => {
    if (!vipUnlocked) { setVipPrompt(true); return; }
    const readyCount = state.plots.filter(p => p.state === 'ready').length;
    dispatch({ type: 'HARVEST_ALL' });
    /* Wait for harvest animations to finish, then plant */
    setTimeout(() => dispatch({ type: 'PLANT_ALL' }), harvestAnimDuration(readyCount));
  };

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  /* ──────────────────────────────────────────
     LOCKED PLOT
  ────────────────────────────────────────── */
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

  /* ──────────────────────────────────────────
     UNLOCKED PLOT (active)
  ────────────────────────────────────────── */
  if (plot && plot.unlocked) {
    const maxForPlot = Math.min(state.warehouseSeeds, plot.maxSeeds);
    const setMax = () => dispatch({ type: 'SET_PLANT_QUANTITY', qty: maxForPlot });

    return (
      <div className="info-panel info-panel--visible info-panel--active" onClick={stopProp}>

        {/* ── Title row ── */}
        <div className="ip-title-row">
          <span className="ip-plot-name">{plot.name}</span>
          <span className="ip-plot-meta">最多 {plot.maxSeeds} 顆</span>
        </div>

        {/* ── Stats ── */}
        <div className="ip-stats">
          <div className="ip-stat">
            <span className="ip-stat-label">種子庫存</span>
            <span className="ip-stat-val">{state.warehouseSeeds}</span>
          </div>
          <div className="ip-stat">
            <span className="ip-stat-label">成熟時間</span>
            <span className="ip-stat-val">10 秒</span>
          </div>

          {/* quantity row only when empty */}
          {plot.state === 'empty' && (
            <div className="ip-stat ip-stat--qty">
              <span className="ip-stat-label">播種數量</span>
              <div className="qty-row">
                <button className="qty-btn" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: state.plantQuantity - 1 })}>－</button>
                <span className="qty-num">{state.plantQuantity}</span>
                <button className="qty-btn" onClick={() => dispatch({ type: 'SET_PLANT_QUANTITY', qty: state.plantQuantity + 1 })}>＋</button>
                <button className="qty-btn qty-btn--max" onClick={setMax}>最大</button>
              </div>
            </div>
          )}

          {/* ready status */}
          {plot.state === 'ready' && (
            <div className="ip-stat">
              <span className="ip-stat-label">已成熟</span>
              <span className="ip-stat-val ip-stat-val--ready">🌾 {plot.plantCount} 顆</span>
            </div>
          )}
        </div>

        {/* ── Action buttons ── */}
        <div className="ip-actions">
          {/* Single plot actions */}
          {plot.state === 'empty' && (
            <button
              className="ip-btn ip-btn--plant"
              disabled={state.warehouseSeeds <= 0}
              onClick={() => dispatch({ type: 'PLANT', plotId: plot.id, quantity: state.plantQuantity })}
            >
              播種
            </button>
          )}
          {plot.state === 'growing' && (
            <button className="ip-btn ip-btn--growing" disabled>生長中…</button>
          )}
          {plot.state === 'ready' && (
            <button className="ip-btn ip-btn--harvest" onClick={() => dispatch({ type: 'HARVEST', plotId: plot.id })}>
              🌾 收成
            </button>
          )}

          {/* Divider */}
          <div className="ip-btn-divider" />

          {/* Global actions */}
          <button className="ip-btn ip-btn--plant-all" disabled={!canPlantAny} onClick={handlePlantAll}>🌱 一鍵播種</button>
          <button className="ip-btn ip-btn--harvest-all" disabled={!canHarvestAny} onClick={handleHarvestAll}>🌾 一鍵收成</button>

          {/* VIP one-click harvest+plant */}
          <button
            className={`ip-btn ip-btn--vip${vipUnlocked ? '' : ' ip-btn--vip-locked'}`}
            onClick={handleHarvestAndPlant}
          >
            {vipUnlocked ? '🔄 一鍵收播' : '🔒 一鍵收播'}
          </button>

          <button className="ip-cancel-btn" onClick={() => dispatch({ type: 'DESELECT_PLOT' })}>✕</button>
        </div>

        {/* VIP unlock prompt */}
        {vipPrompt && (
          <div className="vip-prompt" onClick={() => setVipPrompt(false)}>
            <div className="vip-prompt-box" onClick={e => e.stopPropagation()}>
              <p className="vip-prompt-msg">累積儲值滿 600 水晶即可解鎖【一鍵收播】功能。</p>
              <p className="vip-prompt-progress">目前累積儲值：{state.totalDeposit} / 600 水晶</p>
              <button className="vip-prompt-close" onClick={() => setVipPrompt(false)}>知道了</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ──────────────────────────────────────────
     NO PLOT SELECTED — show global action bar
  ────────────────────────────────────────── */
  return (
    <div className="info-panel info-panel--global" onClick={stopProp}>
      <span className="ip-hint">點選土地開始耕作</span>
      <div className="ip-actions ip-actions--row">
        <button className="ip-btn ip-btn--plant-all" disabled={!canPlantAny} onClick={handlePlantAll}>🌱 一鍵播種</button>
        <button className="ip-btn ip-btn--harvest-all" disabled={!canHarvestAny} onClick={handleHarvestAll}>🌾 一鍵收成</button>
        <button
          className={`ip-btn ip-btn--vip${vipUnlocked ? '' : ' ip-btn--vip-locked'}`}
          onClick={handleHarvestAndPlant}
        >
          {vipUnlocked ? '🔄 一鍵收播' : '🔒 一鍵收播'}
        </button>
      </div>
      {vipPrompt && (
        <div className="vip-prompt" onClick={() => setVipPrompt(false)}>
          <div className="vip-prompt-box" onClick={e => e.stopPropagation()}>
            <p className="vip-prompt-msg">累積儲值滿 600 水晶即可解鎖【一鍵收播】功能。</p>
            <p className="vip-prompt-progress">目前累積儲值：{state.totalDeposit} / 600 水晶</p>
            <button className="vip-prompt-close" onClick={() => setVipPrompt(false)}>知道了</button>
          </div>
        </div>
      )}
    </div>
  );
}
