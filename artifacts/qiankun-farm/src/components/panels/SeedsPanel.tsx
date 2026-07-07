import { useGame } from '../../game/GameContext';

export default function SeedsPanel() {
  const { state } = useGame();

  return (
    <div className="panel-content">
      <h2 className="panel-title">🌱 種子背包</h2>

      <div className="panel-row" style={{ marginBottom: 8 }}>
        <span className="panel-item-name" style={{ fontSize: 18 }}>通用種子庫存</span>
        <span className="panel-item-qty" style={{ fontSize: 18 }}>
          <strong>{state.warehouseSeeds}</strong> 顆
        </span>
      </div>

      <div className="panel-separator" />

      <p className="panel-note" style={{ marginTop: 6, marginBottom: 10 }}>
        各田地種子規格（正式版 V1.0）
      </p>

      <div className="seeds-table">
        {state.plots.map(plot => (
          <div key={plot.id} className={`seed-row${plot.unlocked ? '' : ' seed-row--locked'}`}>
            <span className="seed-emoji">{plot.cropEmoji}</span>
            <div className="seed-info-col">
              <div className="seed-info-name">
                {plot.seedName}
                {!plot.unlocked && <span className="seed-locked-tag"> 🔒</span>}
              </div>
              <div className="seed-info-desc">
                播種 {plot.maxSeeds} 顆 → 收成 {plot.harvestCount} 株{plot.cropName}
              </div>
              <div className="seed-info-desc">
                {plot.seedBuyRate}
                {plot.yieldCrystal ? '（每日免費補給，不可購買）' : ''}
              </div>
            </div>
            <div className="seed-time-tag">
              {plot.growthHours >= 1 ? `${plot.growthHours}h` : `${Math.round(plot.growthHours * 60)}m`}
            </div>
          </div>
        ))}
      </div>

      {state.warehouseSeeds === 0 && (
        <p className="panel-empty">種子已用完，請前往市場補充。</p>
      )}
    </div>
  );
}
