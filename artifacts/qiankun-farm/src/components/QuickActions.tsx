/**
 * QuickActions Component — Game Scene Layer 5
 *
 * Transparent interactive overlay on the three button frames
 * drawn in the background image.
 * • 一鍵播種: plant all unlocked empty plots to max capacity
 * • 一鍵收成: harvest all ready plots
 * • 一鍵收播: VIP — harvest then replant (unlocks at 600 crystals)
 */
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

  const handleHarvestAndPlant = () => {
    if (!vipUnlocked) { setVipPrompt(true); return; }
    const readyCount = state.plots.filter(p => p.state === 'ready').length;
    dispatch({ type: 'HARVEST_ALL' });
    setTimeout(() => dispatch({ type: 'PLANT_ALL' }), harvestAnimDuration(readyCount));
  };

  return (
    <div className="qa-overlay" onClick={e => e.stopPropagation()}>
      {/* 一鍵播種 */}
      <button
        className={`qa-zone${canPlantAny ? '' : ' qa-zone--disabled'}`}
        disabled={!canPlantAny}
        onClick={() => dispatch({ type: 'PLANT_ALL' })}
        aria-label="一鍵播種"
      />

      {/* 一鍵收成 */}
      <button
        className={`qa-zone${canHarvestAny ? '' : ' qa-zone--disabled'}`}
        disabled={!canHarvestAny}
        onClick={() => dispatch({ type: 'HARVEST_ALL' })}
        aria-label="一鍵收成"
      />

      {/* 一鍵收播 */}
      <button
        className={`qa-zone${vipUnlocked ? '' : ' qa-zone--locked'}`}
        onClick={handleHarvestAndPlant}
        aria-label={vipUnlocked ? '一鍵收播' : '一鍵收播（已鎖定）'}
      />

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
