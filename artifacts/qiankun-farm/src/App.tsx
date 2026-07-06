import { GameProvider } from './game/GameContext';
import HUD from './components/HUD';
import FarmScene from './components/FarmScene';
import InfoPanel from './components/InfoPanel';
import BottomMenu from './components/BottomMenu';
import PanelOverlay from './components/PanelOverlay';

function Game() {
  return (
    <div className="game-wrapper">
      <div className="game-canvas">
        <HUD />
        <FarmScene />
        <InfoPanel />
        <BottomMenu />
        <PanelOverlay />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <Game />
    </GameProvider>
  );
}
