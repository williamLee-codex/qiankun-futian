import { PotSynthesisGrid } from "./PotSynthesisGrid";
const unavailableWallet = async (): Promise<{ coins: number }> => { throw new Error("WALLET_UNAVAILABLE"); };
import { FORMATION_NAMES } from "./formationSourcesRuntime";
import {
  FORMATION_DEFINITIONS,
  formationPurchaseCost,
  getFormationDefinition,
  highestOwnedFormation,
} from "./formationCatalog";
import { nextFarmMonthReset } from "./timeRuntime";
import { useEffect, useState, type ReactNode } from "react";
import {
  workshopState,
  workshopPublicState,
  type WorkshopWarehouse,
  type WorkshopCommand,
} from "./workshopRuntime";
import { FARM_V2_MISSIONS, rollMissionPeriods, type MissionState } from "./missionRuntime";
import { FARM_V2_PETS } from "./petRuntime";
import { RELEASED_DECOR } from "./decorCatalog";
function formationPercent(ratio: { numerator: number; denominator: number }): number {
  return Math.round((ratio.numerator / ratio.denominator - 1) * 100);
}
const BAG_CATEGORIES = ["材料", "碎片", "傢俱", "外型", "盆栽", "大陣", "其他"] as const;
type BagSlot = { key: string; name: string; count: number; icon: string | null };
const slotStyle = { minHeight: 96, border: "1px solid #a98c52", borderRadius: 10, background: "linear-gradient(150deg,#284336,#152c23)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: 6 } as const;
function BagGrid({ slots, label }: { slots: readonly BagSlot[]; label: string }) {
  return (
    <div role="list" aria-label={label} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(92px,1fr))", gap: 10, padding: "12px 0" }}>
      {slots.map((slot) => (
        <div role="listitem" key={slot.key} style={slotStyle}>
          {slot.icon
            ? <img src={slot.icon} alt="" width="56" height="56" loading="lazy" style={{ objectFit: "contain", height: 56 }} />
            : <span aria-hidden="true" style={{ fontSize: 30, lineHeight: "56px" }}>◆</span>}
          <span style={{ fontSize: 12, color: "#f1dca4", textAlign: "center", lineHeight: 1.25 }}>{slot.name}</span>
          <strong style={{ alignSelf: "flex-end", color: "#fff1c2" }}>×{slot.count}</strong>
        </div>
      ))}
      {slots.length === 0 && <p style={{ gridColumn: "1/-1", margin: 0, color: "#b3c2b4" }}>此分類目前沒有物品。</p>}
    </div>
  );
}
export function FarmWorkshopPanel(props: {
  tab?: string;
  petId?: string | null;
  onTabChange?: (tab: string) => void;
  readFriends?: () => Promise<{ friends: { id: string }[] }>;
  visitCave?: (id: string) => Promise<{
    readOnly: boolean;
    lingyun: number;
    pots: unknown[];
    decor: unknown[];
    activeFormation: string | null;
  }>;
  readWallet?: () => Promise<{ coins: number }>;
  warehouse: WorkshopWarehouse;
  missions?: MissionState;
  dailyActivity?: ReactNode;
  pets?: {
    owned: string[];
    activePetId: string | null;
    activeUntil: number | null;
  };
  busy: boolean;
  transact: (c: WorkshopCommand) => Promise<boolean>;
}) {
  const [friends, setFriends] = useState<{ id: string }[]>([]),
    [visit, setVisit] = useState<{
      lingyun: number;
      pots: unknown[];
      decor: unknown[];
    } | null>(null),
    [friendError, setFriendError] = useState("");
  const [localTab, setLocalTab] = useState("盆栽");
  const [festivalCode, setFestivalCode] = useState("");
  const [selectedPet, setSelectedPet] = useState<string | null>(props.petId ?? null);
  useEffect(() => setSelectedPet(props.petId ?? null), [props.petId]);
  const [formationPurchase, setFormationPurchase] = useState<{
    id: string;
    cost: number;
    upgradeFrom: string | null;
  } | null>(null);
  const [bagCategory, setBagCategory] = useState<(typeof BAG_CATEGORIES)[number]>("材料");
  const tab = props.tab ?? localTab;
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (tab !== "靈寵" && tab !== "護陣") return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [tab]);
  const state = workshopState(props.warehouse), summary = workshopPublicState(props.warehouse);
  const bagInventoryAvailable = props.warehouse.workshop !== undefined;
  // A server snapshot may belong to the previous 05:00 period. Never offer
  // expired rewards while the server correctly rejects their claim.
  const missions = props.missions ? rollMissionPeriods(props.missions, Date.now()) : undefined;
  return (
    <section aria-label="福田倉庫與洞府管理">
      {tab !== "乾坤寶囊" && <nav>
        {["盆栽", "洞府", "任務", "靈寵", "護陣", "好友"].map((t) => (
          <button
            key={t}
            onClick={() => (props.onTabChange ?? setLocalTab)(t)}
            aria-pressed={tab === t}
          >
            {t}
          </button>
        ))}
      </nav>}
      {tab === "乾坤寶囊" && (
        <nav aria-label="乾坤寶囊分類" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {BAG_CATEGORIES.map((category) => (
            <button key={category} type="button" aria-pressed={bagCategory === category} onClick={() => setBagCategory(category)}>
              {category}
            </button>
          ))}
        </nav>
      )}
      <fieldset disabled={props.busy}>
        {tab === "乾坤寶囊" && (
          <section aria-label="乾坤寶囊分類物品">
            {!bagInventoryAvailable && <p role="alert">伺服器尚未提供乾坤寶囊庫存，無法確認物品數量；已停止寶囊操作。</p>}
            {bagInventoryAvailable && bagCategory === "材料" && (
              <BagGrid label="材料背包格子" slots={[
                { key: "蘊靈砂", name: "蘊靈砂", count: state.materials.蘊靈砂 ?? 0, icon: `${import.meta.env.BASE_URL ?? "/"}images/farm/items/蘊靈砂.png` },
                { key: "九霄玉髓", name: "九霄玉髓", count: state.materials.九霄玉髓 ?? 0, icon: `${import.meta.env.BASE_URL ?? "/"}images/farm/items/九霄玉髓.png` },
              ]} />
            )}
            {bagInventoryAvailable && bagCategory === "碎片" && <p>碎片庫存尚未接入。</p>}
            {bagInventoryAvailable && bagCategory === "傢俱" && (
              <BagGrid label="傢俱背包格子" slots={state.decor.map(d => ({
                key: d.id,
                name: RELEASED_DECOR.find(c => c.id === d.catalogId)?.name ?? "陳設",
                count: 1,
                icon: null,
              }))} />
            )}
            {bagInventoryAvailable && bagCategory === "外型" && <p>外型與稱號庫存尚未接入。</p>}
            {bagCategory === "盆栽" && <p>36 種盆栽的持有數量與合成操作統一在「盆栽合成」介面查看，不另設寶囊盆栽庫存。<button type="button" onClick={() => (props.onTabChange ?? setLocalTab)("盆栽")}>前往盆栽合成</button></p>}
            {bagCategory === "大陣" && (
              <>
                <BagGrid label="大陣道具格子" slots={(state.formations ?? []).map(f => ({
                  key: f.id,
                  name: FORMATION_NAMES[f.id] ?? "洞府護陣",
                  count: 1,
                  icon: `${import.meta.env.BASE_URL ?? "/"}images/farm/formations/taixu-xinghe-formation.webp`,
                }))} />
                <p>
                  裝備、卸下與購買資格一律在護陣管理介面處理，與農場主頁的大陣熱區開啟同一個介面。
                  <button type="button" onClick={() => (props.onTabChange ?? setLocalTab)("護陣")}>前往護陣管理</button>
                </p>
              </>
            )}
            {bagInventoryAvailable && bagCategory === "其他" && (
              <BagGrid label="其他物品格子" slots={[
                { key: "petFood", name: "靈獸百味糧", count: state.petFood ?? 0, icon: null },
              ]} />
            )}
          </section>
        )}
        {tab === "盆栽" && <PotSynthesisGrid warehouse={props.warehouse} busy={props.busy} readWallet={props.readWallet ?? unavailableWallet} transact={props.transact} />}
        {tab === "洞府" && (
          <>
            <h3>洞府陳設管理</h3>
            <p>
              靈韻 {summary.lingyun}・可用陳設位 {summary.unlockedSlots}/6
            </p>
            {state.decor.map((d) => (
              <article key={d.id}>
                {RELEASED_DECOR.find((c) => c.id === d.catalogId)?.name}
                <label htmlFor={`decor-slot-${d.id}`}>位置</label>
                <select
                  id={`decor-slot-${d.id}`}
                  value={d.slot ?? ""}
                  onChange={(e) =>
                    void props.transact({
                      kind: "placeDecor",
                      decorId: d.id,
                      slot:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="">福田倉庫</option>
                  {Array.from({ length: 6 }, (_, i) => (
                    <option
                      key={i}
                      value={i + 1}
                      disabled={
                        i >= summary.unlockedSlots ||
                        !RELEASED_DECOR.find((c) => c.id === d.catalogId)
                          ?.allowedSlots.some((slot: number) => slot === i + 1)
                      }
                    >
                      陳設位 {i + 1}（靈韻 {i * 20}）
                    </option>
                  ))}
                </select>
              </article>
            ))}
            <details>
              <summary>陳設商店（V2）</summary>
              {RELEASED_DECOR.map((c) => (
                <article key={c.id}>
                  {c.name}・{c.price}金幣
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          `購買${c.name}，成本${c.price}金幣；首次圖鑑獎勵30金幣。`,
                        )
                      )
                        void props.transact({
                          kind: "buyDecor",
                          catalogId: c.id,
                        });
                    }}
                  >
                    購買入倉
                  </button>
                </article>
              ))}
            </details>
          </>
        )}
        {tab === "任務" && (
          <>
            {props.dailyActivity}
            <h3>{props.dailyActivity ? "每週任務・主動領取" : "任務・主動領取"}</h3>
            {FARM_V2_MISSIONS.filter(m => !props.dailyActivity || m.period === "WEEKLY").map((m) => (
              <article key={m.id}>
                {
                  (
                    {
                      MISSION_D01: "播種",
                      MISSION_D02: "收成",
                      MISSION_D03: "福田交易",
                      MISSION_D04: "每日全勤",
                      MISSION_W01: "每週播種",
                      MISSION_W02: "每週收成",
                      MISSION_W03: "每週交易",
                      MISSION_W04: "每週全勤",
                    } as Record<string, string>
                  )[m.id]
                }
                ・{missions?.progress[m.id]?.progress ?? 0}/{m.target}・
                {m.reward.coins}金幣＋{m.reward.materialId}
                {m.reward.materialQuantity}
                <button
                  disabled={
                    !missions?.progress[m.id]?.completed ||
                    missions.progress[m.id]?.claimed
                  }
                  onClick={() =>
                    void props.transact({
                      kind: "claimMission",
                      missionId: m.id,
                    })
                  }
                >
                  {missions?.progress[m.id]?.claimed ? "已領取" : "領取"}
                </button>
              </article>
            ))}
          </>
        )}
        {tab === "靈寵" && (
          <>
            <h3>靈獸圖鑑</h3>
            <p>持有與否由伺服器里程碑（累積儲值）或直接取得決定；餵食靈獸需消耗對應份數的靈獸百味糧，啟動後 24 小時內生效。</p>
            <p>靈獸百味糧：倉庫 {state.petFood ?? 0} 份・每份 2 金幣
              <button type="button" disabled={props.busy} onClick={() => void props.transact({ kind: "buyFood", quantity: 1 })}>購買一份</button>
            </p>
            <div role="list" aria-label="靈獸圖鑑" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12, padding: "8px 0" }}>
              {FARM_V2_PETS.filter(pet => !props.petId || pet.id === props.petId).map((pet) => {
                const owned = props.pets?.owned.includes(pet.id) ?? false;
                const active = owned && props.pets?.activePetId === pet.id && (props.pets?.activeUntil ?? 0) > clock;
                const requirement = pet.acquisition.kind === "coins"
                  ? `${pet.acquisition.amount} 金幣`
                  : pet.acquisition.kind === "crystals"
                    ? `${pet.acquisition.amount} 水晶`
                    : `累積儲值滿 ${pet.acquisition.amount} 水晶`;
                const direct = pet.id === "尋星犬" || pet.id === "辟邪狻猊";
                const directId = direct ? (pet.id as "尋星犬" | "辟邪狻猊") : null;
                const open = selectedPet === pet.id;
                return (
                  <article key={pet.id} role="listitem" style={{ border: active ? "2px solid #ffe17b" : "1px solid #a99565", borderRadius: 10, padding: 10, background: active ? "#2c4030" : "#1b332a", display: "grid", gap: 6, opacity: owned ? 1 : 0.7 }}>
                    <img src={`${import.meta.env.BASE_URL ?? "/"}images/farm/characters/${pet.id}.png`} alt={`${pet.id}正式角色圖片`} style={{ width: "100%", height: 120, objectFit: "contain" }} />
                    <strong>{pet.id}</strong>
                    <span style={{ fontSize: 12, color: owned ? "#9fe0b4" : "#e0b48c" }}>{owned ? "已解鎖" : `未解鎖・${requirement}`}</span>
                    <span style={{ fontSize: 12 }}>每次啟動消耗百味糧 ×{pet.foodPerActivation}</span>
                    <span style={{ fontSize: 12, color: active ? "#ffd76a" : "#9fb2a6" }}>
                      {active ? `活動中・截止 ${new Date(props.pets!.activeUntil!).toLocaleString("zh-TW")}` : owned ? "休息中（尚未啟用）" : "尚未取得"}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {owned
                        ? <button type="button" disabled={props.busy || (state.petFood ?? 0) < pet.foodPerActivation} onClick={() => void props.transact({ kind: "feedPet", petId: pet.id })}>餵食</button>
                        : directId
                          ? <button type="button" disabled={props.busy} onClick={() => { if (window.confirm(`取得${pet.id}，支付${requirement}。`)) void props.transact({ kind: "buyPet", petId: directId }); }}>取得</button>
                          : null}
                      <button type="button" aria-expanded={open} onClick={() => setSelectedPet(open ? null : pet.id)}>說明</button>
                    </div>
                    {open && (
                      <div aria-label={`${pet.id}靈獸說明`} style={{ borderTop: "1px solid #4d6a58", paddingTop: 6 }}>
                        <img src={`${import.meta.env.BASE_URL ?? "/"}images/farm/pet-descriptions/${pet.id}-說明.png`} alt={`${pet.id}正式能力說明圖`} loading="lazy"
                          style={{ display: "block", width: "100%", height: "auto", borderRadius: 8 }}
                          onError={event => { event.currentTarget.style.display = "none"; const note = event.currentTarget.nextElementSibling; if (note instanceof HTMLElement) note.hidden = false; }} />
                        <p hidden role="status" style={{ fontSize: 12, color: "#e0b48c" }}>正式靈獸說明圖片尚未安裝，能力以官方核定規格為準。</p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
        {tab === "護陣" && (
          <>
            <p>
              當月登入 {state.attendance?.days.length ?? 0} 天・門檻{" "}
              {state.attendance
                ? Math.ceil(
                    Math.round(
                      (nextFarmMonthReset(state.attendance.monthStart) -
                        state.attendance.monthStart) /
                        86400000,
                    ) * 0.9,
                  )
                : "依月份計算"}{" "}
              天；達標後次月可手動啟用天道酬勤。
            </p>
            <label>
              官方節慶碼
              <input
                value={festivalCode}
                maxLength={128}
                autoComplete="off"
                onChange={(e) => setFestivalCode(e.target.value)}
              />
            </label>
            <button
              disabled={!festivalCode.trim()}
              onClick={() => {
                const code = festivalCode.trim();
                setFestivalCode("");
                void crypto.subtle
                  .digest("SHA-256", new TextEncoder().encode(code))
                  .then((hash) =>
                    props.transact({
                      kind: "redeemFormationCode",
                      codeHash: Array.from(new Uint8Array(hash))
                        .map((b) => b.toString(16).padStart(2, "0"))
                        .join(""),
                    }),
                  );
              }}
            >
              兌換節慶護陣
            </button>
            <button
              onClick={() =>
                void props.transact({ kind: "claimAchievementFormations" })
              }
            >
              領取已達成的成就護陣
            </button>
            <h3>洞府護陣</h3>
            <p>同時最多裝備一個護陣；由乾坤寶囊持有的護陣道具中選取，裝備資格與期限由伺服器驗證。</p>
            <div role="list" aria-label="持有護陣道具" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10, padding: "8px 0" }}>
              {(state.formations ?? [])
                .filter((f) => f.expiresAt === null || f.expiresAt > clock)
                .map((f) => {
                  const active = state.activeFormation === f.id;
                  const expiry = f.expiresAt === null ? "永久有效" : `有效至 ${new Date(f.expiresAt).toLocaleString("zh-TW")}`;
                  return (
                    <div role="listitem" key={f.id} style={{ border: active ? "2px solid #ffe17b" : "1px solid #a98c52", borderRadius: 10, padding: 10, background: active ? "#2c4030" : "#1b332a", display: "grid", gap: 6 }}>
                      <strong>{FORMATION_NAMES[f.id] ?? "洞府護陣"}</strong>
                      <span style={{ fontSize: 12, color: "#c6d3c9" }}>{expiry}</span>
                      <span style={{ fontSize: 12, color: active ? "#ffd76a" : "#9fb2a6" }}>{active ? "裝備中" : "未裝備"}</span>
                      <button type="button" disabled={props.busy} onClick={() => void props.transact({ kind: "switchFormation", formationId: active ? null : f.id })}>
                        {active ? "卸下" : "裝備"}
                      </button>
                    </div>
                  );
                })}
              {(state.formations ?? []).filter((f) => f.expiresAt === null || f.expiresAt > clock).length === 0 && <p style={{ gridColumn: "1/-1", margin: 0 }}>目前沒有持有任何護陣道具。</p>}
            </div>
            <h3>玄天陣典</h3>
            <p>同時只能啟用一座靈陣；已購買靈陣永久保留，已擁有靈陣之間切換免費，升級只支付價格差額。</p>
            <div role="list" aria-label="玄天陣典靈陣" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10, padding: "8px 0" }}>
              {FORMATION_DEFINITIONS.map((definition) => {
                const owned = (state.formations ?? []).some(
                  (f) => f.id === definition.id && (f.expiresAt === null || f.expiresAt > clock),
                );
                const equipped = state.activeFormation === definition.id;
                const highest = highestOwnedFormation(state.formations, clock);
                const cost = formationPurchaseCost(definition, highest);
                const upgrade = !owned && highest !== null && highest.priceCrystals < definition.priceCrystals;
                return (
                  <div role="listitem" key={definition.id} style={{ border: equipped ? "2px solid #ffe17b" : "1px solid #a98c52", borderRadius: 10, padding: 10, background: equipped ? "#2c4030" : "#1b332a", display: "grid", gap: 6 }}>
                    <strong>{definition.name}</strong>
                    <span style={{ fontSize: 12, color: "#c6d3c9" }}>永久持有・{definition.priceCrystals} 水晶</span>
                    <span style={{ fontSize: 12, color: "#c6d3c9" }}>生長 +{formationPercent(definition.bonusRatios.growthSpeed)}%・收成 +{formationPercent(definition.bonusRatios.harvestYield)}%・金幣 +{formationPercent(definition.bonusRatios.coinReward)}%・靈寵 +{formationPercent(definition.bonusRatios.petAssist)}%</span>
                    <span style={{ fontSize: 12, color: equipped ? "#ffd76a" : "#9fb2a6" }}>{equipped ? "運作中" : owned ? "已持有（於下方裝備）" : "尚未持有"}</span>
                    {owned ? null : upgrade ? (
                      <button type="button" disabled={props.busy} onClick={() => setFormationPurchase({ id: definition.id, cost, upgradeFrom: highest.id })}>
                        升級補差額 {cost} 水晶
                      </button>
                    ) : highest && highest.priceCrystals >= definition.priceCrystals ? (
                      <span style={{ fontSize: 12, color: "#9fb2a6" }}>已持有更高階靈陣，無需購買</span>
                    ) : (
                      <button type="button" disabled={props.busy} onClick={() => setFormationPurchase({ id: definition.id, cost, upgradeFrom: null })}>
                        購買 {definition.priceCrystals} 水晶
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {formationPurchase && (() => {
              const definition = getFormationDefinition(formationPurchase.id);
              if (!definition) return null;
              return (
                <div role="presentation" onClick={() => setFormationPurchase(null)} style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,.72)",display:"grid",placeItems:"center",padding:16}}>
                  <section role="dialog" aria-modal="true" aria-labelledby="formation-purchase-title" onClick={(event) => event.stopPropagation()} style={{width:"min(100%,420px)",background:"#1b332a",color:"#f1e5c7",border:"2px solid #b99b58",borderRadius:14,padding:22,display:"grid",gap:14,boxShadow:"0 20px 80px #0009"}}>
                    <h3 id="formation-purchase-title" style={{margin:0}}>{definition.name}</h3>
                    <p style={{margin:0}}>永久使用權，購買後可於護陣介面裝備或卸下；同時只能啟用一座靈陣。</p>
                    <p style={{margin:0,fontSize:13}}>裝備效果：六塊靈田生長速度 +{formationPercent(definition.bonusRatios.growthSpeed)}%、作物收成 +{formationPercent(definition.bonusRatios.harvestYield)}%、收成金幣 +{formationPercent(definition.bonusRatios.coinReward)}%、靈寵輔助效率 +{formationPercent(definition.bonusRatios.petAssist)}%。</p>
                    <p style={{margin:0,fontWeight:700}}>
                      {formationPurchase.upgradeFrom
                        ? `升級補差額：${formationPurchase.cost} 水晶（原價 ${definition.priceCrystals} 水晶）`
                        : `購買價格：${definition.priceCrystals} 水晶`}
                    </p>
                    <p style={{margin:0,fontSize:13}}>確認後由伺服器驗證資格及扣除水晶；未成功交易不會取得靈陣。</p>
                    <div style={{display:"flex",justifyContent:"flex-end",gap:12}}>
                      <button type="button" disabled={props.busy} onClick={() => setFormationPurchase(null)}>取消</button>
                      <button type="button" disabled={props.busy} onClick={() => { const id = formationPurchase.id; setFormationPurchase(null); void props.transact({ kind: "buyFormation", formationId: id }); }}>確認購買</button>
                    </div>
                  </section>
                </div>
              );
            })()}
          </>
        )}
        {tab === "好友" && (
          <>
            <h3>雙向好友與洞府唯讀參觀</h3>
            {friendError && <p role="alert">{friendError}</p>}
            {visit ? (
              <>
                <p>
                  好友洞府・靈韻 {visit.lingyun}・展示盆栽 {visit.pots.length}
                  ・陳設 {visit.decor.length}（唯讀）
                </p>
                <button onClick={() => setVisit(null)}>返回好友清單</button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setFriendError("");
                    void props
                      .readFriends?.()
                      .then((d) => setFriends(d.friends))
                      .catch((e) => setFriendError(e.message));
                  }}
                >
                  讀取好友
                </button>
                {friends.map((f, i) => (
                  <article key={f.id}>
                    好友 {i + 1}
                    <button
                      onClick={() => {
                        setFriendError("");
                        void props
                          .visitCave?.(f.id)
                          .then((d) => setVisit(d))
                          .catch((e) => setFriendError(e.message));
                      }}
                    >
                      參觀洞府
                    </button>
                  </article>
                ))}
              </>
            )}
          </>
        )}
      </fieldset>
    </section>
  );
}


