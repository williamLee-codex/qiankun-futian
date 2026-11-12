import { PotSynthesisGrid } from "./PotSynthesisGrid";
const unavailableWallet = async (): Promise<{ coins: number }> => { throw new Error("WALLET_UNAVAILABLE"); };
import { FORMATION_NAMES } from "./formationSourcesRuntime";
import { nextFarmMonthReset } from "./timeRuntime";
import { useState } from "react";
import {
  workshopState,
  workshopPublicState,
  type WorkshopWarehouse,
  type WorkshopCommand,
} from "./workshopRuntime";
import { FARM_V2_MISSIONS, rollMissionPeriods, type MissionState } from "./missionRuntime";
import { RELEASED_DECOR } from "./decorCatalog";
const BAG_CATEGORIES = ["材料", "碎片", "傢俱", "外型", "盆栽", "其他"] as const;
export function FarmWorkshopPanel(props: {
  tab?: string;
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
  const [selectedPet, setSelectedPet] = useState<string | null>(null);
  const [bagCategory, setBagCategory] = useState<(typeof BAG_CATEGORIES)[number]>("材料");
  const tab = props.tab ?? localTab;
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
              <>
                <p>蘊靈砂：{state.materials.蘊靈砂 ?? 0}</p>
                <p>九霄玉髓：{state.materials.九霄玉髓 ?? 0}</p>
              </>
            )}
            {bagInventoryAvailable && bagCategory === "碎片" && <p>碎片庫存尚未接入。</p>}
            {bagInventoryAvailable && bagCategory === "傢俱" && <p>傢俱系統預定於下一版本開放，本版不提供傢俱操作。</p>}
            {bagInventoryAvailable && bagCategory === "外型" && <p>外型與稱號庫存尚未接入。</p>}
            {bagCategory === "盆栽" && <p>36 種盆栽的持有數量與合成操作統一在「盆栽合成」介面查看，不另設寶囊盆栽庫存。<button type="button" onClick={() => (props.onTabChange ?? setLocalTab)("盆栽")}>前往盆栽合成</button></p>}
            {bagInventoryAvailable && bagCategory === "其他" && <p>靈獸飼料：{state.petFood ?? 0}</p>}
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
            <h3>任務・主動領取</h3>
            {FARM_V2_MISSIONS.map((m) => (
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
            {(["尋星犬", "辟邪狻猊"] as const).map((p) => (
              <button
                key={p}
                disabled={props.pets?.owned.includes(p)}
                onClick={() => {
                  if (
                    window.confirm(
                      `取得${p}，支付${p === "尋星犬" ? "300金幣" : "100水晶"}。`,
                    )
                  )
                    void props.transact({ kind: "buyPet", petId: p });
                }}
              >
                取得{p}
              </button>
            ))}
            <h3>靈獸百味糧</h3>
            <p>倉庫 {state.petFood ?? 0}份・每份2金幣</p>
            <button
              onClick={() =>
                void props.transact({ kind: "buyFood", quantity: 1 })
              }
            >
              購買一份
            </button>
            {props.pets?.owned.map((p) => (
              <article key={p} style={{ margin: "12px 0", padding: 12, border: "1px solid #a99565", borderRadius: 10 }}>
                <button type="button" onClick={() => setSelectedPet(selectedPet === p ? null : p)} aria-expanded={selectedPet === p}>
                  <img src={`${import.meta.env.BASE_URL ?? "/"}images/farm/characters/${p}.png`} alt="" style={{ width: 64, height: 64, objectFit: "contain", verticalAlign: "middle" }} />
                  {p}・查看靈獸資訊
                </button>
                {selectedPet === p && (
                  <section aria-label={p + "靈獸資訊"} style={{ padding: 12 }}>
                    <img src={`${import.meta.env.BASE_URL ?? "/"}images/farm/characters/${p}.png`} alt={p + "正式角色圖片"} style={{ display: "block", maxWidth: "100%", maxHeight: 220, objectFit: "contain", margin: "0 auto" }} />
                    <p>持有狀態：已取得</p>
                    <p>目前狀態：{props.pets?.activePetId === p && (props.pets.activeUntil ?? 0) > Date.now() ? "活動中" : "未活動"}</p>
                    {props.pets?.activePetId === p && props.pets.activeUntil != null && <p>本次活動截止：{new Date(props.pets.activeUntil).toLocaleString("zh-TW")}</p>}
                    <img
                      src={`${import.meta.env.BASE_URL ?? "/"}images/farm/pet-descriptions/${p}-說明.png`}
                      alt={p + "正式能力說明圖"}
                      loading="lazy"
                      style={{ display: "block", width: "100%", maxWidth: 460, height: "auto", margin: "12px auto", borderRadius: 10 }}
                      onError={event => { event.currentTarget.style.display = "none"; }}
                    />
                    <p>能力與飼料消耗以正式說明圖片為準；目前狀態及時間由伺服器提供。</p>
                    <button type="button" onClick={() => void props.transact({ kind: "feedPet", petId: p })}>餵食靈獸</button>
                  </section>
                )}
              </article>
            ))}
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
            <p>同時最多一個・純視覺</p>
            <button
              disabled={state.formations?.some(
                (f) => f.id === "FORMATION_PREMIUM_V2",
              )}
              onClick={() => {
                if (
                  window.confirm("取得太虛星河大陣，支付388水晶；永久使用權。")
                )
                  void props.transact({ kind: "buyFormation" });
              }}
            >
              取得太虛星河大陣
            </button>
            <button
              onClick={() =>
                void props.transact({
                  kind: "switchFormation",
                  formationId: null,
                })
              }
            >
              卸下護陣
            </button>
            {state.formations
              ?.filter((f) => f.expiresAt === null || f.expiresAt > Date.now())
              .map((f) => (
                <button
                  key={f.id}
                  onClick={() =>
                    void props.transact({
                      kind: "switchFormation",
                      formationId: f.id,
                    })
                  }
                >
                  {FORMATION_NAMES[f.id] ?? "洞府護陣"}
                  {state.activeFormation === f.id ? "（啟用中）" : ""}
                </button>
              ))}
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

