import type { FarmSeedRecovery } from "./farmV2ApiClient";
import { FarmCoinWallet } from "./FarmCoinWallet";
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
  return (
    <p>
      成熟剩餘 {Math.floor(seconds / 3600)} 小時 {Math.floor(seconds / 60) % 60}{" "}
      分 {seconds % 60} 秒
    </p>
  );
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
    readSignIn,
    claimSignInToday,
    claimSignInMakeup,
    claimSignInPerfect,
    readSeedRecoveries,
    resumeSeedPurchase,
    transferCoins,
    pendingTransfers,
    visitCave,
    friendAction,
    pendingFriends,
  } = useFarmV2Scene(props.apiBaseUrl, props.launchToken);
  const [seedRecoveries,setSeedRecoveries]=useState<FarmSeedRecovery[]>([]);
  const [checkingSeeds,setCheckingSeeds]=useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInData, setSignInData] = useState<Awaited<ReturnType<typeof readSignIn>> | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [warehouseTab, setWarehouseTab] = useState<"crops" | "items">("crops");
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
  const [flight, setFlight] = useState<{
    icon: string;
    style: CSSProperties;
  } | null>(null);

  function playLandFlight(kind: "sow" | "harvest", landId: number) {
    const field = sceneRoot.current?.querySelector(
      `[data-farm-plot="${landId}"]`,
    );
    const fieldBox = field?.getBoundingClientRect();
    const warehouseBox = warehouseButton.current?.getBoundingClientRect();
    const plot = data?.plots.find((p) => p.id + 1 === landId);
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
    } else if (
      plot.unlocked &&
      plot.state === "empty" &&
      (data?.seedInventory[plot.cropId] ?? 0) >= plot.maxSeeds
    ) {
      void execute("sow", id);
    } else {
      setBuySeedsOnOpen(plot.unlocked && plot.state === "empty" && plot.id < 5);
      setSelectedLand(id);
    }
  }

  async function openSignIn() {
    setSignInOpen(true);
    setSignInError(null);
    setSignInData(null);
    try { setSignInData(await readSignIn()); }
    catch (error) { setSignInError(error instanceof Error ? error.message : "SIGNIN_UNAVAILABLE"); }
  }
  async function runSignInAction(action:()=>Promise<{status:string}>) {
    if (signInBusy) return;
    setSignInBusy(true); setSignInError(null);
    try {
      const result=await action();
      if (result.status!=="claimed" && result.status!=="already_claimed" && result.status!=="already_signed")
        throw new Error(result.status);
      setSignInData(await readSignIn());
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : "SIGNIN_ACTION_FAILED");
    } finally { setSignInBusy(false); }
  }

  async function refreshManually() {
    setNotice("正在更新農田…");
    const ok = await refresh();
    setNotice(
      ok
        ? `農田已更新（${new Date().toLocaleTimeString("zh-TW")}）。`
        : "農田更新失敗，請查看錯誤提示。",
    );
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
    const showFeedback =
      operation === "sow" ||
      operation === "harvest" ||
      operation === "purchaseSeeds";
    setLandFeedback(
      showFeedback ? { landId, kind: operation, confirmed: false } : null,
    );
    setFlight(null);
    if (showFeedback)
      setNotice(
        {
          sow: "播種確認中…",
          harvest: "收成確認中…",
          purchaseSeeds: "購買種子確認中…",
        }[operation],
      );
    if (
      operation === "sow" ||
      (operation === "harvest" && selectedLand === null)
    ) {
      if (operation === "sow") setSelectedLand(null);
      playLandFlight(operation, landId);
    }
    const ok = await mutate(operation, landId, quantity);
    if (!ok) setFlight(null);
    setLandFeedback(
      ok && showFeedback ? { landId, kind: operation, confirmed: true } : null,
    );
    setNotice(
      ok ? "操作已由伺服器確認。" : "操作未確認，請檢查錯誤並重新讀取。",
    );
  }

  // A direct /farm-v2/ visit may have no farm cookie even when the platform
  // login is still valid. Attempt the official launch exactly once per tab,
  // without storing credentials or looping on an unavailable login.
  useEffect(() => {
    if (loading || data || props.launchToken !== "browser-session" ||
        !["FARM_SESSION_NOT_ACTIVE", "AUTH_REQUIRED"].includes(error ?? "")) return;
    const key = "farm-v2:launch-recovery-attempted";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch { return; }
    const destination = new URL("/api/apps/qiankun-futian/launch?farmV2=1", window.location.origin);
    window.location.assign(destination.toString());
  }, [loading, data, error, props.launchToken]);

  if (loading && !data)
    return <section role="status">正在讀取正式農田資料…</section>;
  if (!data)
    return (
      <section
        role="alert"
        style={{
          minHeight: "100vh",
          background: "#0b1020",
          color: "#f8fafc",
          fontFamily: "system-ui, sans-serif",
          fontSize: 20,
          lineHeight: 1.6,
          padding: 24,
        }}
      >
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
        {notice && (
          <p role="status" aria-live="polite">
            {notice}
          </p>
        )}
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
      <Dialog open={signInOpen} onOpenChange={setSignInOpen}>
        <DialogContent style={{maxHeight:"85dvh",overflowY:"auto",background:"#12251f",color:"#f8f1df"}}>
          <DialogTitle>30 日簽到</DialogTitle>
          <p>補簽可領回當日獎勵，但不計入全勤；每日以台灣時間 05:00 換日。</p>
          {signInData && <>
            <p>第 {signInData.cycleNumber} 輪，第 {signInData.cycleDay} 天；補簽額度 {signInData.makeupCreditsAvailable ?? 0}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,minmax(0,1fr))",gap:4}}>
              {Array.from({length:30},(_,i)=>i+1).map(day=><div key={day}
                style={{padding:5,border:"1px solid #bda365",borderRadius:4,textAlign:"center",background:signInData.signedDays?.includes(day)?"#335b42":"transparent"}}
                aria-label={`第${day}天，${signInData.makeupDays?.includes(day)?"已補簽":signInData.signedDays?.includes(day)?"已簽到":"未簽到"}`}>
                {day}{signInData.makeupDays?.includes(day)?"補":signInData.signedDays?.includes(day)?"✓":""}
              </div>)}
            </div>
            <button type="button" disabled={signInBusy||!signInData.todayClaimable}
              onClick={()=>void runSignInAction(claimSignInToday)}>領取今日簽到</button>
            <button type="button" disabled={signInBusy||!signInData.makeupClaimable||signInData.nextMakeupDay==null}
              onClick={()=>void runSignInAction(()=>claimSignInMakeup(signInData.nextMakeupDay!))}>
              補簽第 {signInData.nextMakeupDay ?? "—"} 天
            </button>
            <p>全勤獎勵：徽章 ×1、水晶 ×3、金幣 ×200、蘊靈砂 ×2、九霄玉髓 ×2</p>
            <button type="button" disabled={signInBusy||!signInData.perfectAttendanceReady}
              onClick={()=>void runSignInAction(claimSignInPerfect)}>領取全勤獎勵</button>
          </>}
          {signInError && <p role="alert">{signInError}</p>}
          {!signInData && !signInError && <p>正在讀取簽到資料…</p>}
        </DialogContent>
      </Dialog>
      <button type="button" disabled={busy||loading} onClick={()=>void openSignIn()}>📅 30 日簽到</button>
      {data.localCoins && (
        <Dialog open={walletOpen} onOpenChange={setWalletOpen}>
          <DialogContent style={{ background: "#12251f", color: "#f8f1df", border: "1px solid #bda365", fontFamily: '"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif', width: "min(32rem, calc(100vw - 2rem))", maxHeight: "calc(100dvh - 2rem)", overflowY: "auto", lineHeight: 1.6 }}>
            <DialogTitle style={{ color: "#f8f1df", fontFamily: "inherit" }}>福田金幣錢包</DialogTitle>
            <FarmCoinWallet
              read={readWallet}
              transfer={transferCoins}
              pending={pendingTransfers}
              busy={busy}
            />
          </DialogContent>
        </Dialog>
      )}
      {data.localCoins && (
        <button
          type="button"
          aria-label="開啟福田金幣錢包，轉入或回存金幣"
          onClick={() => setWalletOpen(true)}
          disabled={busy || loading}
          style={{
            position: "fixed",
            left: "max(12px, env(safe-area-inset-left, 12px))",
            bottom: "max(16px, env(safe-area-inset-bottom, 16px))",
            zIndex: 45,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #bda365",
            background: "#12251f",
            color: "#f8f1df",
            fontFamily: '"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif',
            cursor: "pointer",
          }}
        >
          🪙 福田金幣・轉入／回存
        </button>
      )}
      {flight && (
        <span
          aria-hidden="true"
          className="farm-v2-flight"
          style={flight.style}
          onAnimationEnd={() => setFlight(null)}
        >
          {flight.icon}
        </span>
      )}
      <FarmSceneInteractionLayer
        warehouseTargetRef={warehouseButton}
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
        onRefresh={() => {
          void refreshManually();
        }}
        onLandSelect={(id) => {
          setBuySeedsOnOpen(false);
          setSelectedLand(id);
        }}
        pendingLandAction={
          landFeedback &&
          !landFeedback.confirmed &&
          landFeedback.kind !== "purchaseSeeds"
            ? landFeedback
            : undefined
        }
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
        <img
          src={`${import.meta.env.BASE_URL ?? "/"}images/farm/qiankun-bag.webp`}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
      </button>
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
              {data.localCoins && <button type="button" onClick={() => setWalletOpen(true)}>🪙 福田金幣・轉入／回存</button>}
              <button type="button" disabled={busy || loading || checkingSeeds} onClick={async () => {
                setCheckingSeeds(true);
                try { const result = await readSeedRecoveries(); setSeedRecoveries(result.purchases); setNotice(result.purchases.length ? "請接續原買種子交易，系統會先查核原扣款。" : "沒有待接續的買種子交易。"); }
                catch (cause) { setNotice(farmV2ErrorMessage(cause instanceof Error ? cause.message : "FARM_API_UNAVAILABLE")); }
                finally { setCheckingSeeds(false); }
              }}>查核未完成買種子</button>
      {seedRecoveries.length>0&&<section aria-label="未完成的買種子" style={{background:"#12251f",color:"#f8f1df",padding:16,fontFamily:'"Microsoft JhengHei",system-ui,sans-serif'}}>
        <p>以下是原本尚未完成的訂單。接續時會沿用原交易，避免再次扣款。</p>
        {seedRecoveries.map(original=><button key={original.requestId} disabled={busy||loading} onClick={async()=>{
          if(await resumeSeedPurchase(original)){setSeedRecoveries(rows=>rows.filter(row=>row.requestId!==original.requestId));setNotice("原買種子交易已接續完成。");}
        }}>接續第 {original.landId} 田原訂單（{original.packs} 包）</button>)}
      </section>}


              <nav aria-label="倉庫分類" style={{ display: "flex", gap: 8, margin: "12px 0" }}>
                <button type="button" aria-pressed={warehouseTab === "crops"} onClick={() => setWarehouseTab("crops")}>靈植倉庫</button>
                <button type="button" aria-pressed={warehouseTab === "items"} onClick={() => setWarehouseTab("items")}>道具背包</button>
              </nav>
              <div role="list" aria-label={warehouseTab === "crops" ? "靈植倉庫格子" : "道具背包格子"} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(76px, 1fr))", gap: 8 }}>
                {(warehouseTab === "crops"
                  ? FARM_V2_LANDS.map(land => {
                      const plot = data.plots.find(item => item.id === land.id - 1);
                      return { key: "crop-" + land.id, name: land.cropName, icon: plot?.cropEmoji ?? "🌿", qty: plot ? data.cropInventory[plot.cropId] ?? 0 : null };
                    })
                  : [
                      ...FARM_V2_LANDS.map(land => {
                        const plot = data.plots.find(item => item.id === land.id - 1);
                        return { key: "seed-" + land.id, name: land.seedName, icon: "🌱", qty: plot ? data.seedInventory[plot.cropId] ?? 0 : null };
                      }),
                      ...(data.warehouse.workshop ? [
                        { key: "material-sand", name: "蘊靈砂", icon: "✨", qty: data.warehouse.workshop.materials.蘊靈砂 ?? 0 },
                        { key: "material-jade", name: "九霄玉髓", icon: "💠", qty: data.warehouse.workshop.materials.九霄玉髓 ?? 0 },
                        { key: "pet-food", name: "靈獸百味糧", icon: "🥣", qty: data.warehouse.workshop.petFood ?? 0 },
                      ] : []),
                    ]
                ).map(item => (
                  <div role="listitem" key={item.key} title={item.name} style={{ minHeight: 88, border: "1px solid #a99565", borderRadius: 8, padding: 6, background: "#25392e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <span aria-hidden="true" style={{ fontSize: 24 }}>{item.icon}</span>
                    <span style={{ fontSize: 12 }}>{item.name}</span>
                    <strong style={{ fontSize: 12 }}>{item.qty === null ? "資料缺失" : "×" + item.qty}</strong>
                  </div>
                ))}
              </div>
              {warehouseTab === "items" && <p>此分類顯示伺服器回傳的種子、材料及靈獸飼料；尚未接入的道具不使用假數量。</p>}
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
        {[
          "福田倉庫",
          "乾坤寶囊",
          "盆栽",
          "洞府",
          "任務",
          "靈寵",
          "護陣",
          "好友",
        ].map((tab) => (
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
          disabled={
            busy ||
            loading ||
            !data.plots.find((plot) => plot.id === 5)?.unlocked
          }
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
      {error === "FARM_COIN_INSUFFICIENT" && data.localCoins && <button onClick={()=>{setSelectedLand(null);setPanelOpen(false);setWalletOpen(true);}}>轉入福田金幣</button>}
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
                      <button
                        type="button"
                        disabled={
                          busy ||
                          loading ||
                          (plot.id === 2 && !data.plots[1]?.unlocked)
                        }
                        onClick={() => {
                          void execute("unlockCoinLand", plot.id + 1);
                        }}
                      >
                        解鎖田地（{plot.id === 1 ? 88 : 888} 金幣）
                      </button>
                      {plot.id === 2 && !data.plots[1]?.unlocked && (
                        <p>請先解鎖第 2 田。</p>
                      )}
                    </>
                  )}
                  {landFeedback?.landId === plot.id + 1 && (
                    <div role="status" className="farm-v2-land-feedback">
                      {landFeedback.confirmed &&
                        landFeedback.kind !== "purchaseSeeds" && (
                          <span
                            aria-hidden="true"
                            className={`farm-v2-land-effect farm-v2-land-effect--${landFeedback.kind}`}
                          >
                            {landFeedback.kind === "sow" ? "🌱" : "🌾"}
                          </span>
                        )}
                      {landFeedback.confirmed
                        ? {
                            sow: "播種完成",
                            harvest: "收成已入庫",
                            purchaseSeeds: "種子已入庫",
                          }[landFeedback.kind]
                        : {
                            sow: "播種確認中…",
                            harvest: "收成確認中…",
                            purchaseSeeds: "購買種子確認中…",
                          }[landFeedback.kind]}
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
                      landFeedback.kind === "purchaseSeeds" &&
                      !landFeedback.confirmed
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
