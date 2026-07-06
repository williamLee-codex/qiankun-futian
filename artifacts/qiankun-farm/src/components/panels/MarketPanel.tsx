import { useState } from 'react';
import { useGame } from '../../game/GameContext';

export default function MarketPanel() {
  const { state, dispatch } = useGame();
  const [sellAmt, setSellAmt] = useState(1);

  return (
    <div className="panel-content">
      <h2 className="panel-title">🏪 市場</h2>
      <div className="market-item">
        <div className="market-item-info">
          <span className="market-item-name">🌟 曜金作物</span>
          <span className="market-item-price">售價：8 金幣 / 個</span>
        </div>
        <div className="market-item-stock">庫存：{state.warehouseCrops} 個</div>
        <div className="market-sell-row">
          <div className="qty-row">
            <button className="qty-btn" onClick={() => setSellAmt(a => Math.max(1, a - 1))}>－</button>
            <span className="qty-num">{sellAmt}</span>
            <button className="qty-btn" onClick={() => setSellAmt(a => Math.min(Math.max(1, state.warehouseCrops), a + 1))}>＋</button>
          </div>
          <button
            className="action-btn--sell"
            onClick={() => { dispatch({ type: 'SELL_CROPS', amount: sellAmt }); setSellAmt(1); }}
            disabled={state.warehouseCrops < sellAmt || state.warehouseCrops === 0}
          >
            出售（+{sellAmt * 8} 金幣）
          </button>
        </div>
      </div>
      <p className="panel-note">市場價格每日浮動，把握時機出售。</p>
    </div>
  );
}
