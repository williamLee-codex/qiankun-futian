import { farmV2ScenePlacement } from './farmV2ScenePlacement';
import { useEffect, useState } from 'react';
import type { FarmV2Operation } from './farmV2ApiClient';
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
  const [desktopView, setDesktopView] = useState(() => window.matchMedia('(min-width: 640px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const update = () => setDesktopView(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);
  const sceneAssetBase = `${import.meta.env.BASE_URL}images/farm/`;
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    document.body.classList.add('farm-v2-authenticated');
    return () => document.body.classList.remove('farm-v2-authenticated');
  }, []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  const [selectedLand, setSelectedLand] = useState<number | null>(null);
  async function execute(operation: FarmV2Operation, landId: number, quantity?: number) {
    setNotice(null);
    const ok = await mutate(operation, landId, quantity);
    setNotice(ok ? (operation === 'claimChaosSeeds' ? '混沌種子已收入倉庫。' : '操作已完成。') : '操作未確認，請檢查錯誤並重新讀取。');
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
      <p>{error === 'FARM_V2_MUTATION_CONFIRMED_STATE_REFRESH_FAILED'
        ? '操作已完成，但最新農田資料讀取失敗。請重新讀取，無須重做交易。'
        : '無法取得正式農田資料，已停止所有操作。'}</p>
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
    <section className="farm-v2-surface" aria-label="乾坤福田正式農田" style={{ maxWidth: 1100, margin: "0 auto" }}>

      <div style={{ position: "relative", width: "100%", margin: "0 auto", overflow: "hidden" }} data-testid="farm-v2-scene">
        <picture>
          <source media="(min-width: 640px)" srcSet={`${sceneAssetBase}farm-scene-desktop.png`} />
          <img src={`${sceneAssetBase}farm-scene-mobile.png`} alt="乾坤福田六田場景" style={{ display: "block", width: "100%", height: "auto" }} />
        </picture>
        {data.plots.map((plot, index) => (
          <button
            key={plot.id}
            type="button"
            aria-label={`${plot.name}，${!plot.unlocked ? '尚未解鎖' : plot.state === 'ready' ? '已成熟' : plot.state === 'growing' ? '生長中' : '待播種'}`}
            aria-pressed={selectedLand === plot.id + 1}
            disabled={busy || loading || !!pendingRetry}
            onClick={() => { void handlePlotClick(plot); }}
            style={{
              position: 'absolute', ...(() => { const { center, ...style } = farmV2ScenePlacement(plot.id + 1, desktopView); return style; })(),
              border: selectedLand === plot.id + 1 ? '2px solid #f8d58a' : '1px solid transparent',
              background: selectedLand === plot.id + 1 ? 'rgba(255,215,130,.2)' : 'transparent',
              cursor: 'pointer',
            }}
          />
        ))}
        {data.plots.map((plot, index) => {
          const serverNow = data.serverTime + Math.max(0, now - data.receivedAt);
          const visual = plot.unlocked ? cropVisual(plot, serverNow) : { icon: '🔒', label: '尚未解鎖' };
          if (!visual) return null;
          const center = farmV2ScenePlacement(plot.id + 1, desktopView).center;
          return (
            <span key={`visual-${plot.id}`} aria-hidden="true"
              style={{
                position: 'absolute',
                left: center.x,
                top: center.y,
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
        {/* Warehouse flights require verified original-scene anchors. */}
      </div>
      <h2>乾坤福田</h2>
      <details className="farm-v2-warehouse">
        <summary>福田倉庫</summary>
        {(busy || loading) && <p role="status">正在同步庫存…</p>}
        <table aria-label="福田倉庫種子與靈植">
          <caption>種子與靈植</caption>
          <thead><tr><th scope="col">種類</th><th scope="col">種子（顆）</th><th scope="col">靈植（株）</th></tr></thead>
          <tbody>{data.plots.map(plot => <tr key={plot.id} data-land-id={plot.id + 1}>
            <th scope="row">{plot.cropName}</th>
            <td>{data.seedInventory[plot.cropId]}</td>
            <td>{data.cropInventory[plot.cropId]}</td>
          </tr>)}</tbody>
        </table>
      </details>
      {data.farmer?.entitled && <fieldset className="farm-v2-farmer-controls" disabled={busy || loading || !!pendingRetry}>
        <legend>專屬農夫・各田自動耕作</legend>
        {data.plots.map(plot => {
          const enabled = data.farmer?.enabledByLand[plot.id + 1] === true;
          return <button key={plot.id} type="button" aria-pressed={enabled} onClick={() => { void execute('setFarmerEnabled', plot.id + 1, enabled ? 0 : 1); }}>{plot.name}農夫：{enabled ? 'ON' : 'OFF'}</button>;
        })}
      </fieldset>}
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
          const canExchange = crops >= exchangeUnit;
          const canPurchase = plot.id < 5;
          return (
            <article key={plot.id}>
              <h3>{plot.name}</h3>
              <p>{!plot.unlocked ? '🔒 尚未解鎖' : plot.state === 'ready' ? '已成熟' : plot.state === 'growing' ? '生長中' : '待播種'}</p>
              {!plot.unlocked && <p>{plot.unlockCoins !== null
                ? `${plot.id === 2 ? '需先解鎖幽熒沃土，再' : ''}支付 ${plot.unlockCoins} 金幣解鎖。`
                : `累積有效儲值達 ${plot.unlockCrystals} 水晶後取得使用資格。`}</p>}
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
              {plot.id === 5 && <>
                <p>待領混沌種子：{data.chaosPending} 顆（每 72 小時產生 1 顆，待領最多 3 顆）</p>
                <button type="button" disabled={busy || loading || !!pendingRetry || data.chaosPending === 0}
                  onClick={() => { void execute('claimChaosSeeds', 6); }}>領取混沌種子</button>
              </>}
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
