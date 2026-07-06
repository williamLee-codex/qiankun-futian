/**
 * 乾坤福田 V2 — 遊戲架構
 *
 * 設計稿：390 × 844 px（單一容器）
 *
 * 縮放：
 *   scale = min(vw/390, vh/844)
 *   transform: translateX(-50%) scale(s)
 *   transform-origin: top center → 從頂部展開
 *
 * 層次（所有元件在同一個 390×844 坐標系）：
 *   .gc-bg     (z:0)   — 底圖 <img object-fit:cover>，填滿 390×844
 *   hotspot    (z:10)  — 建築 / 農田 Hotspot
 *   overlay    (z:20)  — InfoPanel / QuickActions / BottomMenu
 *   .game-header (z:50) — HUD，absolute 覆蓋底圖頂部黑金留白區
 *   panel      (z:200) — 全畫布 Modal
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

      {/* ── z:0  底圖：填滿 390×844，object-fit:cover ── */}
      <img className="gc-bg" src={bgImage} alt="" />

      {/* ── z:10 農田 / 建築 Hotspot（不含鎖頭）── */}
      <FarmScene />

      {/* ── z:20 遊戲 Overlay ── */}
      <HarvestAnimation />
      <InfoPanel />
      <QuickActions />
      <BottomMenu />

      {/* ── z:50 HUD：覆蓋底圖頂部黑金留白區 ── */}
      <GameHeader />

      {/* ── z:200 全畫布 Panel Modal ── */}
      <PanelOverlay />

    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <div className="gw">
        <Game />
      </div>
    </GameProvider>
  );
}
