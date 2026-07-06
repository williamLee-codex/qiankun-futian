/**
 * QuickActions Component — Game Scene Layer 5
 *
 * 三個快捷按鈕，解鎖條件全部綁定土地解鎖狀態：
 *   左  🌱 一鍵播種   — 解鎖第4塊土地「曜紫靈土」(plots[3])
 *   中  🌾 一鍵收成   — 解鎖第3塊土地「朱砂烈土」(plots[2])，初始即解鎖
 *   右  🔄 一鍵收播   — 解鎖第5塊土地「翡翠聖土」(plots[4])
 *       ✨ 智慧收播   — 升級，解鎖第6塊土地「黑金晶土」(plots[5])
 *
 * 智慧收播：種子不足時跳出補足視窗，可用金幣/水晶購買補足。
 * 種子單價：每顆 10 金幣，金幣不足部分以水晶補差（1水晶=100金幣等值）。
 */
import { useState } from 'react';
import { useGame } from '../game/GameContext';

/* ms between each harvest animation wave */
const ANIM_STAGGER   = 130;
const ANIM_BASE      = 900;
function harvestDelay(readyCount: number) {
  return readyCount * ANIM_STAGGER + ANIM_BASE;
}

/* Seed price */
const SEED_PRICE_COINS    = 10;   // per seed
const CRYSTAL_TO_COINS    = 100;  // 1 crystal = 100 gold equivalent

interface SmartModal {
  lacking:       number;   // seeds missing
  coinsNeeded:   number;   // total gold required for all lacking seeds
  coinsUsed:     number;   // gold actually deducted (≤ current coins)
  crystalsUsed:  number;   // crystals needed to cover remainder
  readyCount:    number;   // for determining if harvest already triggered
}

interface LockedInfo {
  title: string;
  hint:  string;
}

