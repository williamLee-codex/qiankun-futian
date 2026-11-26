/**
 * An unfinished workshop plan reserves the crops, pots and materials it will
 * write. Until it settles or is compensated, another operation must not consume
 * the same stored assets. Only the affected owner is fenced, and only while the
 * plan is unresolved, so unrelated play stays available.
 */
const UNRESOLVED_STATES = [
  "PENDING",
  "WALLET_PENDING",
  "WALLET_APPLIED",
  "COMPENSATING",
] as const;

import { sql } from "drizzle-orm";

type Executor = {
  execute: (query: unknown) => Promise<{ rows?: unknown[] } | unknown>;
};

export async function assertOwnerAssetsFree(
  tx: Executor,
  ownerId: string,
  requestId: string,
  code: string,
): Promise<void> {
  const states = sql.raw(
    `array['${UNRESOLVED_STATES.join("','")}']`,
  );
  const result = (await tx.execute(sql`
    select 1 from public.farm_v2_mutation
     where user_id = ${ownerId}::uuid
       and request_id <> ${requestId}
       and transaction_state::text = any(${states}::text[])
       and action like 'WORKSHOP:%'
     limit 1
  `)) as { rows?: unknown[] };
  if ((result.rows?.length ?? 0) > 0) throw new Error(code);
}
