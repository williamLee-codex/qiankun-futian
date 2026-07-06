import { useState } from 'react';
import { useGame } from '../game/GameContext';

const VIP_THRESHOLD = 600;

function harvestAnimDuration(readyCount: number) {
  return readyCount * 130 + 900;
}

export default function QuickActions() {
  const { state, dispatch } = useGame();
  const [vipPrompt, setVipPrompt] = useState(false);

  const canPlantAny   = state.plots.some(p => p.unlocked && p.state === 'empty' && state.warehouseSeeds > 0);
  const canHarvestAny = state.plots.some(p => p.state === 'ready');
  const vipUnlocked   = state.totalDeposit >= VIP_THRESHOLD;

  const handlePlantAll = () => {
    dispatch({ type: 'PLANT_ALL' });
  };

  const handleHarvestAll = () => {
    dispatch({ type: 'HARVEST_ALL' });
  };

  const handleHarvestAndPlant = () => {
    if (!vipUnlocked) { setVipPrompt(true); return; }
    const readyCount = state.plots.filter(p => p.state === 'ready').length;
    dispatch({ type: 'HARVEST_ALL' });
    setTimeout(() => dispatch({ type: 'PLANT_ALL' }), harvestAnimDuration(readyCount));
  };

  return (
    <div className="quick-actions" onClick={e => e.stopPropagation()}>
      <button
        className="qa-btn qa-btn--plant"
        disabled={!canPlantAny}
        onClick={handlePlantAll}
      >
        🌱 一鍵播種
      </button>

      <button
        className="qa-btn qa-btn--harvest"
        disabled={!canHarvestAny}
        onClick={handleHarvestAll}
      >
        🌾 一鍵收成
      </button>

      <button
        className={`qa-btn qa-btn--vip${vipUnlocked ? '' : ' qa-btn--locked'}`}
        onClick={handleHarvestAndPlant}
      >
        {vipUnlocked ? '🔄 一鍵收播' : '🔒 一鍵收播'}
      </button>

      {/* VIP unlock prompt — fixed overlay inside canvas */}
      {vipPrompt && (
        <div className="vip-prompt" onClick={() => setVipPrompt(false)}>
          <div className="vip-prompt-box" onClick={e => e.stopPropagation()}>
            <p className="vip-prompt-msg">
              累積儲值滿 600 水晶即可解鎖【一鍵收播】功能。
            </p>
            <p className="vip-prompt-progress">
              目前累積儲值：{state.totalDeposit} / 600 水晶
            </p>
            <button className="vip-prompt-close" onClick={() => setVipPrompt(false)}>
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
