import { useState } from 'react';
import { useGame } from '../../game/GameContext';
import { CROP_IDS, CROP_DATA, SEED_SHOP_DATA, SEED_MAX_UNITS, SEED_BIG_SPEND_RATIO } from '../../game/types';
import type { CropId } from '../../game/types';

/** 種子購買區塊：每種種子以「播種單位」購買，最多 10 單位，不提供「最大／一鍵買滿」 */
function SeedBuyRow({ cropId }: { cropId: CropId }) {
  const { state, dispatch } = useGame();
  const data  = SEED_SHOP_DATA[cropId];
  const plot  = state.plots.find(p => p.cropId === cropId);
  const isUnlocked = plot?.unlocked ?? false;
  const stock = state.seedInventory[cropId];

  const [units, setUnits] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState(false);

  const seeds   = units * data.unitQty;
  const cost    = units * data.unitCost;
  const balance = data.currency === 'coins' ? state.coins : state.crystals;
  const canAfford = balance >= cost;
  const percent = balance > 0 ? Math.round((cost / balance) * 100) : 100;
  const needsConfirm = balance > 0 && cost > balance * SEED_BIG_SPEND_RATIO;

  function commitBuy() {
    dispatch({
      type: 'BUY_SEEDS',
      cropId,
      seeds,
      coinsUsed:    data.currency === 'coins'    ? cost : 0,
      crystalsUsed: data.currency === 'crystals' ? cost : 0,
    });
    setConfirming(false);
    setUnits(1);
    setToast(true);
    setTimeout(() => setToast(false), 1600);
  }

  function handleBuyClick() {
    if (!canAfford) return;
    if (needsConfirm) {
      setConfirming(true);
      return;
    }
    commitBuy();
  }

  return (
    <div className={`seed-buy-row${!isUnlocked ? ' seed-buy-row--locked' : ''}`}>
      <div className="seed-buy-header">
        <span className="seed-buy-name">
          {plot?.cropEmoji} {data.name}
          {!isUnlocked && <span className="market-locked-tag"> 🔒</span>}
        </span>
        <span className="seed-buy-stock">目前：{stock} 顆</span>
      </div>

      {isUnlocked && (
        <>
          <div className="seed-buy-info">
            <span>本次：<strong>{seeds}</strong> 顆</span>
            <span>花費：<strong>{cost}</strong> {data.currency === 'coins' ? '🪙 金幣' : '💎 水晶'}</span>
          </div>

          <div className="seed-buy-actions">
            <div className="qty-row">
              <button
                className="qty-btn"
                onClick={() => setUnits(u => Math.max(1, u - 1))}
                disabled={units <= 1}
              >－</button>
              <span className="qty-num">{seeds}</span>
              <button
                className="qty-btn"
                onClick={() => setUnits(u => Math.min(SEED_MAX_UNITS, u + 1))}
                disabled={units >= SEED_MAX_UNITS}
              >＋</button>
            </div>
            <button
              className="action-btn--sell seed-buy-btn"
              disabled={!canAfford}
              onClick={handleBuyClick}
            >
              {canAfford ? '購買' : '餘額不足'}
            </button>
          </div>

          {toast && <div className="seed-buy-toast">購買成功</div>}
        </>
      )}

      {confirming && (
        <div
          className="qa-modal-backdrop"
          onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
        >
          <div className="qa-modal-box" onClick={e => e.stopPropagation()}>
            <p className="qa-modal-title">⚠ 大額購買確認</p>
            <p className="qa-modal-body">
              本次將花費 {cost} {data.currency === 'coins' ? '金幣' : '水晶'}，
              約占目前持有資源的 {percent}%。是否確認購買？
            </p>
            <div className="qa-modal-btns">
              <button
                className="qa-modal-btn qa-modal-btn--cancel"
                onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
              >
                取消
              </button>
              <button
                className="qa-modal-btn qa-modal-btn--confirm"
                onClick={(e) => { e.stopPropagation(); commitBuy(); }}
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

/** 每個作物的出售區塊 */
function CropSellRow({ cropId }: { cropId: CropId }) {
  const { state, dispatch } = useGame();
  const data  = CROP_DATA[cropId];
  const inv   = state.cropInventory[cropId];
  const plot  = state.plots.find(p => p.cropId === cropId);
  const isUnlocked = plot?.unlocked ?? false;

  /* 可出售批數（向下取整） */
  const maxBatches = Math.floor(inv / data.sellQty);
  const [batches, setBatches] = useState(1);
  const curBatches = Math.min(batches, maxBatches);
  const sellAmount = curBatches * data.sellQty;
  const earnCoins  = curBatches * data.sellCoins;
  const earnCryst  = curBatches * data.sellCrystals;

  const rateLabel = data.sellCrystals > 0
    ? `${data.sellQty} 株 = ${data.sellCrystals} 💎 水晶`
    : `${data.sellQty} 株 = ${data.sellCoins} 🪙 金幣`;

  const gainLabel = data.sellCrystals > 0
    ? `+${earnCryst} 💎`
    : `+${earnCoins} 🪙`;

  function doSell() {
    if (sellAmount <= 0) return;
    dispatch({ type: 'SELL_CROPS', cropId, amount: sellAmount });
    setBatches(1);
  }

  return (
    <div className={`market-sell-crop${!isUnlocked ? ' market-sell-crop--locked' : ''}`}>
      <div className="market-sell-crop-header">
        <span className="market-sell-crop-name">
          {data.emoji} {data.name}
          {!isUnlocked && <span className="market-locked-tag"> 🔒</span>}
        </span>
        <span className="market-sell-crop-inv">庫存 {inv} 株</span>
      </div>
      <div className="market-sell-crop-rate">{rateLabel}</div>
      {isUnlocked && (
        <div className="market-sell-crop-actions">
          <div className="qty-row">
            <button
              className="qty-btn"
              onClick={() => setBatches(b => Math.max(1, b - 1))}
              disabled={curBatches <= 1}
            >－</button>
            <span className="qty-num">{curBatches} 批</span>
            <button
              className="qty-btn"
              onClick={() => setBatches(b => Math.min(maxBatches, b + 1))}
              disabled={curBatches >= maxBatches}
            >＋</button>
            <button
              className="qty-btn"
              onClick={() => setBatches(maxBatches)}
              disabled={maxBatches <= 0}
            >全部</button>
          </div>
          <button
            className="action-btn--sell"
            disabled={maxBatches <= 0 || sellAmount <= 0}
            onClick={doSell}
          >
            出售 {sellAmount} 株（{gainLabel}）
          </button>
        </div>
      )}
    </div>
  );
}

export default function MarketPanel() {
  const { state } = useGame();

  return (
    <div className="panel-content">
      <h2 className="panel-title">🏪 大道商市</h2>

      {/* 兌換比例總覽 */}
      <p className="panel-note" style={{ marginBottom: 8 }}>各田作物官方兌換比例</p>
      <div className="market-table">
        {state.plots.filter(p => !p.yieldCrystal).map(plot => (
          <div key={plot.id} className={`market-row${plot.unlocked ? '' : ' market-row--locked'}`}>
            <span className="market-crop-emoji">{plot.cropEmoji}</span>
            <div className="market-crop-info">
              <span className="market-crop-name">{plot.cropName}</span>
              <span className="market-crop-sub">{plot.name}</span>
            </div>
            <span className="market-rate">
              {CROP_DATA[plot.cropId].sellQty} 株 = {CROP_DATA[plot.cropId].sellCoins} 🪙
            </span>
            {!plot.unlocked && <span className="market-locked-tag">🔒</span>}
          </div>
        ))}
        {/* 第6塊特殊說明 */}
        {state.plots.find(p => p.yieldCrystal) && (
          <div className={`market-row market-row--crystal${state.plots[5]?.unlocked ? '' : ' market-row--locked'}`}>
            <span className="market-crop-emoji">💎</span>
            <div className="market-crop-info">
              <span className="market-crop-name">混沌晶華</span>
              <span className="market-crop-sub">黑金晶土（每日）</span>
            </div>
            <span className="market-rate market-rate--crystal">
              1 株 = 1 💎 水晶
            </span>
            {!state.plots[5]?.unlocked && <span className="market-locked-tag">🔒</span>}
          </div>
        )}
      </div>

      <div className="panel-separator" style={{ margin: '10px 0' }} />

      {/* 種子購買區：以「播種單位」購買，不提供最大／一鍵買滿 */}
      <p className="panel-note" style={{ marginBottom: 8, fontWeight: 'bold' }}>
        🌱 種子購買（每次最多 {SEED_MAX_UNITS} 個購買單位）
      </p>
      <div className="seed-buy-list">
        {CROP_IDS.map(id => <SeedBuyRow key={id} cropId={id} />)}
      </div>

      <div className="panel-separator" style={{ margin: '10px 0' }} />

      {/* 分作物出售區 */}
      <p className="panel-note" style={{ marginBottom: 8, fontWeight: 'bold' }}>
        倉庫作物出售（各作物獨立計算）
      </p>
      <div className="market-sell-list">
        {CROP_IDS.map(id => <CropSellRow key={id} cropId={id} />)}
      </div>

      <div className="panel-separator" style={{ margin: '10px 0' }} />

      {/* 飼料商店 */}
      <div className="market-feed-section">
        <p className="panel-note" style={{ fontWeight: 'bold', marginBottom: 6 }}>🧪 靈寵飼料</p>
        <div className="market-feed-row">
          <span className="market-feed-name">太乙五穀散</span>
          <span className="market-feed-price">1 金幣 / 包</span>
        </div>
        <div className="market-feed-row">
          <span className="market-feed-name">九轉氣運丹</span>
          <span className="market-feed-price">5 金幣 / 顆，或 1 水晶 = 2 顆</span>
        </div>
      </div>
    </div>
  );
}
