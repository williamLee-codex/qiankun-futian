/**
 * ResourceHUD — 頂部資源欄（z-index: 30）
 * 覆蓋底圖頂部留白區，即時顯示：金幣、水晶、倉庫總作物、天氣
 */
import { useGame } from '../game/GameContext';
import { CROP_IDS } from '../game/types';

export default function GameHeader({ onOpenConversion, farmCoinBalance, centralCoinBalance }: { onOpenConversion?: () => void; farmCoinBalance?: number | null; centralCoinBalance?: number | null }) {
  const { state } = useGame();

  /* 所有作物庫存加總 */
  const totalCrops = CROP_IDS.reduce((sum, id) => sum + state.cropInventory[id], 0);

  const weatherIcon = state.weather === '晴' ? '☀️'
    : state.weather === '雨' ? '🌧️'
    : state.weather === '❄️' ? '❄️'
    : '🌤️';

  return (
    <div className="resource-hud" onClick={e => e.stopPropagation()}>
      <div className="resource-cell">
        <span className="resource-icon">🪙</span>
        <div className="resource-text">
          <span className="resource-value">{centralCoinBalance == null ? '—' : centralCoinBalance.toLocaleString()}</span>
          <span className="resource-label">中央金幣</span>
        </div>
      </div>
      {onOpenConversion && (
        <button type="button" className="farm-conversion-trigger"
          aria-label="金幣轉換" title="金幣轉換" onClick={onOpenConversion}>⇄</button>
      )}
      {farmCoinBalance !== undefined && farmCoinBalance !== null && (
        <div className="farm-coin-balance" aria-label="福田金幣餘額">
          🪙 福田金幣 {farmCoinBalance.toLocaleString()}
        </div>
      )}
      <div className="resource-cell">
        <span className="resource-icon">💎</span>
        <div className="resource-text">
          <span className="resource-value">{state.crystals}</span>
          <span className="resource-label">水晶</span>
        </div>
      </div>
      <div className="resource-cell">
        <span className="resource-icon">📦</span>
        <div className="resource-text">
          <span className="resource-value">{totalCrops}</span>
          <span className="resource-label">氣運倉庫</span>
        </div>
      </div>
      <div className="resource-cell">
        <span className="resource-icon">{weatherIcon}</span>
        <div className="resource-text">
          <span className="resource-value">{state.weather}</span>
          <span className="resource-label">天氣</span>
        </div>
      </div>
    </div>
  );
}
