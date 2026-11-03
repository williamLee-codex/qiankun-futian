import { FORMATION_NAMES } from "./formationSourcesRuntime";
import { nextFarmMonthReset } from "./timeRuntime";
import { useState } from "react";
import {
  workshopState,
  workshopPublicState,
  type WorkshopWarehouse,
  type WorkshopCommand,
} from "./workshopRuntime";
import {
  POT_GRADES,
  POT_GRADE_COSTS,
  POT_FIRST_UNLOCK_REWARDS,
  type PotGrade,
} from "./potRuntime";
import { FARM_V2_MISSIONS, type MissionState } from "./missionRuntime";
import { RELEASED_DECOR } from "./decorCatalog";
import { FARM_V2_LANDS } from "./canonicalLandData";
const BAG_CATEGORIES = ["材料", "碎片", "傢俱", "外型", "盆栽", "其他"] as const;
type BagCategory = (typeof BAG_CATEGORIES)[number];
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
  const [bagCategory, setBagCategory] = useState<BagCategory>("材料");
  const [festivalCode, setFestivalCode] = useState("");
  const tab = props.tab ?? localTab;
  const [species, setSpecies] = useState(1),
    [grade, setGrade] = useState<PotGrade>("黃"),
    [useDisplayed, setUseDisplayed] = useState(false);
  const state = workshopState(props.warehouse),
    summary = workshopPublicState(props.warehouse),
    index = POT_GRADES.indexOf(grade);
  const craft = () => {
    const source =
        index === 0
          ? "3株作物"
          : `${species === 6 ? 2 : 3}株同種${POT_GRADES[index - 1]}品盆栽`,
      material = index < 3 ? "蘊靈砂" : "九霄玉髓";
    if (
      window.confirm(
        `合成${grade}品：消耗${source}、${POT_GRADE_COSTS[grade].coins}金幣、${material}${[1, 1, 4, 2, 4, 10][index]}。${useDisplayed ? "使用並替換展示盆栽。" : ""}首次圖鑑獎勵${POT_FIRST_UNLOCK_REWARDS[grade]}金幣。`,
      )
    )
      void props.transact({ kind: "synthesize", species, grade, useDisplayed });
  };
  return (
    <section aria-label="福田倉庫與洞府管理">
      <nav>
        {["盆栽", "洞府", "任務", "靈寵", "護陣", "好友", "乾坤寶囊", "福田倉庫"].map((t) => (
          <button
            key={t}
            onClick={() => (props.onTabChange ?? setLocalTab)(t)}
            aria-pressed={tab === t}
          >
            {t}
          </button>
        ))}
      </nav>
      <fieldset disabled={props.busy}>
        {tab === "乾坤寶囊" && (
          <>
            <h3>乾坤寶囊</h3>
            <p>六類道具分開整理；靈寵本體、金幣與水晶不放入寶囊。</p>
            <nav aria-label="乾坤寶囊分類" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {BAG_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={bagCategory === category}
                  onClick={() => setBagCategory(category)}
                >
                  {category}
                </button>
              ))}
            </nav>
            {bagCategory === "材料" && (
              <div style={{ display: "grid", gap: 8 }}>
                {Object.entries(state.materials).map(([name, quantity]) => (
                  <article key={name} style={{ border: "1px solid #8c7650", borderRadius: 8, padding: 10 }}>
                    {name}<strong style={{ float: "right" }}>{quantity}</strong>
                  </article>
                ))}
                <article style={{ border: "1px solid #8c7650", borderRadius: 8, padding: 10 }}>
                  太乙五穀散<strong style={{ float: "right" }}>庫存資料尚未接入</strong>
                </article>
              </div>
            )}
            {bagCategory === "碎片" && (
              <p role="status">碎片分類已保留，暫無可讀取的碎片庫存；下一版接入陳列。</p>
            )}
            {bagCategory === "傢俱" && (
              <div style={{ display: "grid", gap: 8 }}>
                {state.decor.length === 0 && <p>目前尚無已取得的洞府陳設。</p>}
                {state.decor.map((item) => (
                  <article key={item.id} style={{ border: "1px solid #8c7650", borderRadius: 8, padding: 10 }}>
                    {RELEASED_DECOR.find((entry) => entry.id === item.catalogId)?.name ?? "洞府陳設"}
                    <span style={{ float: "right" }}>{item.slot === null ? "倉庫" : `已陳列・位置 ${item.slot}`}</span>
                  </article>
                ))}
                <p>陳設清單使用目前伺服器保存的洞府物品；展示配置依下一版規劃擴充。</p>
              </div>
            )}
            {bagCategory === "外型" && (
              <div style={{ display: "grid", gap: 8 }}>
                <h4>法陣</h4>
                {(state.formations ?? [])
                  .filter((item) => item.expiresAt === null || item.expiresAt > Date.now())
                  .map((item) => (
                    <article key={item.id} style={{ border: "1px solid #8c7650", borderRadius: 8, padding: 10 }}>
                      {FORMATION_NAMES[item.id] ?? item.id}
                      <span style={{ float: "right" }}>{state.activeFormation === item.id ? "使用中" : "已持有"}</span>
                    </article>
                  ))}
                {!state.formations?.length && <p>目前沒有已取得的法陣。</p>}
                <p>稱號、皮膚、徽章：目前尚未接入持有資料。</p>
              </div>
            )}
            {bagCategory === "盆栽" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))", gap: 8 }}>
                {FARM_V2_LANDS.flatMap((land) =>
                  POT_GRADES.map((potGrade) => {
                    const owned = state.pots.filter((item) => item.species === land.id && item.grade === potGrade);
                    return (
                      <article key={`${land.id}:${potGrade}`} style={{ border: "1px solid #8c7650", borderRadius: 8, padding: 10, background: "#10231c" }}>
                        <strong>{land.cropName}</strong>
                        <div>{potGrade}階盆栽</div>
                        <div>持有 {owned.length} 株</div>
                        {owned.some((item) => item.displayed) && <small>其中展示中 {owned.filter((item) => item.displayed).length} 株</small>}
                      </article>
                    );
                  }),
                )}
              </div>
            )}
            {bagCategory === "其他" && (
              <div style={{ display: "grid", gap: 8 }}>
                <article style={{ border: "1px solid #8c7650", borderRadius: 8, padding: 10 }}>
                  靈獸百味糧（現行程式道具名）<strong style={{ float: "right" }}>{state.petFood ?? 0}</strong>
                </article>
                <p>靈獸本體與貨幣不列入寶囊；金幣、水晶仍顯示在 HEADER。</p>
              </div>
            )}
          </>
        )}
        {tab === "福田倉庫" && (
          <>
            <h3>福田倉庫</h3>
            <p>此處讀取正式農田庫存；靈植與種子分區顯示。</p>
            <h4>靈植</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {FARM_V2_LANDS.map((land) => (
                <article key={`crop-${land.id}`} style={{ border: "1px solid #8c7650", borderRadius: 8, padding: 10 }}>
                  {land.cropName}<strong style={{ float: "right" }}>{props.warehouse.crops[land.id]}</strong>
                </article>
              ))}
            </div>
            <h4>種子</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {FARM_V2_LANDS.map((land) => (
                <article key={`seed-${land.id}`} style={{ border: "1px solid #8c7650", borderRadius: 8, padding: 10 }}>
                  {land.seedName}<strong style={{ float: "right" }}>{props.warehouse.seeds[land.id]}</strong>
                </article>
              ))}
            </div>
            <p>混沌種子由特殊方式取得，非商店購買。</p>
          </>
        )}
        {tab === "盆栽" && (
          <>
            <h3>盆栽合成與展示</h3>
            <p>
              蘊靈砂 {state.materials.蘊靈砂}・九霄玉髓{" "}
              {state.materials.九霄玉髓}
            </p>
            <label>
              物種
              <select
                value={species}
                onChange={(e) => setSpecies(Number(e.target.value))}
              >
                {FARM_V2_LANDS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.cropName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              產出品階
              <select
                value={grade}
                onChange={(e) => {
                  setGrade(e.target.value as PotGrade);
                  setUseDisplayed(false);
                }}
              >
                {POT_GRADES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            {index > 0 && (
              <label>
                <input
                  type="checkbox"
                  checked={useDisplayed}
                  onChange={(e) => setUseDisplayed(e.target.checked)}
                />
                使用展示中同品階盆栽
              </label>
            )}
            <button onClick={craft}>確認合成一株</button>
            <p>
              圖鑑 {Object.keys(state.potGallery).length}/36・展示靈韻{" "}
              {summary.lingyun}・好友容量 {summary.friendCapacity}
            </p>
            <details>
              <summary>盆栽圖鑑（六物種・六品階）</summary>
              {FARM_V2_LANDS.map((land) => (
                <article key={land.id}>
                  {land.cropName}
                  {POT_GRADES.map((g) => (
                    <p key={g}>
                      {g}品・
                      {state.potGallery[`${land.id}:${g}`] === undefined
                        ? "尚未取得"
                        : `首次取得 ${new Date(state.potGallery[`${land.id}:${g}`]).toLocaleDateString("zh-TW")}`}
                    </p>
                  ))}
                </article>
              ))}
            </details>
            {state.pots.map((p) => (
              <article key={p.id}>
                {FARM_V2_LANDS[p.species - 1].cropName}・{p.grade}品・
                {p.displayed ? "展示中" : "倉庫"}
                <button
                  onClick={() =>
                    void props.transact(
                      p.displayed
                        ? { kind: "removePot", species: p.species }
                        : { kind: "displayPot", potId: p.id },
                    )
                  }
                >
                  {p.displayed ? "取下" : "展示／替換"}
                </button>
              </article>
            ))}
          </>
        )}
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
                        !(
                          RELEASED_DECOR.find((c) => c.id === d.catalogId)!
                            .allowedSlots as readonly number[]
                        ).includes(i + 1)
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
                ・{props.missions?.progress[m.id]?.progress ?? 0}/{m.target}・
                {m.reward.coins}金幣＋{m.reward.materialId}
                {m.reward.materialQuantity}
                <button
                  disabled={
                    !props.missions?.progress[m.id]?.completed ||
                    props.missions.progress[m.id]?.claimed
                  }
                  onClick={() =>
                    void props.transact({
                      kind: "claimMission",
                      missionId: m.id,
                    })
                  }
                >
                  {props.missions?.progress[m.id]?.claimed ? "已領取" : "領取"}
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
              <article key={p}>
                {p}
                {props.pets?.activePetId === p ? "（活動中）" : ""}
                <button
                  onClick={() =>
                    void props.transact({ kind: "feedPet", petId: p })
                  }
                >
                  完整餵食・活動24小時
                </button>
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
