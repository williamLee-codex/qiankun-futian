import farmBackground from '@assets/file_00000000095072069ef62748d273ae91_1783571778589.png';
import { useEffect, useState } from 'react';
import { useFarmV2Scene } from './useFarmV2Scene';
import { CROP_DATA } from '../types';

/**
 * Authenticated Farm V2 integration surface. The platform host supplies a
 * validated launch token; this component never reads credentials from URL,
 * localStorage, or the legacy GameProvider.
 *
 * Intentionally separate from the legacy scene until platform routing is
 * approved. No simulated wallet, entitlement or success messages.
 */
const PLOT_HOTSPOTS = [
  { left: '4%', top: '43%', width: '30%', height: '15%' },
  { left: '35%', top: '42%', width: '30%', height: '15%' },
  { left: '63%', top: '42%', width: '29%', height: '15%' },
  { left: '2%', top: '59%', width: '33%', height: '12%' },
  { left: '34%', top: '58%', width: '32%', height: '12%' },
  { left: '65%', top: '58%', width: '31%', height: '12%' },
] as const;

function cropVisual(plot: { state: string; growthEndTime: number | null; growthHours: number; cropEmoji: string }, now: number) {
  if (plot.state === 'ready') return { icon: plot.cropEmoji, label: '成熟可收成' };
  if (plot.state !== 'growing' || !plot.growthEndTime) return null;
  const duration = plot.growthHours * 3_600_000;
  const progress = Math.max(0, Math.min(1, (now - (plot.growthEndTime - duration)) / duration));
  if (progress >= 1) return { icon: plot.cropEmoji, label: '等待成熟確認' };
  if (progress < 0.25) return { icon: '🌱', label: '萌芽' };
  if (progress < 0.5) return { icon: '🌿', label: '幼苗' };
  if (progress < 0.75) return { icon: '🌳', label: '生長' };
  return { icon: plot.cropEmoji, label: '將熟' };
}

