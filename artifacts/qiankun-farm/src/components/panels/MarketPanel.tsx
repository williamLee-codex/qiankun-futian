import { useState } from 'react';
import { useGame } from '../../game/GameContext';

export default function MarketPanel() {
  const { state, dispatch } = useGame();
  const [sellAmt, setSellAmt] = useState(20);

  const totalCrops = state.warehouseCrops;

  return (
    <div className="panel-content">
      <h2 className="panel-title">🏪 大道商市</h2>

      {/* 各作物兌換比例表 */}
      <p className="panel-note" style={{ marginBottom: 8 }}>各田作物官方兌換比例（V1.0 基準值，±10% 浮動）</p>
      <div className="market-table">
        {state.plots.filter(p => !p.yieldCrystal).map(plot => (
          <div key={plot.id} className={`market-row${plot.unlocked ? '' : ' market-row--locked'}`}>
            <span className="market-crop-emoji">{plot.cropEmoji}</span>
            <div className="market-crop-info">
              <span className="market-crop-name">{plot.cropName}</span>
              <span className="market-crop-sub">{plot.name}</span>
            </div>
            <span className="market-rate">
              {plot.exchangeRate} 株 = 1 🪙
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

      {/* 出售倉庫曜金粟作物 */}
      <div className="market-sell-section">
        <div className="market-sell-header">
          <span className="market-sell-title">🌾 倉庫作物出售</span>
          <span className="market-sell-stock">庫存 {totalCrops} 株</span>
        </div>
        <p className="panel-note" style={{ marginBottom: 8 }}>
          以曜金粟比例出售（20株=1金幣）
        </p>
        <div className="market-sell-row">
          <div className="qty-row">
            <button className="qty-btn" onClick={() => setSellAmt(a => Math.max(20, a - 20))}>－</button>
            <span className="qty-num">{sellAmt}</span>
            <button className="qty-btn" onClick={() => setSellAmt(a => Math.min(Math.max(20, totalCrops), a + 20))}>＋</button>
            <button className="qty-btn" onClick={() => setSellAmt(Math.max(20, Math.floor(totalCrops / 20) * 20))}>全部</button>
          </div>
          <button
            className="action-btn--sell"
            disabled={totalCrops < 20}
            onClick={() => {
              const actual = Math.min(sellAmt, Math.floor(totalCrops / 20) * 20);
              if (actual >= 20) { dispatch({ type: 'SELL_CROPS', amount: actual }); setSellAmt(20); }
            }}
          >
            出售（+{Math.floor(sellAmt / 20)} 金幣）
          </button>
        </div>
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
