import bgImage from '@assets/file_00000000a6ec72098c772094f2ee675f_1783306197449.png';
import { GameProvider, useGame } from './game/GameContext';
import HUD from './components/HUD';
import FarmScene from './components/FarmScene';
import InfoPanel from './components/InfoPanel';
import QuickActions from './components/QuickActions';
import BottomMenu from './components/BottomMenu';
import PanelOverlay from './components/PanelOverlay';
import HarvestAnimation from './components/HarvestAnimation';

function Game() {
  const { dispatch } = useGame();

  return (
    <div className="gw">
      <div className="gc" onClick={() => dispatch({ type: 'DESELECT_PLOT' })}>

        {/* 1 ─ Top HUD bar */}
        <HUD />

        {/* 2 ─ Main scene: square 1:1 background + hotspot overlays */}
        <div
          className="scene-wrap"
          style={{ backgroundImage: `url(${bgImage})` }}
        >
          <FarmScene />
          <HarvestAnimation />
        </div>

        {/* 3 ─ Plot info panel (expands when a plot is selected) */}
        <InfoPanel />

        {/* 4 ─ Quick action bar: always visible, never over plots */}
        <QuickActions />

        {/* 5 ─ Bottom navigation menu */}
        <BottomMenu />

        {/* Modal overlay for panels */}
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