export function FarmV2AuthenticatedView(props: { apiBaseUrl: string; launchToken: string }) {
  const { data, error, loading, busy, refresh, mutate, pendingRetry } =
    useFarmV2Scene(props.apiBaseUrl, props.launchToken);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  const [selectedLand, setSelectedLand] = useState<number | null>(null);
  const [flight, setFlight] = useState<{ operation: 'sow' | 'harvest'; landId: number; icon: string; sequence: number } | null>(null);
  const [flightSequence, setFlightSequence] = useState(0);
  useEffect(() => {
    if (!flight) return;
    const timeout = setTimeout(() => setFlight(current => current?.sequence === flight.sequence ? null : current), 900);
    return () => clearTimeout(timeout);
  }, [flight]);

  async function execute(operation: 'sow' | 'harvest' | 'purchaseSeeds' | 'exchangeCrops', landId: number, quantity?: number) {
    setNotice(null);
    const ok = await mutate(operation, landId, quantity);
    if (ok && (operation === 'sow' || operation === 'harvest')) {
      const plot = data?.plots.find(item => item.id + 1 === landId);
      setFlightSequence(previous => previous + 1);
      setFlight({ operation, landId, icon: operation === 'sow' ? '🌱' : (plot?.cropEmoji ?? '🌾'), sequence: flightSequence + 1 });
    }
    setNotice(ok ? '操作已由伺服器確認。' : '操作未確認，請檢查錯誤並重新讀取。');
  }

  async function handlePlotClick(plot: NonNullable<typeof data>['plots'][number]) {
    setSelectedLand(plot.id + 1);
    if (busy || loading || pendingRetry || !plot.unlocked) return;
    if (plot.state === 'ready') {
      await execute('harvest', plot.id + 1);
      return;
    }
    if (plot.state === 'empty') {
      const seeds = data?.seedInventory[plot.cropId] ?? 0;
      if (seeds < plot.maxSeeds) {
        setNotice('種子不足，請先在下方購買種子；未執行播種。');
        return;
      }
      await execute('sow', plot.id + 1);
    }
  }

  if (loading && !data && !pendingRetry) return <section role="status">正在讀取正式農田資料…</section>;
  if (!data) return (
    <section role="alert">
      <p>無法取得正式農田資料，已停止所有操作。</p>
      {error && <p>{error}</p>}
      {pendingRetry ? (
        <button type="button" disabled={busy || loading} onClick={() => { void execute(pendingRetry.operation, pendingRetry.landId, pendingRetry.quantity); }}>
          重試尚未確認的操作（沿用原交易編號）
        </button>
      ) : (
        <button type="button" onClick={() => { void refresh(); }}>重新讀取</button>
      )}
    </section>
  );

  return (
    <section aria-label="乾坤福田正式農田" style={{ maxWidth: 720, margin: "0 auto" }}>
      <style>{`@keyframes farmV2Flight { from { left: var(--from-x); top: var(--from-y); opacity: 1; transform: translate(-50%, -50%) scale(.8); } to { left: var(--to-x); top: var(--to-y); opacity: 0; transform: translate(-50%, -50%) scale(1.2); } } @media (prefers-reduced-motion: reduce) { .farm-v2-flight { animation: none !important; } }`}</style>
      <div style={{ position: "relative", width: "min(100%, 390px)", aspectRatio: "390 / 843", margin: "0 auto", overflow: "hidden" }}>
        <img src={farmBackground} alt="乾坤福田六田場景" style={{ display: "block", width: "100%", height: "100%", objectFit: "fill" }} />
        {data.plots.map((plot, index) => (
          <button
            key={plot.id}
            type="button"
            aria-label={`${plot.name}，${!plot.unlocked ? '尚未解鎖' : plot.state === 'ready' ? '已成熟' : plot.state === 'growing' ? '生長中' : '待播種'}`}
            aria-pressed={selectedLand === plot.id + 1}
            disabled={busy || loading || !!pendingRetry}
            onClick={() => { void handlePlotClick(plot); }}
            style={{
              position: 'absolute', ...PLOT_HOTSPOTS[index],
              border: selectedLand === plot.id + 1 ? '2px solid #f8d58a' : '1px solid transparent',
              background: selectedLand === plot.id + 1 ? 'rgba(255,215,130,.2)' : 'transparent',
              cursor: 'pointer',
            }}
          />
        ))}
        {data.plots.map((plot, index) => {
          const visual = plot.unlocked ? cropVisual(plot, now) : { icon: '🔒', label: '尚未解鎖' };
          if (!visual) return null;
          const hotspot = PLOT_HOTSPOTS[index];
          return (
            <span key={`visual-${plot.id}`} aria-hidden="true"
              style={{
                position: 'absolute',
                left: `calc(${hotspot.left} + ${hotspot.width} / 2)`,
                top: `calc(${hotspot.top} + ${hotspot.height} / 2)`,
                transform: 'translate(-50%, -50%)',
                display: 'grid', justifyItems: 'center', gap: 2,
                pointerEvents: 'none', color: 'white',
                textShadow: '0 1px 4px black',
              }}>
              <span style={{ fontSize: 26 }}>{visual.icon}</span>
              <span style={{ fontSize: 10, background: 'rgba(0,0,0,.6)', borderRadius: 4, padding: '1px 4px' }}>{visual.label}</span>
            </span>
          );
        })}
        {flight && (() => {
          const plot = PLOT_HOTSPOTS[flight.landId - 1];
          if (!plot) return null;
          const targetX = `calc(${plot.left} + ${plot.width} / 2)`;
          const targetY = `calc(${plot.top} + ${plot.height} / 2)`;
          const warehouseX = '16%';
          const warehouseY = '35%';
          return (
            <span key={flight.sequence} className="farm-v2-flight" aria-hidden="true"
              style={{
                position: 'absolute', pointerEvents: 'none', zIndex: 30, fontSize: 28,
                left: flight.operation === 'sow' ? targetX : warehouseX,
                top: flight.operation === 'sow' ? targetY : warehouseY,
                ['--from-x' as string]: flight.operation === 'sow' ? warehouseX : targetX,
                ['--from-y' as string]: flight.operation === 'sow' ? warehouseY : targetY,
                ['--to-x' as string]: flight.operation === 'sow' ? targetX : warehouseX,
                ['--to-y' as string]: flight.operation === 'sow' ? targetY : warehouseY,
                animation: 'farmV2Flight 850ms ease-in-out both',
              }}>
              {flight.icon}
            </span>
          );
        })()}
        <div aria-label="正式農田狀態" style={{ position: "absolute", top: "75%", left: 12, right: 12, pointerEvents: "none", background: "rgba(16, 27, 20, .85)", color: "white", padding: 12, borderRadius: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {data.plots.map(plot => <span key={plot.id}>{plot.name}：{!plot.unlocked ? "🔒" : plot.state === "ready" ? "🌾" : plot.state === "growing" ? "🌱" : "▫️"}</span>)}
        </div>
      </div>
      <h2>乾坤福田</h2>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {pendingRetry && (
        <div role="alert">
          <p>上一筆操作的結果尚未確認，請重試原操作；在確認前無法執行其他交易。</p>
          <button type="button" disabled={busy || loading}
            onClick={() => { void execute(pendingRetry.operation, pendingRetry.landId, pendingRetry.quantity); }}>
            重試尚未確認的操作（沿用原交易編號）
          </button>
        </div>
      )}
      <button type="button" disabled={busy || loading} onClick={() => { void refresh(); }}>
        更新農田
      </button>
      {selectedLand === null && <p>點擊空田直接播種，點擊成熟田直接收成；其他田地可查看狀態。</p>}
      <div>
        {data.plots.filter(plot => selectedLand === plot.id + 1).map(plot => {
          const seeds = data.seedInventory[plot.cropId] ?? 0;
          const crops = data.cropInventory[plot.cropId] ?? 0;
          const canSow = plot.unlocked && plot.state === 'empty' && seeds >= plot.maxSeeds;
          const canHarvest = plot.unlocked && plot.state === 'ready';
          const exchangeUnit = CROP_DATA[plot.cropId].sellQty;
          const canExchange = plot.unlocked && crops >= exchangeUnit;
          const canPurchase = plot.unlocked && plot.id < 5;
          return (
            <article key={plot.id}>
              <h3>{plot.name}</h3>
              <p>{!plot.unlocked ? '🔒 尚未解鎖' : plot.state === 'ready' ? '已成熟' : plot.state === 'growing' ? '生長中' : '待播種'}</p>
              <p>種子：{seeds}／整批 {plot.maxSeeds}；倉庫作物：{crops}</p>
              {plot.unlocked && plot.state === 'growing' && plot.growthEndTime && (
                <p>預計成熟：{new Date(plot.growthEndTime).toLocaleString('zh-TW')}</p>
              )}
              <button type="button" disabled={busy || loading || !!pendingRetry || !canSow}
                onClick={() => { void execute('sow', plot.id + 1); }}>整批播種</button>
              <button type="button" disabled={busy || loading || !!pendingRetry || !canHarvest}
                onClick={() => { void execute('harvest', plot.id + 1); }}>收成入庫</button>
              {canPurchase && <button type="button" disabled={busy || loading || !!pendingRetry}
                onClick={() => { void execute('purchaseSeeds', plot.id + 1, 1); }}>購買一包種子（1 金幣）</button>}
              <button type="button" disabled={busy || loading || !!pendingRetry || !canExchange}
                onClick={() => { void execute('exchangeCrops', plot.id + 1, exchangeUnit); }}>
                兌換 {exchangeUnit} 株作物
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
