/**
 * Asset buckets a mutation writes. Recovery fencing compares these with the
 * buckets an unfinished plan actually changed, so an abandoned synthesis only
 * blocks operations that touch the same stored assets.
 */
const ACTION_BUCKETS: { match: RegExp; buckets: string[] }[] = [
  { match: /^WORKSHOP:.*"kind":"synthesize"/, buckets: ["workshop.pots", "workshop.materials", "workshop.petFood"] },
  { match: /^WORKSHOP:.*"kind":"decompose"/, buckets: ["workshop.pots", "workshop.materials"] },
  { match: /^WORKSHOP:.*"kind":"display"/, buckets: ["workshop.pots", "workshop.potGallery"] },
  { match: /^WORKSHOP:/, buckets: ["workshop.pots", "workshop.materials"] },
  { match: /^seed-purchase/, buckets: ["seeds"] },
  { match: /^(sow|plant)/, buckets: ["seeds", "crops"] },
  { match: /^harvest/, buckets: ["crops"] },
  { match: /^unlock/, buckets: ["lands"] },
];

function family(action: string): string {
  return action.includes(":") ? action.slice(0, action.indexOf(":")) : action;
}

export function actionAssetBuckets(action: string): string[] {
  for (const rule of ACTION_BUCKETS) if (rule.match.test(action)) return rule.buckets;
  return [`family:${family(action)}`];
}

function flatten(value: unknown, prefix: string, out: Record<string, string>) {
  if (value === null || typeof value !== "object") {
    out[prefix] = JSON.stringify(value);
    return;
  }
  if (Array.isArray(value)) {
    out[prefix] = JSON.stringify(value);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>))
    flatten(child, prefix ? `${prefix}.${key}` : key, out);
}

/** Buckets whose stored value the plan changes (before vs state). */
export function planAssetBuckets(plan: unknown): string[] {
  if (!plan || typeof plan !== "object") return [];
  const { before, state } = plan as { before?: unknown; state?: unknown };
  if (!before || !state || typeof before !== "object" || typeof state !== "object") return [];
  const a: Record<string, string> = {};
  const b: Record<string, string> = {};
  flatten(before, "", a);
  flatten(state, "", b);
  const changed = new Set<string>();
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (a[key] !== b[key]) changed.add(key);
  const buckets = new Set<string>();
  for (const key of changed) {
    const parts = key.split(".");
    // warehouse.pets / beforePets style roots stay whole so pet state is fenced.
    buckets.add(parts.slice(0, 2).join("."));
    if (parts[0] === "before" || parts[0] === "state") buckets.add(parts.slice(0, 3).join("."));
  }
  return [...buckets];
}

/**
 * True when an unfinished plan reserves an asset the incoming action writes.
 * An unreadable plan falls back to the action family, which is the safe side.
 */
const FENCED_PREFIXES = ["workshop.", "pets", "lands", "formations"];

/**
 * Seeds, crops and coins are low-value and follow the lenient compensation
 * policy, so they never lock a player out. Only high-value stored assets
 * (pots, materials, pets, land unlocks, formations) fence a new mutation.
 */
export function isFencedBucket(bucket: string): boolean {
  return FENCED_PREFIXES.some((prefix) => bucket === prefix.replace(/\.$/, "") || bucket.startsWith(prefix));
}

export function planBlocksAction(plan: unknown, pendingAction: string, action: string): boolean {
  const wanted = actionAssetBuckets(action).filter(isFencedBucket);
  if (!wanted.length) return false;
  const buckets = planAssetBuckets(plan);
  // An unreadable plan is the unsafe side: refuse same-family high-value work.
  if (!buckets.length) return family(pendingAction) === family(action);
  const reserved = buckets.filter(isFencedBucket);
  if (!reserved.length) return false;
  return reserved.some((bucket) =>
    wanted.some((want) => want === bucket || want.startsWith(`${bucket}.`) || bucket.startsWith(`${want}.`)),
  );
}
