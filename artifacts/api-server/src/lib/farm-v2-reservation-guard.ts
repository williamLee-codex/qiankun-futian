import { sql } from "drizzle-orm";

/**
 * An unfinished workshop plan reserves the crops, pots and materials it will
 * write. Until it settles or is compensated, another operation must not consume
 * the same stored assets. Only the affected owner and land are fenced.
 */
const UNRESOLVED_STATES = [
  "PENDING",
  "WALLET_PENDING",
  "WALLET_APPLIED",
  "COMPENSATING",
] as const;

type Executor = { execute: (query: unknown) => Promise<unknown> };

type ReservedRow = { action: string; plan: unknown };

function changedKeys(plan: unknown): string[] {
  if (!plan || typeof plan !== "object") return [];
  const { before, state } = plan as { before?: unknown; state?: unknown };
  if (!before || !state) return [];
  const flat = (value: unknown, prefix: string, out: Record<string, string>) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      out[prefix] = JSON.stringify(value);
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>))
      flat(child, prefix ? `${prefix}.${key}` : key, out);
  };
  const a: Record<string, string> = {};
  const b: Record<string, string> = {};
  flat(before, "", a);
  flat(state, "", b);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (key) => a[key] !== b[key],
  );
}

/** Lands whose stored crop count an unfinished plan changes. */
export function planReservedLands(plan: unknown): number[] {
  const lands = new Set<number>();
  for (const key of changedKeys(plan)) {
    const match = /crops\.(\d+)$/.exec(key);
    if (match) lands.add(Number(match[1]));
  }
  return [...lands];
}

async function reservedRows(
  tx: Executor,
  ownerId: string,
  requestId: string,
): Promise<ReservedRow[]> {
  const states = sql.raw(`array['${UNRESOLVED_STATES.join("','")}']`);
  const result = (await tx.execute(sql`
    select action, coalesce(wallet_transaction->'plan', wallet_transaction->'rejectedPlan') as plan
      from public.farm_v2_mutation
     where user_id = ${ownerId}
       and request_id <> ${requestId}
       and transaction_state::text = any(${states}::text[])
       and action like 'WORKSHOP:%'
  `)) as { rows?: ReservedRow[] };
  return result.rows ?? [];
}

export async function assertLandAssetsFree(
  tx: Executor,
  ownerId: string,
  requestId: string,
  landId: number,
  code: string,
): Promise<void> {
  for (const row of await reservedRows(tx, ownerId, requestId)) {
    const lands = planReservedLands(row.plan);
    // An unreadable plan keeps the reservation whole: the owner must recover it.
    if (!lands.length || lands.includes(landId)) throw new Error(code);
  }
}

export async function assertOwnerAssetsFree(
  tx: Executor,
  ownerId: string,
  requestId: string,
  code: string,
): Promise<void> {
  if ((await reservedRows(tx, ownerId, requestId)).length) throw new Error(code);
}
