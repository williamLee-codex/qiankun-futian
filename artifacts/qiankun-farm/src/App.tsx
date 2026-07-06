/**
 * 乾坤福田 V2 — Game Scene Architecture
 * Background: file_00000000a0cc72079e8a41dc508698fd_1783314944406.png (1023×1537, ≈2:3)
 */
import bgImage from '@assets/file_00000000a0cc72079e8a41dc508698fd_1783314944406.png';
import { GameProvider, useGame } from './game/GameContext';
import HUD              from './components/HUD';
import FarmScene        from './components/FarmScene';
import HarvestAnimation from './components/HarvestAnimation';
import InfoPanel        from './components/InfoPanel';
import QuickActions     from './components/QuickActions';
import BottomMenu       from './components/BottomMenu';
import PanelOverlay     from './components/PanelOverlay';

function Game() {
  const { dispatch } = useGame();
  return (
    <div className="gw">
      <div
        className="gc"
        style={{ backgroundImage: `url(${bgImage})` }}
        onClick={() => dispatch({ type: 'DESELECT_PLOT' })}
      >
        <HUD />
        <FarmScene />
        <HarvestAnimation />
        <InfoPanel />
        <QuickActions />
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
