/**
 * 乾坤福田 V2 — Game Scene Architecture
 *
 * 設計稿：390 × 844 px（iPhone 標準 9:16）
 * 所有裝置以 CSS transform: scale() 等比例縮放適配。
 *
 * 層次結構：
 *   .gc (390×844)
 *     GameHeader (110px: 60px stats + 50px blank)
 *     .game-scene (flex-1 = 734px)
 *       .game-image-wrap (390×586px, 2:3 ratio)  ← 所有遊戲 Overlay 在此
 *         FarmScene / HarvestAnimation / InfoPanel / QuickActions / BottomMenu
 *     PanelOverlay  ← 全 390×844 覆蓋（z-index 200）
 */
import bgImage from '@assets/file_00000000a0cc72079e8a41dc508698fd_1783314944406.png';
import { useEffect } from 'react';
import { GameProvider, useGame } from './game/GameContext';
import GameHeader      from './components/HUD';
import FarmScene       from './components/FarmScene';
import HarvestAnimation from './components/HarvestAnimation';
import InfoPanel       from './components/InfoPanel';
import QuickActions    from './components/QuickActions';
import BottomMenu      from './components/BottomMenu';
import PanelOverlay    from './components/PanelOverlay';

const DESIGN_W = 390;
const DESIGN_H = 844;

function useScaleViewport() {
  useEffect(() => {
    const update = () => {
      const s = Math.min(
        window.innerWidth  / DESIGN_W,
        window.innerHeight / DESIGN_H,
      );
      document.documentElement.style.setProperty('--gc-scale', String(s));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
}

function Game() {
  const { dispatch } = useGame();
  useScaleViewport();

  return (
    <div className="gc" onClick={() => dispatch({ type: 'DESELECT_PLOT' })}>
      {/* ── Fixed stats header (NOT overlaid on background image) ── */}
      <GameHeader />

      {/* ── Game scene: background image + all play overlays ── */}
      <div className="game-scene">
        <div
          className="game-image-wrap"
          style={{ backgroundImage: `url(${bgImage})` }}
        >
          <FarmScene />
          <HarvestAnimation />
          <InfoPanel />
          <QuickActions />
          <BottomMenu />
        </div>
        {/* Remaining 148px dark gap (background-color of .game-scene) */}
      </div>

      {/* ── Full-canvas panel overlay (warehouse, law, seeds …) ── */}
      <PanelOverlay />
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
