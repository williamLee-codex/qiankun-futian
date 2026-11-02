import { useEffect, useState, useRef } from "react";
import { SCENE_LAYOUTS, type SceneRegion } from "./sceneInteractionRuntime";
import { FARM_V2_LANDS } from "./canonicalLandData";
import { FORMATION_NAMES } from "./formationSourcesRuntime";
import type { Plot } from "../types";
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
  const caveEntry = useRef<HTMLButtonElement>(null);
  const caveExit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!interior) return;
    caveExit.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[role="dialog"]')) {
        setInterior(false);
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      caveEntry.current?.focus({ preventScroll: true });
    };
  }, [interior]);
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
      className={"farm-v2-interaction " + (desktop ? "desktop" : "mobile") + (interior ? " cave-open" : "")}
      aria-label={props.ownerLabel + "場景互動層"}
      data-layout={desktop ? "desktop" : "mobile"}
    >
      <header>
        <strong>
          {props.ownerLabel}
          {interior ? "・洞府" : "・農場"}
        </strong>
        <span>{interior ? "洞府內景" : "點選農田查看操作"}</span>
        {interior && (
          <button ref={caveExit} className="farm-v2-cave-return" onClick={() => setInterior(false)}>
            返回農場
          </button>
        )}
        {props.onReturnHome && (
          <button onClick={props.onReturnHome}>返回我的福田</button>
        )}
      </header>
      <div className={interior ? "farm-v2-cave-viewport" : "farm-v2-exterior-viewport"}>
      <div
        className={"farm-v2-canvas " + (interior ? "interior" : "exterior")}
        style={interior ? {
          aspectRatio: desktop ? "1672 / 941" : "941 / 1672",
          width: `min(100cqw, calc(100cqh * ${desktop ? 1672 / 941 : 941 / 1672}))`,
        } : { aspectRatio: layout.aspectRatio }}
      >
        {!interior && (
          <img
            className="farm-v2-scene-original"
            src={`${import.meta.env.BASE_URL ?? "/"}images/farm/farm-scene-${desktop ? "desktop" : "mobile"}.png`}
            alt="乾坤福田定版農場場景"
            width={desktop ? 1215 : 941}
            height={desktop ? 1295 : 1672}
            draggable={false}
          />
        )}
        {interior ? (
          <>
            <img
              className="farm-v2-scene-original"
              src={`${import.meta.env.BASE_URL ?? "/"}images/farm/cave-scene-${desktop ? "desktop" : "mobile"}.webp`}
              alt="洞府內景：中央打坐台、左右各三座展示台，後方石門與尋寶區預留位置"
              width={desktop ? 1672 : 941}
              height={desktop ? 941 : 1672}
              draggable={false}
            />

          </>
        ) : (
          <>
            <button
              ref={caveEntry}
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
                  aria-label={
                    pot
                      ? `${land.cropName} ${pot.grade}品盆栽`
                      : `${land.cropName}展示位`
                  }
                  title={
                    pot
                      ? `${land.cropName} ${pot.grade}品`
                      : `${land.cropName}展示位`
                  }
                  key={land.id}
                  style={position(layout.pots[i])}
                  disabled={props.readOnly || props.busy}
                  onClick={() => section("盆栽")}
                >
                  <span className="farm-v2-hotspot-label">{land.cropName}</span>
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
                  aria-label={`${pet}・${active ? "活動中" : props.state.pets?.owned.includes(pet) ? "休息中" : "未取得"}`}
                  key={pet}
                  style={position(layout.pets[i])}
                  disabled={props.readOnly || props.busy}
                  onClick={() => section("靈寵")}
                >
                  <span className="farm-v2-hotspot-label">
                    {pet}
                    <br />
                    {active
                      ? "活動中"
                      : props.state.pets?.owned.includes(pet)
                        ? "休息中"
                        : "未取得"}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>
      </div>
    </section>
  );
}

