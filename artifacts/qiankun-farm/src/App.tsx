import bgImage from '@assets/file_00000000a6ec72098c772094f2ee675f_1783306197449.png';
import { GameProvider } from './game/GameContext';
import HUD from './components/HUD';
import FarmScene from './components/FarmScene';
import InfoPanel from './components/InfoPanel';
import BottomMenu from './components/BottomMenu';
import PanelOverlay from './components/PanelOverlay';

function Game() {
  return (
    <div className="gw">
      {/* 1:1 canvas = the artwork; everything else is an absolute overlay */}
      <div className="gc" style={{ backgroundImage: `url(${bgImage})` }}>
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
