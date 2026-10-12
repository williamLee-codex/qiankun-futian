import { projectFarmV2WorldSurface } from "./farmV2ScenePlacement";
import type { FarmV2SceneLandEntity } from "./farmV2SceneWorld";

function cropVisual(plot: FarmV2SceneLandEntity["plot"], now: number) {
  if (!plot.unlocked) return { icon: "🔒", label: "尚未解鎖" };
  if (plot.state === "ready")
    return { icon: plot.cropEmoji, label: "成熟可收成" };
  if (plot.state !== "growing" || plot.growthEndTime === null) return null;
  const progress = Math.max(
    0,
    Math.min(
      1,
      (now - (plot.growthEndTime - plot.growthHours * 3600000)) /
        (plot.growthHours * 3600000),
    ),
  );
  if (progress >= 1) return { icon: plot.cropEmoji, label: "等待成熟確認" };
  if (progress < 0.25) return { icon: "🌱", label: "萌芽" };
  if (progress < 0.5) return { icon: "🌿", label: "幼苗" };
  if (progress < 0.75) return { icon: "🌳", label: "生長" };
  return { icon: plot.cropEmoji, label: "將熟" };
}
/** One interactive land owns both its visible crop and its activation identity. */
export function FarmV2LandEntity({
  entity,
  desktopView,
  selected,
  disabled,
  serverNow,
  onActivate,
}: {
  entity: FarmV2SceneLandEntity;
  desktopView: boolean;
  selected: boolean;
  disabled: boolean;
  serverNow: number;
  onActivate: (landId: number) => void;
}) {
  const { plot, landId, world } = entity;
  const { center, clipPath, ...placement } = projectFarmV2WorldSurface(
    world,
    desktopView,
  );
  const visual = cropVisual(plot, serverNow);
  const cropX =
    ((Number.parseFloat(center.x) - Number.parseFloat(placement.left)) /
      Number.parseFloat(placement.width)) *
    100;
  const cropY =
    ((Number.parseFloat(center.y) - Number.parseFloat(placement.top)) /
      Number.parseFloat(placement.height)) *
    100;
  return (
    <div
      className="farm-v2-land-entity"
      data-land-id={landId}
      data-world-x={world.center.x}
      data-world-y={world.center.y}
      data-lifecycle={plot.state}
      style={{ position: "absolute", ...placement }}
    >
      <button
        type="button"
        aria-label={`${plot.name}，${!plot.unlocked ? "尚未解鎖" : plot.state === "ready" ? "已成熟" : plot.state === "growing" ? "生長中" : "待播種"}`}
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => onActivate(landId)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          clipPath,
          border: selected ? "2px solid #f8d58a" : "1px solid transparent",
          background: selected ? "rgba(255,215,130,.2)" : "transparent",
          cursor: "pointer",
        }}
      />
      {visual && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${cropX}%`,
            top: `${cropY}%`,
            transform: "translate(-50%, -50%)",
            display: "grid",
            justifyItems: "center",
            gap: 2,
            pointerEvents: "none",
            color: "white",
            textShadow: "0 1px 4px black",
          }}
        >
          <span style={{ fontSize: 26 }}>{visual.icon}</span>
          <span
            style={{
              fontSize: 10,
              background: "rgba(0,0,0,.6)",
              borderRadius: 4,
              padding: "1px 4px",
            }}
          >
            {visual.label}
          </span>
        </span>
      )}
    </div>
  );
}
