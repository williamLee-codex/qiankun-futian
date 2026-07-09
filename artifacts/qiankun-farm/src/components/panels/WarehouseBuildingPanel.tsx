import { useGame } from '../../game/GameContext';
import { CROP_IDS } from '../../game/types';

export default function WarehouseBuildingPanel() {
  const { state } = useGame();
  const totalCrops = CROP_IDS.reduce((sum, id) => sum + state.cropInventory[id], 0);
  return (
    <div className="panel-content">
      <h2 className="panel-title">🏯 氣運倉庫</h2>
      <p className="panel-desc">儲存修士辛勤耕種所獲之作物與種子，氣運加持之下倉容無限。</p>
      <div className="building-stats">
        <div className="building-stat">
          <span className="building-stat-label">倉庫作物</span>
          <span className="building-stat-value">{totalCrops} 株</span>
        </div>
        <div className="building-stat">
          <span className="building-stat-label">曜金種子</span>
          <span className="building-stat-value">{state.warehouseSeeds} 顆</span>
        </div>
        <div className="building-stat">
          <span className="building-stat-label">倉庫等級</span>
          <span className="building-stat-value">Lv.1</span>
        </div>
      </div>
      <p className="panel-note">倉庫升級可增加額外氣運加成，後續版本開放。</p>
    </div>
  );
}
