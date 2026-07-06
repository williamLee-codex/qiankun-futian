/**
 * QuickActions — 四個獨立快捷按鈕（z-index: 20）
 *
 * 順序與解鎖條件：
 *   1. 一鍵收成 — 解鎖第3塊（朱砂烈土, plots[2]）
 *   2. 一鍵播種 — 解鎖第4塊（曜紫靈土, plots[3]）
 *   3. 一鍵收播 — 解鎖第5塊（翡翠聖土, plots[4]）
 *   4. 智慧收播 — 解鎖第6塊（黑金晶土, plots[5]）
 *
 * 底圖提供四格按鈕框與裝飾背景，系統只疊加文字與鎖頭。
 * 鎖定時：按鈕變暗 + 顯示 🔒 + 點擊顯示解鎖提示。
 * 智慧收播：種子不足時跳出補足確認視窗。
 */
import { useState } from 'react';
import { useGame } from '../game/GameContext';

const ANIM_STAGGER = 130;
const ANIM_BASE    = 900;
function harvestDelay(readyCount: number) {
  return readyCount * ANIM_STAGGER + ANIM_BASE;
}

const SEED_PRICE_COINS = 10;
const CRYSTAL_TO_COINS = 100;

interface SmartModal {
  lacking:      number;
  coinsNeeded:  number;
  coinsUsed:    number;
  crystalsUsed: number;
  readyCount:   number;
}

interface LockedInfo {
  title: string;
  hint:  string;
}

