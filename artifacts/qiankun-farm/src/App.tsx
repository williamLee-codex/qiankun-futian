/**
 * 乾坤福田 V2 — Game Scene Architecture
 *
 * Single background layer (PNG) fills the 9:16 canvas.
 * All interactive components (HUD, Hotspot, Dialog, Animation)
 * are independent absolute overlays — ready for Supabase,
 * wallet, pet system, farmer system, and AI Agent integration
 * without UI refactoring.
 */
import bgImage from '@assets/file_000000005f3c7209a603a19ecc1dc495_1783312766928.png';
import { GameProvider, useGame } from './game/GameContext';
import HUD           from './components/HUD';
import FarmScene     from './components/FarmScene';
import HarvestAnimation from './components/HarvestAnimation';
import InfoPanel     from './components/InfoPanel';
import QuickActions  from './components/QuickActions';
import BottomMenu    from './components/BottomMenu';
import PanelOverlay  from './components/PanelOverlay';

function Game() {
  const { dispatch } = useGame();

  return (
    <div className="gw">
      {/* ── Game Canvas: single background layer ── */}
      <div
        className="gc"
        style={{ backgroundImage: `url(${bgImage})` }}
        onClick={() => dispatch({ type: 'DESELECT_PLOT' })}
      >
        {/* Layer 1 – HUD: dynamic values over the black strip */}
        <HUD />

        {/* Layer 2 – Scene hotspots: law book, buildings, farm plots */}
        <FarmScene />

        {/* Layer 3 – Harvest animations (flying crops) */}
        <HarvestAnimation />

        {/* Layer 4 – Info panel: dynamic plot info over parchment area */}
        <InfoPanel />

        {/* Layer 5 – Quick action buttons: over button frames */}
        <QuickActions />

        {/* Layer 6 – Bottom navigation: over nav icon strip */}
        <BottomMenu />

        {/* Layer 7 – Full-canvas panel modals */}
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
