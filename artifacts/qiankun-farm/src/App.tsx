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
import advertisingIcon from './assets/advertising-center-icon.svg';
import bgImage from '@assets/file_00000000095072069ef62748d273ae91_1783571778589.png';
import { useState, useLayoutEffect, useEffect } from 'react';
import DailyActivityDialog, { type DailyActivityBridge } from './components/DailyActivityDialog';
import CoinConversionDialog, { type CoinBalances, type CoinConversionReceipt, type CoinDirection } from './components/CoinConversionDialog';
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

type CoinBridge = {
  loadBalances: () => Promise<CoinBalances>;
  convert: (request: { conversionId: string; direction: CoinDirection; amount: number }) => Promise<CoinConversionReceipt>;
};

/** Host supplies authenticated calls; never embed a bridge secret in browser code. */
function Game({ coinBridge, dailyActivityBridge }: { coinBridge?: CoinBridge; dailyActivityBridge?: DailyActivityBridge }) {
  const { dispatch } = useGame();
  const scale = useGameScale();
  const [balances, setBalances] = useState<CoinBalances | null>(null);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [dailyActivityOpen, setDailyActivityOpen] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  const [showWalletGuide, setShowWalletGuide] = useState(false);
  useEffect(() => {
    if (!coinBridge) return;
    try {
      setShowWalletGuide(window.localStorage.getItem('farm-v2-coin-wallet-guide-seen') !== '1');
    } catch {
      setShowWalletGuide(true);
    }
  }, [coinBridge]);
  function dismissWalletGuide() {
    try { window.localStorage.setItem('farm-v2-coin-wallet-guide-seen', '1'); } catch { /* private mode */ }
    setShowWalletGuide(false);
  }
  useEffect(() => {
    if (!coinBridge) return;
    let active = true;
    coinBridge.loadBalances().then(value => {
      if (active) setBalances(value);
    }).catch(() => {
      if (active) setBalanceError(true);
    });
    return () => { active = false; };
  }, [coinBridge]);
  async function openConversion() {
    if (!coinBridge) return;
    setBalanceError(false);
    try {
      const latest = await coinBridge.loadBalances();
      setBalances(latest);
      setConversionOpen(true);
    } catch {
      setBalanceError(true);
    }
  }

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

        {/* 廣告中心沿用既有正式頁面；獨立連結，不複製廣告邏輯。 */}
        <a
          href="https://www.yuceluopan.com/advertising"
          aria-label="廣告中心"
          title="廣告中心"
          onClick={event => event.stopPropagation()}
          style={{
            position: 'absolute', right: 8, top: 164, width: 56, height: 68,
            zIndex: 45, display: 'block', cursor: 'pointer',
          }}
        >
          <img src={advertisingIcon} alt="廣告中心" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </a>

        {dailyActivityBridge && <button type="button" aria-label="每日任務" title="每日任務"
          onClick={event => { event.stopPropagation(); setDailyActivityOpen(true); }}
          style={{position:'absolute',right:8,top:240,zIndex:46,cursor:'pointer'}}>
          每日任務
        </button>}
        {/* z:50 HUD：疊在底圖頂部留白區 */}
        <GameHeader
          onOpenConversion={coinBridge ? openConversion : undefined}
          farmCoinBalance={balances?.farmBalance}
          centralCoinBalance={balances?.centralBalance}
        />
        {balanceError && coinBridge && (
          <p className="farm-coin-error" role="alert">金幣餘額暫時無法讀取</p>
        )}
        {coinBridge && (
          <button type="button" className="farm-coin-help" aria-label="福田金幣說明"
            onClick={event => { event.stopPropagation(); setShowWalletGuide(true); }}>?</button>
        )}
        {showWalletGuide && coinBridge && (
          <div className="coin-conversion-backdrop" onClick={event => event.stopPropagation()}>
            <section className="coin-conversion-dialog" role="dialog" aria-modal="true" aria-label="福田金幣說明">
              <h2>歡迎來到乾坤福田</h2>
              <p>福田設有專屬金幣錢包，供農田內各項活動使用。</p>
              <p>點擊上方金幣旁的「⇄」圖示，即可將中央錢包的金幣轉入福田。</p>
              <p>福田內獲得的金幣也可以回存中央錢包。金幣不會自動轉入或回存。</p>
              <button type="button" onClick={dismissWalletGuide}>我知道了，開始耕種</button>
            </section>
          </div>
        )}
        {conversionOpen && !showWalletGuide && balances && coinBridge && (
          <CoinConversionDialog balances={balances}
            onConfirm={coinBridge.convert}
            onBalancesChange={setBalances}
            onClose={() => setConversionOpen(false)}
          />
        )}

        {dailyActivityOpen && dailyActivityBridge && <DailyActivityDialog bridge={dailyActivityBridge}
          onClose={() => setDailyActivityOpen(false)} />}
        {/* z:200 全畫布 Panel Modal */}
        <PanelOverlay />
      </div>
    </div>
  );
}

export default function App({ coinBridge, dailyActivityBridge }: { coinBridge?: CoinBridge; dailyActivityBridge?: DailyActivityBridge }) {
  return (
    <GameProvider>
      <Game coinBridge={coinBridge} dailyActivityBridge={dailyActivityBridge} />
    </GameProvider>
  );
}
