import { useGame } from '../game/GameContext';
import WarehousePanel from './panels/WarehousePanel';
import PetsPanel from './panels/PetsPanel';
import FarmerPanel from './panels/FarmerPanel';
import TasksPanel from './panels/TasksPanel';
import MarketPanel from './panels/MarketPanel';
import LawPanel from './panels/LawPanel';
import WarehouseBuildingPanel from './panels/WarehouseBuildingPanel';
import ShopBuildingPanel from './panels/ShopBuildingPanel';
import FriendsPanel from './panels/FriendsPanel';

export default function PanelOverlay() {
  const { state, dispatch } = useGame();

  if (!state.openPanel) return null;

  const panelMap: Record<string, React.ReactNode> = {
    warehouse: <WarehousePanel />,
    pets: <PetsPanel />,
    farmer: <FarmerPanel />,
    tasks: <TasksPanel />,
    market: <MarketPanel />,
    law: <LawPanel />,
    warehouseBuilding: <WarehouseBuildingPanel />,
    shopBuilding: <ShopBuildingPanel />,
    friends: <FriendsPanel />,
  };

  const content = panelMap[state.openPanel];
  if (!content) return null;

  return (
    <div className="panel-overlay" onClick={() => dispatch({ type: 'CLOSE_PANEL' })}>
      <div className="panel-modal" onClick={e => e.stopPropagation()}>
        <button className="panel-close" onClick={() => dispatch({ type: 'CLOSE_PANEL' })}>✕</button>
        {content}
      </div>
    </div>
  );
}
