import { useGame } from '../../game/GameContext';

export default function SeedsPanel() {
  const { state } = useGame();
  const totalSeeds = state.plots.reduce((s, p) => s + state.seedInventory[p.cropId], 0);

  return (
    <div className="panel-content">
      <h2 className="panel-title">🌱 種子背包</h2>

      <p className="panel-note" style={{ marginTop: 6, marginBottom: 10 }}>
        各田地種子規格（正式版 V1.0）— 種子依作物分別儲存
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
                目前庫存 <strong>{state.seedInventory[plot.cropId]}</strong> 顆
              </div>
              <div className="seed-info-desc">
                播種 {plot.maxSeeds} 顆 → 收成 {plot.harvestCount} 株{plot.cropName}
              </div>
            </div>
            <div className="seed-time-tag">
              {plot.growthHours >= 1 ? `${plot.growthHours}h` : `${Math.round(plot.growthHours * 60)}m`}
            </div>
          </div>
        ))}
      </div>

      {totalSeeds === 0 && (
        <p className="panel-empty">種子已用完，請前往大道商市補充。</p>
      )}
    </div>
  );
}