export default function QuickActions() {
  const { state, dispatch } = useGame();
  const [smartModal, setSmartModal] = useState<SmartModal | null>(null);
  const [lockedInfo, setLockedInfo] = useState<LockedInfo | null>(null);

  /* ── Unlock flags ── */
  const harvestUnlocked     = state.plots[2]?.unlocked ?? false; // 朱砂烈土
  const plantUnlocked       = state.plots[3]?.unlocked ?? false; // 曜紫靈土
  const harvestPlantUnlocked = state.plots[4]?.unlocked ?? false; // 翡翠聖土
  const smartUnlocked       = state.plots[5]?.unlocked ?? false; // 黑金晶土

  /* ── Active guards ── */
  const canPlant    = state.plots.some(p => p.unlocked && p.state === 'empty' && state.warehouseSeeds > 0);
  const canHarvest  = state.plots.some(p => p.state === 'ready');

  /* ── Right button variant ── */
  const rightIcon  = smartUnlocked ? '✨' : harvestPlantUnlocked ? '🔄' : '🔒';
  const rightLabel = smartUnlocked ? '智慧收播' : '一鍵收播';

  /* ── Calculate smart-harvest seed needs (pre-dispatch) ── */
  function calcSmartModal(readyCount: number): SmartModal | null {
    // After harvest all ready plots become empty → union with current empty plots
    const targetPlots = state.plots.filter(p =>
      p.unlocked && (p.state === 'empty' || p.state === 'ready')
    );
    const totalNeeded  = targetPlots.reduce((s, p) => s + p.maxSeeds, 0);
    const lacking      = Math.max(0, totalNeeded - state.warehouseSeeds);
    if (lacking === 0) return null;

    const coinsNeeded  = lacking * SEED_PRICE_COINS;
    const coinsUsed    = Math.min(state.coins, coinsNeeded);
    const crystalsUsed = Math.ceil(Math.max(0, coinsNeeded - coinsUsed) / CRYSTAL_TO_COINS);
    return { lacking, coinsNeeded, coinsUsed, crystalsUsed, readyCount };
  }

  /* ── Handlers ── */
  function handlePlant() {
    if (!plantUnlocked) {
      setLockedInfo({ title: '一鍵播種', hint: '需要解鎖第 4 塊土地「曜紫靈土」。' });
      return;
    }
    if (canPlant) dispatch({ type: 'PLANT_ALL' });
  }

  function handleHarvest() {
    if (!harvestUnlocked) {
      setLockedInfo({ title: '一鍵收成', hint: '需要解鎖第 3 塊土地「朱砂烈土」。' });
      return;
    }
    if (canHarvest) dispatch({ type: 'HARVEST_ALL' });
  }

  function handleRight() {
    if (!harvestPlantUnlocked) {
      setLockedInfo({ title: '一鍵收播', hint: '需要解鎖第 5 塊土地「翡翠聖土」。' });
      return;
    }
    const readyCount = state.plots.filter(p => p.state === 'ready').length;

    if (smartUnlocked) {
      /* ── 智慧收播 ── */
      const modal = calcSmartModal(readyCount);
      // Harvest immediately regardless
      dispatch({ type: 'HARVEST_ALL' });
      if (modal) {
        // Show purchase modal; planting will follow after user confirms/cancels
        setSmartModal(modal);
      } else {
        // Seeds sufficient — plant after animation
        setTimeout(() => dispatch({ type: 'PLANT_ALL' }), harvestDelay(readyCount));
      }
    } else {
      /* ── 一鍵收播 (plain) ── */
      dispatch({ type: 'HARVEST_ALL' });
      setTimeout(() => dispatch({ type: 'PLANT_ALL' }), harvestDelay(readyCount));
    }
  }

  /* Smart modal actions */
  function handleSmartConfirm() {
    if (!smartModal) return;
    dispatch({
      type: 'BUY_SEEDS_AND_PLANT_ALL',
      coinsUsed:    smartModal.coinsUsed,
      crystalsUsed: smartModal.crystalsUsed,
      seedsBought:  smartModal.lacking,
    });
    setSmartModal(null);
  }

  function handleSmartCancel() {
    if (!smartModal) return;
    // Plant with whatever seeds are available now
    dispatch({ type: 'PLANT_ALL' });
    setSmartModal(null);
  }

  /* ── Button state helpers ── */
  function plantClass() {
    if (!plantUnlocked)                       return 'qa-btn qa-btn--locked';
    if (!canPlant)                            return 'qa-btn qa-btn--disabled';
    return 'qa-btn';
  }
  function harvestClass() {
    if (!harvestUnlocked)                     return 'qa-btn qa-btn--locked';
    if (!canHarvest)                          return 'qa-btn qa-btn--disabled';
    return 'qa-btn';
  }
  function rightClass() {
    if (!harvestPlantUnlocked)                return 'qa-btn qa-btn--locked';
    if (!canHarvest && !canPlant)             return 'qa-btn qa-btn--disabled';
    return 'qa-btn';
  }

  return (
    <div className="qa-overlay" onClick={e => e.stopPropagation()}>

      {/* 🌱 一鍵播種 */}
      <button className={plantClass()} onClick={handlePlant} aria-label="一鍵播種">
        {plantUnlocked
          ? <><span className="qa-btn-icon">🌱</span><span className="qa-btn-label">一鍵播種</span></>
          : <><span className="qa-btn-label">一鍵播種</span><span className="qa-btn-lock">🔒</span></>}
      </button>

      {/* 🌾 一鍵收成 */}
      <button className={harvestClass()} onClick={handleHarvest} aria-label="一鍵收成">
        {harvestUnlocked
          ? <><span className="qa-btn-icon">🌾</span><span className="qa-btn-label">一鍵收成</span></>
          : <><span className="qa-btn-label">一鍵收成</span><span className="qa-btn-lock">🔒</span></>}
      </button>

      {/* 🔄 一鍵收播 / ✨ 智慧收播 */}
      <button className={rightClass()} onClick={handleRight} aria-label={rightLabel}>
        {harvestPlantUnlocked
          ? <><span className="qa-btn-icon">{rightIcon}</span><span className="qa-btn-label">{rightLabel}</span></>
          : <><span className="qa-btn-label">{rightLabel}</span><span className="qa-btn-lock">🔒</span></>}
      </button>

      {/* ── Locked unlock-info modal ── */}
      {lockedInfo && (
        <div className="qa-modal-backdrop" onClick={() => setLockedInfo(null)}>
          <div className="qa-modal-box" onClick={e => e.stopPropagation()}>
            <p className="qa-modal-title">🔒 {lockedInfo.title}</p>
            <p className="qa-modal-body">{lockedInfo.hint}</p>
            <button className="qa-modal-close" onClick={() => setLockedInfo(null)}>知道了</button>
          </div>
        </div>
      )}

      {/* ── 智慧收播：種子不足購買確認 ── */}
      {smartModal && (
        <div className="qa-modal-backdrop" onClick={handleSmartCancel}>
          <div className="qa-modal-box qa-modal-box--smart" onClick={e => e.stopPropagation()}>
            <p className="qa-modal-title">🌱 種子不足</p>
            <p className="qa-modal-body">目前曜金種子不足，是否立即補足種子？</p>

            <div className="qa-modal-costs">
              <div className="qa-cost-row">
                <span className="qa-cost-label">缺少種子</span>
                <span className="qa-cost-val">{smartModal.lacking} 顆</span>
              </div>
              <div className="qa-cost-row">
                <span className="qa-cost-label">🪙 需消耗金幣</span>
                <span className="qa-cost-val">{smartModal.coinsUsed} 枚</span>
              </div>
              {smartModal.crystalsUsed > 0 && (
                <div className="qa-cost-row">
                  <span className="qa-cost-label">💎 需消耗水晶</span>
                  <span className="qa-cost-val">{smartModal.crystalsUsed} 顆</span>
                </div>
              )}
              {/* Affordability warning */}
              {(smartModal.coinsUsed > state.coins ||
                smartModal.crystalsUsed > state.crystals) && (
                <p className="qa-cost-warn">⚠ 資源不足，將以現有種子播種。</p>
              )}
            </div>

            <div className="qa-modal-btns">
              <button className="qa-modal-btn qa-modal-btn--cancel" onClick={handleSmartCancel}>
                取消
              </button>
              <button
                className="qa-modal-btn qa-modal-btn--confirm"
                onClick={handleSmartConfirm}
                disabled={
                  smartModal.coinsUsed > state.coins ||
                  smartModal.crystalsUsed > state.crystals
                }
              >
                確認購買
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
