import { farmV2ErrorMessage } from "./farmV2ErrorMessage";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FarmWorkshopPanel } from "./FarmWorkshopPanel";
import { FarmSceneInteractionLayer } from "./FarmSceneInteractionLayer";
import { workshopState } from "./workshopRuntime";
import { mapServerLands } from "./farmV2SceneAdapter";
import type { FarmV2PublicCave } from "./publicCave";
import { useState } from "react";
import { useFarmV2Scene } from "./useFarmV2Scene";
import { CROP_DATA } from "../types";
import { FARM_V2_LANDS } from "./canonicalLandData";
import { RELEASED_DECOR } from "./decorCatalog";

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
      | "configureFarmer",
    landId: number,
    quantity?: number,
  ) {
    setNotice(null);
    const ok = await mutate(operation, landId, quantity);
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
      className="farm-v2-authenticated-view"
      aria-label="乾坤福田正式農田"
      style={{ maxWidth: 1200, margin: "0 auto" }}
    >
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
        }}
        ownerLabel="我的福田"
        busy={busy || loading}
        onRefresh={() => { void refreshManually(); }}
        onLandSelect={setSelectedLand}
        onLandAction={execute}
        onSection={(tab) => {
          setPanelTab(tab);
          setPanelOpen(true);
        }}
      />
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
                <tbody>{FARM_V2_LANDS.map((land) => (
                  <tr key={land.id}><th scope="row">{land.landName}</th>
                    <td>{land.seedName}：{data.seedInventory[data.plots[land.id - 1].cropId] ?? 0}</td>
                    <td>{land.cropName}：{data.cropInventory[data.plots[land.id - 1].cropId] ?? 0}</td></tr>
                ))}</tbody>
              </table>
            </section>
          ) : panelTab === "乾坤寶囊" ? (
            <section aria-label="乾坤寶囊物品">
              <p>顯示已接入伺服器倉庫的物品；尚未接入的分類不顯示虛構數量。</p>
              <h3>種子與靈植</h3>
              <p>六田種子與收成集中於「福田倉庫」，不在此重複計算。</p>
              <h3>培養材料</h3>
              <p>蘊靈砂：{workshopState(data.warehouse).materials.蘊靈砂 ?? 0}；九霄玉髓：{workshopState(data.warehouse).materials.九霄玉髓 ?? 0}</p>
              <h3>盆栽</h3>
              {workshopState(data.warehouse).pots.length === 0 ? <p>目前沒有盆栽。</p> :
                <ul>{workshopState(data.warehouse).pots.map((pot) => (
                  <li key={pot.id}>第{pot.species}田・{pot.grade}階{pot.displayed ? "（展示中）" : ""}</li>
                ))}</ul>}
              <h3>洞府陳設</h3>
              {workshopState(data.warehouse).decor.length === 0 ? <p>目前沒有陳設。</p> :
                <ul>{workshopState(data.warehouse).decor.map((decor) => (
                  <li key={decor.id}>{RELEASED_DECOR.find((item) => item.id === decor.catalogId)?.name ?? decor.catalogId}{decor.slot === null ? "（未擺放）" : `（位置 ${decor.slot}）`}</li>
                ))}</ul>}
              <h3>其他物品</h3>
              <p>尚未接入伺服器的特殊物品、稱號與外觀，不列入可用庫存。</p>
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
          )
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
          disabled={busy || loading || !data.plots[5]?.unlocked}
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
          <DialogTitle>農田操作</DialogTitle>
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
              const canPurchase = plot.id < 5;
              return (
                <article key={plot.id}>
                  <h3>{plot.name}</h3>
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
                      <p>
                        預計成熟：
                        {new Date(plot.growthEndTime).toLocaleString("zh-TW")}
                      </p>
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
                  {canPurchase && (
                    <button
                      type="button"
                      disabled={busy || loading}
                      onClick={() => {
                        void execute("purchaseSeeds", plot.id + 1, 1);
                      }}
                    >
                      購買一包種子（1 金幣）
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

