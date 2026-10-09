import farmBackground from '@assets/file_00000000095072069ef62748d273ae91_1783571778589.png';
import { useState } from 'react';
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

export function FarmV2AuthenticatedView(props: { apiBaseUrl: string; launchToken: string }) {
  const { data, error, loading, busy, refresh, mutate } =
    useFarmV2Scene(props.apiBaseUrl, props.launchToken);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedLand, setSelectedLand] = useState<number | null>(null);

  async function execute(operation: 'sow' | 'harvest' | 'purchaseSeeds' | 'exchangeCrops', landId: number, quantity?: number) {
    setNotice(null);
    const ok = await mutate(operation, landId, quantity);
    setNotice(ok ? '操作已由伺服器確認。' : '操作未確認，請檢查錯誤並重新讀取。');
  }

  if (loading && !data) return <section role="status">正在讀取正式農田資料…</section>;
  if (!data) return (
    <section role="alert">
      <p>無法取得正式農田資料，已停止所有操作。</p>
      {error && <p>{error}</p>}
      <button type="button" onClick={() => { void refresh(); }}>重新讀取</button>
    </section>
  );

  return (
    <section aria-label="乾坤福田正式農田" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ position: "relative", width: "min(100%, 390px)", aspectRatio: "390 / 843", margin: "0 auto", overflow: "hidden" }}>
        <img src={farmBackground} alt="乾坤福田六田場景" style={{ display: "block", width: "100%", height: "100%", objectFit: "fill" }} />
        {data.plots.map((plot, index) => (
          <button
            key={plot.id}
            type="button"
            aria-label={`${plot.name}，${!plot.unlocked ? '尚未解鎖' : plot.state === 'ready' ? '已成熟' : plot.state === 'growing' ? '生長中' : '待播種'}`}
            aria-pressed={selectedLand === plot.id + 1}
            disabled={busy || loading}
            onClick={() => setSelectedLand(plot.id + 1)}
            style={{
              position: 'absolute', ...PLOT_HOTSPOTS[index],
              border: selectedLand === plot.id + 1 ? '2px solid #f8d58a' : '1px solid transparent',
              background: selectedLand === plot.id + 1 ? 'rgba(255,215,130,.2)' : 'transparent',
              cursor: 'pointer',
            }}
          />
        ))}
        <div aria-label="正式農田狀態" style={{ position: "absolute", top: "75%", left: 12, right: 12, pointerEvents: "none", background: "rgba(16, 27, 20, .85)", color: "white", padding: 12, borderRadius: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {data.plots.map(plot => <span key={plot.id}>{plot.name}：{!plot.unlocked ? "🔒" : plot.state === "ready" ? "🌾" : plot.state === "growing" ? "🌱" : "▫️"}</span>)}
        </div>
      </div>
      <h2>乾坤福田</h2>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button type="button" disabled={busy || loading} onClick={() => { void refresh(); }}>
        更新農田
      </button>
      {selectedLand === null && <p>請點選 2D 場景中的農田查看操作。</p>}
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
              <button type="button" disabled={busy || loading || !canSow}
                onClick={() => { void execute('sow', plot.id + 1); }}>整批播種</button>
              <button type="button" disabled={busy || loading || !canHarvest}
                onClick={() => { void execute('harvest', plot.id + 1); }}>收成入庫</button>
              {canPurchase && <button type="button" disabled={busy || loading}
                onClick={() => { void execute('purchaseSeeds', plot.id + 1, 1); }}>購買一包種子（1 金幣）</button>}
              <button type="button" disabled={busy || loading || !canExchange}
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
