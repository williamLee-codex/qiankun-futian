import { farmV2ErrorMessage } from "./farmV2ErrorMessage";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FarmWorkshopPanel } from "./FarmWorkshopPanel";
import { FarmSceneInteractionLayer } from "./FarmSceneInteractionLayer";
import { workshopState } from "./workshopRuntime";
import { mapServerLands } from "./farmV2SceneAdapter";
import type { FarmV2PublicCave } from "./publicCave";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useFarmV2Scene } from "./useFarmV2Scene";
import { CROP_DATA, type Plot } from "../types";
import { FARM_V2_LANDS } from "./canonicalLandData";

function MaturityCountdown({ end }: { end: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((end - now) / 1000));
  return <p>成熟剩餘 {Math.floor(seconds / 3600)} 小時 {Math.floor(seconds / 60) % 60} 分 {seconds % 60} 秒</p>;
}

/**
 * Authenticated Farm V2 integration surface. The platform host supplies a
 * validated launch token; this component never reads credentials from URL,
 * localStorage, or the legacy GameProvider.
 *
 * Intentionally separate from the legacy scene until platform routing is
 * approved. No simulated wallet, entitlement or success messages.
 */
export function FarmV2AuthenticatedView(props: {
  apiBaseUrl: string;
  launchToken: string;
}) {
  const {
    data,
    error,
    loading,
    busy,
    refresh,
    mutate,
    reauthenticateUrl,
    endSession,
    workshop,
    pendingWorkshop,
    readFriends,
    readWallet,
    visitCave,
    friendAction,
    pendingFriends,
  } = useFarmV2Scene(props.apiBaseUrl, props.launchToken);
  const [visited, setVisited] = useState<FarmV2PublicCave | null>(null);
  const [panelTab, setPanelTab] = useState("盆栽");
  const [panelOpen, setPanelOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedLand, setSelectedLand] = useState<number | null>(null);
  const [buySeedsOnOpen, setBuySeedsOnOpen] = useState(false);

  const [landFeedback, setLandFeedback] = useState<{
    landId: number;
    kind: "sow" | "harvest" | "purchaseSeeds";
    confirmed: boolean;
  } | null>(null);

  const sceneRoot = useRef<HTMLElement>(null);
  const warehouseButton = useRef<HTMLButtonElement>(null);
  const [flight, setFlight] = useState<{ icon: string; style: CSSProperties } | null>(null);

  function playLandFlight(kind: "sow" | "harvest", landId: number) {
    const field = sceneRoot.current?.querySelector(`[data-farm-plot="${landId}"]`);
    const fieldBox = field?.getBoundingClientRect();
    const warehouseBox = warehouseButton.current?.getBoundingClientRect();
    const plot = data?.plots.find(p => p.id + 1 === landId);
    if (!fieldBox || !warehouseBox || !plot) return;
    const from = kind === "sow" ? warehouseBox : fieldBox;
    const to = kind === "sow" ? fieldBox : warehouseBox;
    setFlight({
      icon: kind === "sow" ? "🫘" : plot.cropEmoji,
      style: {
        left: from.x + from.width / 2,
        top: from.y + from.height / 2,
        "--farm-flight-x": `${to.x + to.width / 2 - from.x - from.width / 2}px`,
        "--farm-flight-y": `${to.y + to.height / 2 - from.y - from.height / 2}px`,
      } as CSSProperties,
    });
  }

  function handlePlotClick(plot: Plot) {
    const id = plot.id + 1;
    if (plot.unlocked && plot.state === "ready") {
      void execute("harvest", id);
    } else if (plot.unlocked && plot.state === "empty" &&
        (data?.seedInventory[plot.cropId] ?? 0) >= plot.maxSeeds) {
      void execute("sow", id);
    } else {
      setBuySeedsOnOpen(plot.unlocked && plot.state === "empty" && plot.id < 5);
      setSelectedLand(id);
    }
  }

  async function refreshManually() {
    setNotice("正在更新農田…");
    const ok = await refresh();
    setNotice(ok
      ? `農田已更新（${new Date().toLocaleTimeString("zh-TW")}）。`
      : "農田更新失敗，請查看錯誤提示。");
  }

  async function execute(
    operation:
      | "sow"
      | "harvest"
      | "purchaseSeeds"
      | "exchangeCrops"
      | "claimChaos"
      | "configureFarmer"
      | "unlockCoinLand",
    landId: number,
    quantity?: number,
  ) {
    setNotice(null);
    const showFeedback = operation === "sow" || operation === "harvest" || operation === "purchaseSeeds";
    setLandFeedback(showFeedback ? { landId, kind: operation, confirmed: false } : null);
    setFlight(null);
    if (showFeedback) setNotice({ sow: "播種確認中…", harvest: "收成確認中…", purchaseSeeds: "購買種子確認中…" }[operation]);
    if (operation === "sow" || (operation === "harvest" && selectedLand === null)) {
      if (operation === "sow") setSelectedLand(null);
      playLandFlight(operation, landId);
    }
    const ok = await mutate(operation, landId, quantity);
    if (!ok) setFlight(null);
    setLandFeedback(ok && showFeedback ? { landId, kind: operation, confirmed: true } : null);
    setNotice(
      ok ? "操作已由伺服器確認。" : "操作未確認，請檢查錯誤並重新讀取。",
    );
  }

  if (loading && !data)
    return <section role="status">正在讀取正式農田資料…</section>;
  if (!data)
    return (
      <section role="alert" style={{minHeight:"100vh",background:"#0b1020",color:"#f8fafc",fontFamily:"system-ui, sans-serif",fontSize:20,lineHeight:1.6,padding:24}}>
        <p>無法取得正式農田資料，已停止所有操作。</p>
        {error && <p role="alert">{farmV2ErrorMessage(error)}</p>}
        {pendingWorkshop.map((command, index) => (
          <button
            key={index}
            disabled={busy || loading}
            onClick={() => void workshop(command)}
          >
            重試未確認交易（沿用原冪等鍵）
          </button>
        ))}
        {reauthenticateUrl && <a href={reauthenticateUrl}>重新登入御策羅盤</a>}
        <button
          type="button"
          onClick={() => {
            void refresh();
          }}
        >
          重新讀取
        </button>
      </section>
    );

  const friendRetries = pendingFriends.map((p, i) => (
    <button
      key={i}
      disabled={busy || loading}
      onClick={() => void friendAction(p.targetId, p.kind, p.landId)}
    >
      查核／重試原好友交易：{p.kind}・第{p.landId}田
    </button>
  ));
  if (visited)
    return (
      <>
        {friendRetries}
        <FarmSceneInteractionLayer
          plots={mapServerLands(visited.lands)}
          state={visited}
          ownerLabel="好友"
          readOnly
          busy={busy || loading}
          onRefresh={() => {
            void visitCave(visited.ownerId)
              .then(setVisited)
              .catch(() => setVisited(null));
          }}
          onReturnHome={() => setVisited(null)}
          onFriendAction={async (kind, landId) => {
            const ok = await friendAction(visited.ownerId, kind, landId);
            setNotice(
              ok
                ? "好友操作已由伺服器確認。"
                : "此次未取得作物，請查看錯誤或田地狀態。",
            );
            try {
              setVisited(await visitCave(visited.ownerId));
            } catch {
              setVisited(null);
            }
          }}
        />
        {notice && <p role="status" aria-live="polite">{notice}</p>}
        {error && <p role="alert">{farmV2ErrorMessage(error)}</p>}
      </>
    );
  return (
    <section
      ref={sceneRoot}
      className="farm-v2-authenticated-view"
      aria-label="乾坤福田正式農田"
      style={{ maxWidth: 1200, margin: "0 auto" }}
    >
      <button ref={warehouseButton} type="button" className="farm-v2-warehouse-target" onClick={() => {
        setPanelTab("福田倉庫");
        setPanelOpen(true);
      }}>倉庫</button>
      {flight && (
        <span aria-hidden="true" className="farm-v2-flight" style={flight.style}
          onAnimationEnd={() => setFlight(null)}>{flight.icon}</span>
      )}
      <FarmSceneInteractionLayer
        plots={data.plots}
        state={{
          pots: workshopState(data.warehouse).pots.filter((p) => p.displayed),
          decor: workshopState(data.warehouse).decor,
          activeFormation:
            workshopState(data.warehouse).activeFormation ?? null,
          activeFormationExpiresAt:
            workshopState(data.warehouse).formations?.find(
              (f) => f.id === workshopState(data.warehouse).activeFormation,
            )?.expiresAt ?? null,
          pets: data.pets,
          farmer: data.farmer,
        }}
        ownerLabel="我的福田"
        busy={busy || loading}
        onRefresh={() => { void refreshManually(); }}
        onLandSelect={(id) => { setBuySeedsOnOpen(false); setSelectedLand(id); }}
        pendingLandAction={landFeedback && !landFeedback.confirmed && landFeedback.kind !== "purchaseSeeds" ? landFeedback : undefined}
        onPlotClick={handlePlotClick}
        onSection={(tab) => {
          setPanelTab(tab);
          setPanelOpen(true);
        }}
      />
      <button
        type="button"
        className="farm-v2-bag-launcher"
        aria-label="開啟乾坤寶囊"
        title="乾坤寶囊"
        disabled={busy || loading}
        onClick={() => {
          setPanelTab("乾坤寶囊");
          setPanelOpen(true);
        }}
        style={{
          position: "fixed",
          top: "max(12px, env(safe-area-inset-top, 12px))",
          right: "max(12px, env(safe-area-inset-right, 12px))",
          zIndex: 40,
          width: "clamp(54px, 6vw, 78px)",
          aspectRatio: "1",
          padding: 0,
          border: 0,
          borderRadius: 16,
          background: "transparent",
          cursor: "pointer",
          filter: "drop-shadow(0 4px 8px rgba(0,0,0,.55))",
        }}
      >
        <img src={`${import.meta.env.BASE_URL ?? "/"}images/farm/qiankun-bag.webp`} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      </button>
      <h2>乾坤福田</h2>
      {friendRetries}
      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent
          className="farm-v2-operation-dialog"
          aria-describedby={undefined}
        >
          <DialogTitle>{panelTab}</DialogTitle>
          {panelTab === "福田倉庫" ? (
            <section aria-label="福田倉庫庫存">
              <p>以下數量來自目前伺服器回傳的農田庫存。</p>
              <table><thead><tr><th scope="col">田別</th><th scope="col">種子</th><th scope="col">靈植</th></tr></thead>
                <tbody>{FARM_V2_LANDS.map((land) => {
                  const plot = data.plots.find((item) => item.id === land.id - 1);
                  return (
                    <tr key={land.id}><th scope="row">{land.landName}</th>
                      <td>{land.seedName}：{plot ? (data.seedInventory[plot.cropId] ?? 0) : "資料缺失"}</td>
                      <td>{land.cropName}：{plot ? (data.cropInventory[plot.cropId] ?? 0) : "資料缺失"}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </section>
          ) : (
          <FarmWorkshopPanel
            tab={panelTab}
            onTabChange={setPanelTab}
            readFriends={readFriends}
            visitCave={async (id) => {
              const view = await visitCave(id);
              setVisited(view);
              return view;
            }}
            readWallet={readWallet}
            warehouse={data.warehouse}
            missions={data.missions}
            pets={data.pets}
            busy={busy || loading}
            transact={workshop}
          />
          )}
        </DialogContent>
      </Dialog>
      <nav aria-label="農場操作">
        {["福田倉庫", "乾坤寶囊", "盆栽", "洞府", "任務", "靈寵", "護陣", "好友"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setPanelTab(tab);
              setPanelOpen(true);
            }}
          >
            {tab}
          </button>
        ))}
      </nav>
      {pendingWorkshop.map((command, index) => (
        <button
          key={index}
          disabled={busy || loading}
          onClick={() => void workshop(command)}
        >
          重試未確認交易
        </button>
      ))}
      {data.chaos && (
        <button
          disabled={busy || loading || !data.plots.find((plot) => plot.id === 5)?.unlocked}
          onClick={() => void execute("claimChaos", 6)}
        >
          領取混沌種子（待領 {data.chaos.pending}）
        </button>
      )}
      {data.farmer?.entitled && (
        <fieldset disabled={busy || loading}>
          <legend>專屬農夫・各田自動耕作</legend>
          {data.plots.map((plot) => (
            <label key={plot.id} style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={
                  data.farmer!.enabledByLand[
                    (plot.id + 1) as 1 | 2 | 3 | 4 | 5 | 6
                  ]
                }
                onChange={(e) =>
                  void execute(
                    "configureFarmer",
                    plot.id + 1,
                    e.target.checked ? 1 : 0,
                  )
                }
              />
              {plot.name}
            </label>
          ))}
        </fieldset>
      )}
      <button
        type="button"
        disabled={busy || loading}
        onClick={() => {
          void endSession();
        }}
      >
        結束遊玩並登出
      </button>
      {error && <p role="alert">{farmV2ErrorMessage(error)}</p>}
      {notice && <p role="status">{notice}</p>}
      <button
        type="button"
        disabled={busy || loading}
        onClick={() => {
          void refreshManually();
        }}
      >
        {loading ? "正在更新農田…" : "更新農田"}
      </button>
      {selectedLand === null && <p>請點選 2D 場景中的農田查看操作。</p>}
      <Dialog
        open={selectedLand !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLand(null);
        }}
      >
        <DialogContent
          className="farm-v2-operation-dialog"
          aria-describedby={undefined}
        >
          <DialogTitle>{buySeedsOnOpen ? "購買種子" : "農田操作"}</DialogTitle>
          {data.plots
            .filter((plot) => selectedLand === plot.id + 1)
            .map((plot) => {
              const seeds = data.seedInventory[plot.cropId] ?? 0;
              const crops = data.cropInventory[plot.cropId] ?? 0;
              const canSow =
                plot.unlocked &&
                plot.state === "empty" &&
                seeds >= plot.maxSeeds;
              const canHarvest = plot.unlocked && plot.state === "ready";
              const exchangeUnit = CROP_DATA[plot.cropId].sellQty;
              const canExchange = plot.unlocked && crops >= exchangeUnit;
              const canPurchase = plot.unlocked && plot.id < 5;
              return (
                <article key={plot.id}>
                  <h3>{plot.name}</h3>
                  {!plot.unlocked && (plot.id === 1 || plot.id === 2) && (
                    <>
                      <button type="button" disabled={busy || loading || (plot.id === 2 && !data.plots[1]?.unlocked)}
                        onClick={() => { void execute("unlockCoinLand", plot.id + 1); }}>
                        解鎖田地（{plot.id === 1 ? 88 : 888} 金幣）
                      </button>
                      {plot.id === 2 && !data.plots[1]?.unlocked && <p>請先解鎖第 2 田。</p>}
                    </>
                  )}
                  {landFeedback?.landId === plot.id + 1 && (
                    <div role="status" className="farm-v2-land-feedback">
                      {landFeedback.confirmed && landFeedback.kind !== "purchaseSeeds" && (
                        <span
                          aria-hidden="true"
                          className={`farm-v2-land-effect farm-v2-land-effect--${landFeedback.kind}`}
                        >
                          {landFeedback.kind === "sow" ? "🌱" : "🌾"}
                        </span>
                      )}
                      {landFeedback.confirmed
                        ? { sow: "播種完成", harvest: "收成已入庫", purchaseSeeds: "種子已入庫" }[landFeedback.kind]
                        : { sow: "播種確認中…", harvest: "收成確認中…", purchaseSeeds: "購買種子確認中…" }[landFeedback.kind]}
                    </div>
                  )}
                  <p>
                    {!plot.unlocked
                      ? "🔒 尚未解鎖"
                      : plot.state === "ready"
                        ? "已成熟"
                        : plot.state === "growing"
                          ? "生長中"
                          : "待播種"}
                  </p>
                  <p>
                    種子：{seeds}／整批 {plot.maxSeeds}；倉庫作物：{crops}
                  </p>
                  {plot.unlocked &&
                    plot.state === "growing" &&
                    plot.growthEndTime && (
                      <MaturityCountdown end={plot.growthEndTime} />
                    )}
                  <button
                    type="button"
                    disabled={busy || loading || !canSow}
                    onClick={() => {
                      void execute("sow", plot.id + 1);
                    }}
                  >
                    整批播種
                  </button>
                  <button
                    type="button"
                    disabled={busy || loading || !canHarvest}
                    onClick={() => {
                      void execute("harvest", plot.id + 1);
                    }}
                  >
                    收成入庫
                  </button>
                  {buySeedsOnOpen && seeds < plot.maxSeeds && (
                    <p>還差 {plot.maxSeeds - seeds} 顆種子才能整批播種。</p>
                  )}
                  {canPurchase && (
                    <button
                      type="button"
                      disabled={busy || loading}
                      onClick={() => {
                        void execute("purchaseSeeds", plot.id + 1, 1);
                      }}
                    >
                      {landFeedback?.landId === plot.id + 1 &&
                      landFeedback.kind === "purchaseSeeds" && !landFeedback.confirmed
                        ? "購買種子確認中…"
                        : "購買一包種子（1 金幣）"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || loading || !canExchange}
                    onClick={() => {
                      void execute("exchangeCrops", plot.id + 1, exchangeUnit);
                    }}
                  >
                    兌換 {exchangeUnit} 株作物
                  </button>
                </article>
              );
            })}
        </DialogContent>
      </Dialog>
    </section>
  );
}

