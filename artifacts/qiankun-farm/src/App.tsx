/**
 * 乾坤福田 V2 — Game Scene Architecture
 *
 * 設計稿：390 × 844 px（iPhone 14 標準）
 *
 * 縮放規則：
 *   scale = min(vw / 390, vh / 844)
 *   .gc 使用 transform: translateX(-50%) scale(s)
 *   transform-origin: top center → 從頂部展開，不留上方黑邊
 *
 * 層次結構（所有元件都在 390×844 坐標系內）：
 *   .gc (390×844, absolute, 唯一設計稿容器)
 *     .game-image-wrap (390×586, absolute top:0)  ← 底圖 + 所有遊戲 Overlay
 *       FarmScene / HarvestAnimation / InfoPanel / QuickActions / BottomMenu
 *     .game-header (absolute top:0, 110px, z:100)  ← 不透明覆蓋底圖頂部
 *     PanelOverlay (absolute inset:0, z:200)
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
      {/* ── 底圖 + 所有遊戲 Overlay（390×586，absolute top:0） ── */}
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

      {/* ── Header：不透明覆蓋底圖頂部，不推動底圖（absolute top:0, z:100） ── */}
      <GameHeader />

      {/* ── 全畫布 Panel（倉庫 / 律法 / 種子 …，z:200） ── */}
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
