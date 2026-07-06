/**
 * QuickActions Component — Game Scene Layer 5
 *
 * Renders text labels OVER the three empty button frames
 * that are drawn in the background image.
 *
 * • 🌱 一鍵播種  — plant all empty unlocked plots
 * • 🌾 一鍵收成  — harvest all ready plots
 * • 🔁 一鍵收播  — VIP: harvest then replant (requires totalDeposit ≥ 600)
 */
import { useState } from 'react';
import { useGame } from '../game/GameContext';

const VIP_THRESHOLD = 600;

function harvestAnimDelay(readyCount: number) {
  return readyCount * 130 + 900;
}

export default function QuickActions() {
  const { state, dispatch } = useGame();
  const [vipPrompt, setVipPrompt] = useState(false);

  const canPlantAny   = state.plots.some(p => p.unlocked && p.state === 'empty' && state.warehouseSeeds > 0);
  const canHarvestAny = state.plots.some(p => p.state === 'ready');
  const vipUnlocked   = state.totalDeposit >= VIP_THRESHOLD;

  const handleHarvestAndPlant = () => {
    if (!vipUnlocked) { setVipPrompt(true); return; }
    const readyCount = state.plots.filter(p => p.state === 'ready').length;
    dispatch({ type: 'HARVEST_ALL' });
    setTimeout(() => dispatch({ type: 'PLANT_ALL' }), harvestAnimDelay(readyCount));
  };

  return (
    <div className="qa-overlay" onClick={e => e.stopPropagation()}>

      {/* 🌱 一鍵播種 */}
      <button
        className={`qa-btn${canPlantAny ? '' : ' qa-btn--disabled'}`}
        disabled={!canPlantAny}
        onClick={() => dispatch({ type: 'PLANT_ALL' })}
        aria-label="一鍵播種"
      >
        <span className="qa-btn-icon">🌱</span>
        <span className="qa-btn-label">一鍵播種</span>
      </button>

      {/* 🌾 一鍵收成 */}
      <button
        className={`qa-btn${canHarvestAny ? '' : ' qa-btn--disabled'}`}
        disabled={!canHarvestAny}
        onClick={() => dispatch({ type: 'HARVEST_ALL' })}
        aria-label="一鍵收成"
      >
        <span className="qa-btn-icon">🌾</span>
        <span className="qa-btn-label">一鍵收成</span>
      </button>

      {/* 🔁 一鍵收播 (VIP) */}
      <button
        className={`qa-btn${vipUnlocked ? '' : ' qa-btn--locked'}`}
        onClick={handleHarvestAndPlant}
        aria-label={vipUnlocked ? '一鍵收播' : '一鍵收播（VIP鎖定）'}
      >
        <span className="qa-btn-icon">{vipUnlocked ? '🔁' : '🔒'}</span>
        <span className="qa-btn-label">
          {vipUnlocked
            ? '一鍵收播'
            : `累積儲值滿${VIP_THRESHOLD}水晶解鎖`}
        </span>
      </button>

      {/* VIP unlock prompt */}
      {vipPrompt && (
        <div className="vip-prompt" onClick={() => setVipPrompt(false)}>
          <div className="vip-prompt-box" onClick={e => e.stopPropagation()}>
            <p className="vip-prompt-msg">累積儲值滿 {VIP_THRESHOLD} 水晶即可解鎖【一鍵收播】功能。</p>
            <p className="vip-prompt-progress">目前累積儲值：{state.totalDeposit} / {VIP_THRESHOLD} 水晶</p>
            <button className="vip-prompt-close" onClick={() => setVipPrompt(false)}>知道了</button>
          </div>
        </div>
      )}
    </div>
  );
}
