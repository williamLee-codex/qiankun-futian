import { useGame } from '../../game/GameContext';
import { CROP_IDS, CROP_DATA } from '../../game/types';

export default function WarehousePanel() {
  const { state } = useGame();

  return (
    <div className="panel-content">
      <h2 className="panel-title">📦 氣運倉庫</h2>

      {/* 種子庫存（分作物顯示） */}
      <p className="panel-note" style={{ margin: '0 0 6px' }}>種子庫存</p>
      {state.plots.map(plot => (
        <div key={plot.id} className="panel-row">
          <span className="panel-item-name">{plot.cropEmoji} {plot.seedName}</span>
          <span className="panel-item-qty">{state.seedInventory[plot.cropId]} 顆</span>
        </div>
      ))}

      <div className="panel-separator" />

      {/* 作物庫存（分作物顯示） */}
      <p className="panel-note" style={{ margin: '8px 0 6px' }}>收穫作物庫存</p>

      {CROP_IDS.map(cropId => {
        const data = CROP_DATA[cropId];
        const plot = state.plots.find(p => p.cropId === cropId);
        const qty  = state.cropInventory[cropId];
        const isUnlocked = plot?.unlocked ?? false;
        const rateLabel = data.sellCrystals > 0
          ? `${data.sellQty}株 = ${data.sellCrystals}💎`
          : `${data.sellQty}株 = ${data.sellCoins}🪙`;
        return (
          <div
            key={cropId}
            className={`warehouse-crop-row${!isUnlocked ? ' warehouse-crop-row--locked' : ''}`}
          >
            <span className="warehouse-crop-name">
              {data.emoji} {data.name}
              {!isUnlocked && <span className="warehouse-locked-tag"> 🔒</span>}
            </span>
            <span className="warehouse-crop-qty">{qty} 株</span>
            <span className="warehouse-crop-rate">{rateLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
