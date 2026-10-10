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
export function FarmWorkshopPanel(props: {
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
  const [tab, setTab] = useState("盆栽"),
    [species, setSpecies] = useState(1),
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
        {["盆栽", "洞府", "任務", "靈寵", "護陣", "好友"].map((t) => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}>
            {t}
          </button>
        ))}
      </nav>
      <fieldset disabled={props.busy}>
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
                  {f.id === "FORMATION_PREMIUM_V2" ? "太虛星河大陣" : f.id}
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
