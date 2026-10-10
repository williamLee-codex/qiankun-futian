import { useEffect, useState, useRef } from "react";
import {
  SCENE_LAYOUTS,
  sceneLandAction,
  type SceneRegion,
} from "./sceneInteractionRuntime";
import { FARM_V2_LANDS } from "./canonicalLandData";
import { DECOR_CATALOG } from "./decorCatalog";
import { FORMATION_NAMES } from "./formationSourcesRuntime";
import type { Plot } from "../types";
import type { PotGrade } from "./potRuntime";
import "./farmSceneInteraction.css";
import type { ScenePublicState } from "./publicCave";
export function FarmSceneInteractionLayer(props: {
  plots: Plot[];
  state: ScenePublicState;
  ownerLabel: string;
  readOnly?: boolean;
  busy: boolean;
  onLandSelect?: (id: number) => void;
  onLandAction?: (kind: "sow" | "harvest", id: number) => Promise<void>;
  onFriendAction?: (kind: "BORROW" | "ASSIST", id: number) => Promise<void>;
  onSection?: (section: string) => void;
  onReturnHome?: () => void;
  onRefresh?: () => unknown;
}) {
  const [desktop, setDesktop] = useState(
      () =>
        typeof window !== "undefined" &&
        window.matchMedia("(min-width:768px)").matches,
    ),
    [interior, setInterior] = useState(false),
    [clock, setClock] = useState(Date.now());
  const maturityRead = useRef("");
  useEffect(() => {
    const q = window.matchMedia("(min-width:768px)");
    const update = () => setDesktop(q.matches);
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const plots = props.plots.map((p) =>
    p.state === "growing" &&
    p.growthEndTime !== null &&
    p.growthEndTime <= clock
      ? { ...p, state: "ready" as const }
      : p,
  );
  useEffect(() => {
    const ready = props.plots
      .filter(
        (p) =>
          p.state === "growing" &&
          p.growthEndTime !== null &&
          p.growthEndTime <= clock,
      )
      .map((p) => p.id + ":" + p.growthEndTime)
      .join(",");
    if (ready && ready !== maturityRead.current && !props.busy) {
      maturityRead.current = ready;
      props.onRefresh?.();
    }
  }, [clock, props.plots, props.busy, props.onRefresh]);
  const formationExpired =
    props.state.activeFormationExpiresAt != null &&
    props.state.activeFormationExpiresAt <= clock;
  useEffect(() => {
    if (formationExpired && !props.busy) props.onRefresh?.();
  }, [formationExpired, props.busy, props.onRefresh]);
  const layout = desktop ? SCENE_LAYOUTS.desktop : SCENE_LAYOUTS.mobile;
  const position = (r: SceneRegion) => ({
    left: r.x + "%",
    top: r.y + "%",
    width: r.w + "%",
    height: r.h + "%",
  });
  const section = (name: string) => props.onSection?.(name);
  return (
    <section
      className={"farm-v2-interaction " + (desktop ? "desktop" : "mobile")}
      aria-label={props.ownerLabel + "場景互動層"}
      data-layout={desktop ? "desktop" : "mobile"}
    >
      <header>
        <strong>
          {props.ownerLabel}
          {interior ? "・洞府" : "・農場"}
        </strong>
        <span>定版場景原圖待接入</span>
        {props.onReturnHome && (
          <button onClick={props.onReturnHome}>返回我的福田</button>
        )}
      </header>
      <div
        className={"farm-v2-canvas " + (interior ? "interior" : "exterior")}
        style={{ aspectRatio: layout.aspectRatio }}
      >
        {interior ? (
          <>
            <button className="farm-v2-exit" onClick={() => setInterior(false)}>
              離開洞府・回到{props.ownerLabel}農場
            </button>
            <div className="farm-v2-meditation">洞府主角・打坐</div>
            {Array.from({ length: 6 }, (_, i) => {
              const decor = props.state.decor.find((d) => d.slot === i + 1);
              return (
                <button
                  key={i}
                  className="farm-v2-decor"
                  style={{
                    left: (desktop ? [5, 38, 71] : [5, 38, 71])[i % 3] + "%",
                    top: (desktop ? (i < 3 ? 23 : 70) : i < 3 ? 20 : 70) + "%",
                    width: "24%",
                    height: desktop ? "17%" : "13%",
                  }}
                  disabled={props.readOnly || props.busy}
                  onClick={() => section("洞府")}
                >
                  {decor
                    ? DECOR_CATALOG.find((d) => d.id === decor.catalogId)?.name
                    : "陳設互動位 " + (i + 1)}
                </button>
              );
            })}
          </>
        ) : (
          <>
            <button
              className="farm-v2-cave"
              style={position(layout.cave)}
              onClick={() => setInterior(true)}
            >
              進入洞府
            </button>
            <button
              className="farm-v2-formation"
              style={position(layout.formation)}
              disabled={props.readOnly || props.busy}
              onClick={() => section("護陣")}
            >
              {props.state.activeFormation && !formationExpired
                ? (FORMATION_NAMES[props.state.activeFormation] ?? "洞府護陣")
                : "護陣平台"}
            </button>
            {FARM_V2_LANDS.map((land, i) => {
              const p = plots.find((p) => p.id === i);
              if (!p) return null;
              const action = sceneLandAction(p);
              return (
                <div
                  className={"farm-v2-land " + p.state}
                  style={position(layout.lands[i])}
                  key={land.id}
                >
                  <button
                    aria-label={`${land.landName}，${!p.unlocked ? "未解鎖" : p.state === "ready" ? "已成熟" : p.state === "growing" ? "生長中" : "待播種"}`}
                    disabled={props.busy}
                    onClick={() => props.onLandSelect?.(land.id)}
                  >
                    <strong>{land.landName}</strong>
                    <span>
                      {!p.unlocked
                        ? "未解鎖"
                        : p.state === "ready"
                          ? "成熟・" + p.plantCount + "株"
                          : p.state === "growing"
                            ? "生長中・" +
                              Math.max(
                                0,
                                Math.ceil(
                                  ((p.growthEndTime ?? clock) - clock) / 60000,
                                ),
                              ) +
                              "分"
                            : "待播種"}
                    </span>
                  </button>
                  {!props.readOnly && action && (
                    <button
                      disabled={props.busy}
                      onClick={() => void props.onLandAction?.(action, land.id)}
                    >
                      {action === "sow" ? "播種" : "收成"}
                    </button>
                  )}
                  {props.readOnly &&
                    props.onFriendAction &&
                    land.borrowable &&
                    p.unlocked &&
                    p.state === "ready" && (
                      <>
                        <button
                          disabled={props.busy}
                          onClick={() =>
                            void props.onFriendAction?.("BORROW", land.id)
                          }
                        >
                          借運
                        </button>
                        <button
                          disabled={props.busy}
                          onClick={() =>
                            void props.onFriendAction?.("ASSIST", land.id)
                          }
                        >
                          助力收成
                        </button>
                      </>
                    )}
                </div>
              );
            })}
            {FARM_V2_LANDS.map((land, i) => {
              const pot = props.state.pots.find((p) => p.species === land.id);
              return (
                <button
                  className="farm-v2-pot"
                  key={land.id}
                  style={position(layout.pots[i])}
                  disabled={props.readOnly || props.busy}
                  onClick={() => section("盆栽")}
                >
                  {pot
                    ? `${land.cropName} ${pot.grade}品`
                    : `${land.cropName}展示位`}
                </button>
              );
            })}
            {["尋星犬", "辟邪狻猊", "噬時諦聽", "乾坤麒麟"].map((pet, i) => {
              const active =
                props.state.pets?.activePetId === pet &&
                (props.state.pets.activeUntil ?? 0) > clock;
              return (
                <button
                  className={"farm-v2-pet " + (active ? "active" : "")}
                  key={pet}
                  style={position(layout.pets[i])}
                  disabled={props.readOnly || props.busy}
                  onClick={() => section("靈寵")}
                >
                  {pet}・
                  {active
                    ? "活動中"
                    : props.state.pets?.owned.includes(pet)
                      ? "休息中"
                      : "未取得"}
                </button>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}
