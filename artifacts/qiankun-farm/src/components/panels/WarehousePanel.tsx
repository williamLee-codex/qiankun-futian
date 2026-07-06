import { useGame } from '../../game/GameContext';

export default function WarehousePanel() {
  const { state } = useGame();
  return (
    <div className="panel-content">
      <h2 className="panel-title">📦 倉庫</h2>
      <div className="panel-row">
        <span className="panel-item-name">曜金作物</span>
        <span className="panel-item-qty">{state.warehouseCrops} 個</span>
      </div>
      <div className="panel-row">
        <span className="panel-item-name">曜金種子</span>
        <span className="panel-item-qty">{state.warehouseSeeds} 顆</span>
      </div>
    </div>
  );
}
