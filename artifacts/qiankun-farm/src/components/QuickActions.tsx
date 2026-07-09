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
import { SEED_SHOP_DATA } from '../game/types';
import type { CropId } from '../game/types';

const ANIM_STAGGER = 130;
const ANIM_BASE    = 900;
function harvestDelay(readyCount: number) {
  return readyCount * ANIM_STAGGER + ANIM_BASE;
}

interface SeedPurchase { cropId: CropId; seeds: number; cost: number; currency: 'coins' | 'crystals' }

interface SmartModal {
  purchases:    SeedPurchase[];
  coinsNeeded:  number;
  crystalsNeeded: number;
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
  const canPlant   = state.plots.some(p => p.unlocked && p.state === 'empty' && state.seedInventory[p.cropId] > 0);
  const canHarvest = state.plots.some(p => p.state === 'ready');

  /* ── 智慧收播：依各田缺少的種子分別計算補種費用（用種子商店牌價，整單位購買）── */
  function calcSmartModal(readyCount: number): SmartModal | null {
    const targetPlots = state.plots.filter(p =>
      p.unlocked && (p.state === 'empty' || p.state === 'ready')
    );
    const purchases: SeedPurchase[] = [];
    for (const plot of targetPlots) {
      const lacking = Math.max(0, plot.maxSeeds - state.seedInventory[plot.cropId]);
      if (lacking <= 0) continue;
      const data  = SEED_SHOP_DATA[plot.cropId];
      const units = Math.ceil(lacking / data.unitQty);
      purchases.push({
        cropId: plot.cropId,
        seeds: units * data.unitQty,
        cost:  units * data.unitCost,
        currency: data.currency,
      });
    }
    if (purchases.length === 0) return null;

    const coinsNeeded    = purchases.filter(p => p.currency === 'coins').reduce((s, p) => s + p.cost, 0);
    const crystalsNeeded = purchases.filter(p => p.currency === 'crystals').reduce((s, p) => s + p.cost, 0);
    const coinsUsed    = Math.min(state.coins, coinsNeeded);
    const crystalsUsed = Math.min(state.crystals, crystalsNeeded);
    return { purchases, coinsNeeded, crystalsNeeded, coinsUsed, crystalsUsed, readyCount };
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
      purchases: smartModal.purchases.map(p => ({ cropId: p.cropId, seeds: p.seeds })),
      coinsUsed:    smartModal.coinsUsed,
      crystalsUsed: smartModal.crystalsUsed,
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

  const stopAll = (e: React.MouseEvent | React.PointerEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <>
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
      </div>

      {/* ── 鎖定提示 Modal — 在 qa-overlay 之外，相對 game-shell 定位，覆蓋全畫面 ── */}
      {lockedInfo && (
        <div
          className="qa-modal-backdrop"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setLockedInfo(null); }}
          onPointerDown={stopAll}
          onTouchStart={stopAll}
        >
          <div
            className="qa-modal-box"
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
          >
            <p className="qa-modal-title">🔒 {lockedInfo.title}</p>
            <p className="qa-modal-body">{lockedInfo.hint}</p>
            <button
              className="qa-modal-close"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setLockedInfo(null); }}
              onPointerDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {/* ── 智慧收播：種子不足確認 — 同樣在 qa-overlay 之外 ── */}
      {smartModal && (
        <div
          className="qa-modal-backdrop"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleSmartCancel(); }}
          onPointerDown={stopAll}
          onTouchStart={stopAll}
        >
          <div
            className="qa-modal-box qa-modal-box--smart"
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
          >
            <p className="qa-modal-title">🌱 種子不足</p>
            <p className="qa-modal-body">是否花費資源補足種子後立即播種？</p>

            <div className="qa-modal-costs">
              {smartModal.purchases.map(p => (
                <div className="qa-cost-row" key={p.cropId}>
                  <span className="qa-cost-label">補足 {SEED_SHOP_DATA[p.cropId].name}</span>
                  <span className="qa-cost-val">
                    {p.seeds} 顆（{p.cost} {p.currency === 'coins' ? '🪙' : '💎'}）
                  </span>
                </div>
              ))}
              {smartModal.coinsNeeded > 0 && (
                <div className="qa-cost-row">
                  <span className="qa-cost-label">🪙 消耗金幣合計</span>
                  <span className="qa-cost-val">{smartModal.coinsUsed} 枚</span>
                </div>
              )}
              {smartModal.crystalsNeeded > 0 && (
                <div className="qa-cost-row">
                  <span className="qa-cost-label">💎 消耗水晶合計</span>
                  <span className="qa-cost-val">{smartModal.crystalsUsed} 顆</span>
                </div>
              )}
              {(smartModal.coinsUsed < smartModal.coinsNeeded || smartModal.crystalsUsed < smartModal.crystalsNeeded) && (
                <p className="qa-cost-warn">⚠ 資源不足，將以現有種子播種。</p>
              )}
            </div>

            <div className="qa-modal-btns">
              <button
                className="qa-modal-btn qa-modal-btn--cancel"
                onClick={(e) => { e.stopPropagation(); handleSmartCancel(); }}
                onPointerDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
              >
                取消
              </button>
              <button
                className="qa-modal-btn qa-modal-btn--confirm"
                onClick={(e) => { e.stopPropagation(); handleSmartConfirm(); }}
                onPointerDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                disabled={
                  smartModal.coinsNeeded > state.coins ||
                  smartModal.crystalsNeeded > state.crystals
                }
              >
                確認購買
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
