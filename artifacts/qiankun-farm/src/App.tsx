import bgImage from '@assets/file_00000000a6ec72098c772094f2ee675f_1783306197449.png';
import { GameProvider, useGame } from './game/GameContext';
import HUD from './components/HUD';
import FarmScene from './components/FarmScene';
import InfoPanel from './components/InfoPanel';
import BottomMenu from './components/BottomMenu';
import PanelOverlay from './components/PanelOverlay';

function Game() {
  const { dispatch } = useGame();

  return (
    <div className="gw">
      {/* Clicking the canvas background (outside any hotspot) deselects the current plot */}
      <div
        className="gc"
        style={{ backgroundImage: `url(${bgImage})` }}
        onClick={() => dispatch({ type: 'DESELECT_PLOT' })}
      >
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
