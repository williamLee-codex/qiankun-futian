/**
 * ResourceHUD — 頂部資源欄（z-index: 30）
 * 覆蓋底圖頂部留白區，即時顯示：金幣、水晶、倉庫作物、天氣
 */
import { useGame } from '../game/GameContext';

export default function GameHeader() {
  const { state } = useGame();

  const weatherIcon = state.weather === '晴' ? '☀️'
    : state.weather === '雨' ? '🌧️'
    : state.weather === '雪' ? '❄️'
    : '🌤️';

  return (
    <div className="resource-hud" onClick={e => e.stopPropagation()}>
      <div className="resource-cell">
        <span className="resource-icon">🪙</span>
        <div className="resource-text">
          <span className="resource-value">{state.coins}</span>
          <span className="resource-label">金幣</span>
        </div>
      </div>
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
          <span className="resource-value">{state.warehouseCrops}</span>
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