export default function QuickActions() {
  const { state, dispatch } = useGame();
  const [smartModal, setSmartModal] = useState<SmartModal | null>(null);
  const [lockedInfo, setLockedInfo] = useState<LockedInfo | null>(null);

  /* ── 各按鈕解鎖旗標 ── */
  const harvestUnlocked  = state.plots[2]?.unlocked ?? false; // 朱砂烈土
  const plantUnlocked    = state.plots[3]?.unlocked ?? false; // 曜紫靈土
  const hvPlantUnlocked  = state.plots[4]?.unlocked ?? false; // 翡翠聖土
  const smartUnlocked    = state.plots[5]?.unlocked ?? false; // 黑金晶土

  /* ── 動作可執行旗標 ── */
  const canPlant   = state.plots.some(p => p.unlocked && p.state === 'empty' && state.warehouseSeeds > 0);
  const canHarvest = state.plots.some(p => p.state === 'ready');

  /* ── 智慧收播：計算補種費用 ── */
  function calcSmartModal(readyCount: number): SmartModal | null {
    const targetPlots = state.plots.filter(p =>
      p.unlocked && (p.state === 'empty' || p.state === 'ready')
    );
    const totalNeeded = targetPlots.reduce((s, p) => s + p.maxSeeds, 0);
    const lacking     = Math.max(0, totalNeeded - state.warehouseSeeds);
    if (lacking === 0) return null;

    const coinsNeeded  = lacking * SEED_PRICE_COINS;
    const coinsUsed    = Math.min(state.coins, coinsNeeded);
    const crystalsUsed = Math.ceil(Math.max(0, coinsNeeded - coinsUsed) / CRYSTAL_TO_COINS);
    return { lacking, coinsNeeded, coinsUsed, crystalsUsed, readyCount };
  }

  /* ── 一鍵收成 ── */
  function handleHarvest() {
    if (!harvestUnlocked) {
      setLockedInfo({ title: '一鍵收成', hint: '需要解鎖第 3 塊土地「朱砂烈土」（花費 888 金幣）。' });
      return;
    }
    if (canHarvest) dispatch({ type: 'HARVEST_ALL' });
  }

  /* ── 一鍵播種 ── */
  function handlePlant() {
    if (!plantUnlocked) {
      setLockedInfo({ title: '一鍵播種', hint: '需要解鎖第 4 塊土地「曜紫靈土」（累積儲值 100 水晶）。' });
      return;
    }
    if (canPlant) dispatch({ type: 'PLANT_ALL' });
  }

  /* ── 一鍵收播 ── */
  function handleHvPlant() {
    if (!hvPlantUnlocked) {
      setLockedInfo({ title: '一鍵收播', hint: '需要解鎖第 5 塊土地「翡翠聖土」（累積儲值 300 水晶）。' });
      return;
    }
    const readyCount = state.plots.filter(p => p.state === 'ready').length;
    dispatch({ type: 'HARVEST_ALL' });
    setTimeout(() => dispatch({ type: 'PLANT_ALL' }), harvestDelay(readyCount));
  }

  /* ── 智慧收播 ── */
  function handleSmart() {
    if (!smartUnlocked) {
      setLockedInfo({ title: '智慧收播', hint: '需要解鎖第 6 塊土地「黑金晶土」（累積儲值 600 水晶）。' });
      return;
    }
    const readyCount = state.plots.filter(p => p.state === 'ready').length;
    const modal = calcSmartModal(readyCount);
    dispatch({ type: 'HARVEST_ALL' });
    if (modal) {
      setSmartModal(modal);
    } else {
      setTimeout(() => dispatch({ type: 'PLANT_ALL' }), harvestDelay(readyCount));
    }
  }

  /* ── 智慧收播：確認購買 ── */
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
    dispatch({ type: 'PLANT_ALL' });
    setSmartModal(null);
  }

  /* ── CSS class helpers ── */
  function btnClass(unlocked: boolean, active: boolean) {
    if (!unlocked) return 'qa-btn qa-btn--locked';
    if (!active)   return 'qa-btn qa-btn--disabled';
    return 'qa-btn';
  }

  const buttons = [
    {
      label: '一鍵收成',
      unlocked: harvestUnlocked,
      active: canHarvest,
      onClick: handleHarvest,
    },
    {
      label: '一鍵播種',
      unlocked: plantUnlocked,
      active: canPlant,
      onClick: handlePlant,
    },
    {
      label: '一鍵收播',
      unlocked: hvPlantUnlocked,
      active: canHarvest || canPlant,
      onClick: handleHvPlant,
    },
    {
      label: '智慧收播',
      unlocked: smartUnlocked,
      active: canHarvest || canPlant,
      onClick: handleSmart,
    },
  ];

  return (
    <div className="qa-overlay" onClick={e => e.stopPropagation()}>

      {buttons.map(({ label, unlocked, active, onClick }) => (
        <button
          key={label}
          className={btnClass(unlocked, active)}
          onClick={onClick}
          aria-label={label}
        >
          <span className="qa-btn-label">{label}</span>
          {!unlocked && <span className="qa-btn-lock">🔒</span>}
        </button>
      ))}

      {/* ── 鎖定提示 Modal ── */}
      {lockedInfo && (
        <div className="qa-modal-backdrop" onClick={() => setLockedInfo(null)}>
          <div className="qa-modal-box" onClick={e => e.stopPropagation()}>
            <p className="qa-modal-title">🔒 {lockedInfo.title}</p>
            <p className="qa-modal-body">{lockedInfo.hint}</p>
            <button className="qa-modal-close" onClick={() => setLockedInfo(null)}>知道了</button>
          </div>
        </div>
      )}

      {/* ── 智慧收播：種子不足確認 ── */}
      {smartModal && (
        <div className="qa-modal-backdrop" onClick={handleSmartCancel}>
          <div className="qa-modal-box qa-modal-box--smart" onClick={e => e.stopPropagation()}>
            <p className="qa-modal-title">🌱 種子不足</p>
            <p className="qa-modal-body">是否花費資源補足種子後立即播種？</p>

            <div className="qa-modal-costs">
              <div className="qa-cost-row">
                <span className="qa-cost-label">缺少種子</span>
                <span className="qa-cost-val">{smartModal.lacking} 顆</span>
              </div>
              <div className="qa-cost-row">
                <span className="qa-cost-label">🪙 消耗金幣</span>
                <span className="qa-cost-val">{smartModal.coinsUsed} 枚</span>
              </div>
              {smartModal.crystalsUsed > 0 && (
                <div className="qa-cost-row">
                  <span className="qa-cost-label">💎 消耗水晶</span>
                  <span className="qa-cost-val">{smartModal.crystalsUsed} 顆</span>
                </div>
              )}
              {(smartModal.coinsUsed > state.coins || smartModal.crystalsUsed > state.crystals) && (
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
