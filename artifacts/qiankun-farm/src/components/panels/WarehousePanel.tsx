import { useGame } from '../../game/GameContext';

export default function WarehousePanel() {
  const { state } = useGame();

  return (
    <div className="panel-content">
      <h2 className="panel-title">📦 氣運倉庫</h2>

      {/* 種子庫存 */}
      <div className="panel-row">
        <span className="panel-item-name">🌱 種子（通用）</span>
        <span className="panel-item-qty">{state.warehouseSeeds} 顆</span>
      </div>

      <div className="panel-separator" />

      {/* 作物庫存（各田已解鎖的列出） */}
      <p className="panel-note" style={{ margin: '8px 0 6px' }}>收穫作物（1～5號田混合計）</p>
      <div className="panel-row">
        <span className="panel-item-name">
          🌾 各類作物
        </span>
        <span className="panel-item-qty">{state.warehouseCrops} 株</span>
      </div>

      {/* 各田作物說明（已解鎖） */}
      <div style={{ marginTop: 8 }}>
        {state.plots.filter(p => p.unlocked && !p.yieldCrystal).map(plot => (
          <div key={plot.id} className="warehouse-crop-row">
            <span>{plot.cropEmoji} {plot.cropName}</span>
            <span style={{ color: '#bdb16a', fontSize: 14 }}>
              {plot.exchangeRate === 1
                ? `1株 = 1金幣`
                : `${plot.exchangeRate}株 = 1金幣`}
            </span>
          </div>
        ))}
        {/* 第6塊 */}
        {state.plots[5]?.unlocked && (
          <div className="warehouse-crop-row">
            <span>💎 混沌晶華</span>
            <span style={{ color: '#bdb16a', fontSize: 14 }}>每株 = 1水晶（自動兌換）</span>
          </div>
        )}
      </div>
    </div>
  );
}
