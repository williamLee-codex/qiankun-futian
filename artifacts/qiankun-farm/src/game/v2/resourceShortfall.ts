export type ResourceKind = "crystal" | "seed" | "material";

export type ResourceShortfall = {
  kind: ResourceKind;
  label: string;
  required: number;
  available: number;
  missing: number;
};

export type ShortfallPlan =
  | { kind: "sufficient" }
  | { kind: "short"; shortfall: ResourceShortfall; actions: ("shop" | "back")[] };

const LABELS: Record<ResourceKind, string> = {
  crystal: "水晶",
  seed: "種子",
  material: "合成材料",
};

export function planResourceShortfall(
  kind: ResourceKind,
  required: number | null,
  available: number | null,
  hasShop: boolean,
): ShortfallPlan {
  if (required === null || available === null) return { kind: "sufficient" };
  const missing = required - available;
  if (missing <= 0) return { kind: "sufficient" };
  return {
    kind: "short",
    shortfall: { kind, label: LABELS[kind], required, available, missing },
    actions: hasShop ? ["shop", "back"] : ["back"],
  };
}
