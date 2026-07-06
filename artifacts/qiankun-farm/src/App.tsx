/**
 * 乾坤福田 V2 — 根層縮放架構
 *
 * 規則：
 *   1. 只允許一個 390×844 設計稿容器（.game-shell）
 *   2. 外層 .game-viewport 只負責 flex 置中，不縮放
 *   3. 只允許一次 scale = min(vw/390, vh/844)
 *   4. transform-origin: top center → 從頂部展開
 *   5. 禁止：多層 scale / translateX(-50%) / object-fit:cover / zoom
 *   6. 所有元件（HUD、鎖頭、農田、Nav）全在 390×844 坐標系內
 *
 * 層次（z-index 由低到高）：
 *   0   .gc-bg          — 底圖（390×844，object-fit:fill）
 *   10  hotspot-layer   — 建築 / 農田 Hotspot
 *   20  overlays        — InfoPanel / QuickActions / BottomMenu
 *   50  .game-header    — HUD（覆蓋底圖頂部黑金留白區）
 *   200 PanelOverlay    — 全畫布 Modal
 */
import bgImage from '@assets/file_00000000a0cc72079e8a41dc508698fd_1783314944406.png';
import { useEffect } from 'react';
import { GameProvider, useGame } from './game/GameContext';
import GameHeader       from './components/HUD';
import FarmScene        from './components/FarmScene';
import HarvestAnimation from './components/HarvestAnimation';
import InfoPanel        from './components/InfoPanel';
import QuickActions     from './components/QuickActions';
import BottomMenu       from './components/BottomMenu';
import PanelOverlay     from './components/PanelOverlay';

const DESIGN_W = 390;
const DESIGN_H = 844;

function useScaleViewport() {
  useEffect(() => {
    const update = () => {
      const s = Math.min(
        window.innerWidth  / DESIGN_W,
        window.innerHeight / DESIGN_H,
      );
      document.documentElement.style.setProperty('--game-scale', String(s));
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
    /* ── 外層：全螢幕置中容器，不縮放 ── */
    <div className="game-viewport">

      {/* ── 設計稿：390×844，所有 UI 在此坐標系，只縮放一次 ── */}
      <div
        className="game-shell"
        onClick={() => dispatch({ type: 'DESELECT_PLOT' })}
      >
        {/* z:0  底圖，精確 390×844，object-fit:fill */}
        <img className="gc-bg" src={bgImage} alt="" />

        {/* z:10 農田 / 建築 Hotspot（不含鎖頭） */}
        <FarmScene />

        {/* z:20 遊戲 Overlay */}
        <HarvestAnimation />
        <InfoPanel />
        <QuickActions />
        <BottomMenu />

        {/* z:50 HUD：疊在底圖頂部黑金留白區 */}
        <GameHeader />

        {/* z:200 全畫布 Panel Modal */}
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
