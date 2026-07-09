/**
 * 乾坤福田 V2 — 根層縮放架構
 *
 * 設計稿座標系：DESIGN_W × DESIGN_H（底圖原始寬高比等比例換算）
 *   • 所有 HTML overlay 均以此座標系定位（position:absolute + px/%）
 *   • 底圖 img 與所有 overlay 共用同一個 .game-shell transform
 *   • scale = min(viewport_W / DESIGN_W, viewport_H / DESIGN_H)
 *   • transform 透過 React state + inline style 直接套用，避免 CSS variable 延遲
 *   • useLayoutEffect → 在瀏覽器 paint 前套用，防止閃爍
 *
 * 層次（z-index 由低到高）：
 *   0   .gc-bg          — 底圖（100% × 100%，object-fit:fill）
 *   10  hotspot-layer   — 建築 / 農田 Hotspot
 *   20  overlays        — InfoPanel / QuickActions / BottomMenu
 *   50  .resource-hud   — HUD（覆蓋底圖頂部留白區）
 *   200 PanelOverlay    — 全畫布 Modal
 */
import bgImage from '@assets/file_00000000095072069ef62748d273ae91_1783571778589.png';
import { useState, useLayoutEffect } from 'react';
import { GameProvider, useGame } from './game/GameContext';
import GameHeader       from './components/HUD';
import FarmScene        from './components/FarmScene';
import HarvestAnimation from './components/HarvestAnimation';
import StatusBar        from './components/StatusBar';
import InfoPanel        from './components/InfoPanel';
import QuickActions     from './components/QuickActions';
import BottomMenu       from './components/BottomMenu';
import PanelOverlay     from './components/PanelOverlay';
import PetOverlay        from './components/PetOverlay';

/* ── 設計稿尺寸（與底圖寬高比一致）──────────────────────────
   底圖原始：853 × 1844 px  →  比例 ≈ 390 / 843
   此處以 390 × 843 作為設計稿座標系，保留所有既有 CSS px 值不變。
   縮放比例 scale = min(vw/390, vh/843) 完全等效。
────────────────────────────────────────────────────────── */
const DESIGN_W = 390;
const DESIGN_H = 843;

function useGameScale() {
  /* 以 SSR-safe lazy initializer 取得初始值（避免 window 未定義） */
  const [scale, setScale] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    return Math.min(
      window.innerWidth  / DESIGN_W,
      window.innerHeight / DESIGN_H,
    );
  });

  /* useLayoutEffect：在 paint 前計算 scale，徹底防止閃爍 */
  useLayoutEffect(() => {
    const update = () => {
      setScale(Math.min(
        window.innerWidth  / DESIGN_W,
        window.innerHeight / DESIGN_H,
      ));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return scale;
}

function Game() {
  const { dispatch } = useGame();
  const scale = useGameScale();

  return (
    /* game-viewport：全螢幕外層，只負責置中，不縮放 */
    <div className="game-viewport">
      {/* game-shell：390×843 設計稿容器，唯一縮放點
          transform 透過 React inline style 直接套用，確保可靠性 */}
      <div
        className="game-shell"
        style={{ transform: `scale(${scale})` }}
        onClick={() => dispatch({ type: 'DESELECT_PLOT' })}
      >
        {/* z:0  底圖：100%×100% 填滿 game-shell，object-fit:fill */}
        <img className="gc-bg" src={bgImage} alt="" />

        {/* z:10 農田 / 建築 Hotspot */}
        <FarmScene />

        {/* z:15 靈獸出戰顯示（不攔截點擊，重整後仍保留）*/}
        <PetOverlay />

        {/* z:20 遊戲 Overlay */}
        <HarvestAnimation />
        <StatusBar />
        <InfoPanel />
        <QuickActions />
        <BottomMenu />
        <button
          className="friend-entry-btn"
          aria-label="好友"
          onClick={(e) => { e.stopPropagation(); dispatch({ type: 'OPEN_PANEL', panel: 'friends' }); }}
        >
          🤝
        </button>

        {/* z:50 HUD：疊在底圖頂部留白區 */}
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
