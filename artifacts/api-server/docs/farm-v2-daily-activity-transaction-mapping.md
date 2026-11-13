# Farm V2 daily activity: authoritative transaction mapping (2026-11-13)

Verified against isolated Supabase `public.farm_v2_mutation` records; this is a mapping contract, not a deployed trigger.

| Committed action | Event | Reliable field | Counting caveat |
|---|---|---|---|
| `seed-purchase:<land>:<species>` | `buy_seeds` | `response.seedsAdded` | Seed units, not number of purchase actions. One committed transaction also satisfies `buy_seeds_once`. |
| `SOW:<land>` | `plant` | `response.land.plantedQuantity` | Represents post-operation planted stock. Only count as newly planted when the operation guarantees an initially empty plot; otherwise derive the delta from authoritative before/after state. |
| `HARVEST:<land>` | `harvest` | `response.creditedQuantity` | **Do not count directly as harvested plants:** newcomer sixfold and other multipliers can inflate credited units. Derive actual harvested plants from committed pre-harvest plot state. |

Rules:
1. Only `transaction_state='COMPLETED'` is eligible. Ignore `PENDING`, `COMPENSATED`, and failed operations.
2. Use the farm transaction's stable `request_id` and `user_id`, not a browser-supplied event or quantity. Daily event insert must share the committed farm mutation's transaction boundary or a replay-safe outbox.
3. Activity day is Asia/Taipei 05:00 to next 04:59:59; assign the six tasks once, before inserting events. Do not retroactively count events before the assignment exists without an explicit policy.
4. The existing event primary key `(user_id,transaction_id)` supports **one event per farm transaction**. If one mutation needs multiple event types, change the schema and projection together, with a deterministic event key.
5. Distinct species tasks require the canonical species ID from the committed operation; do not infer species from `land_id` alone.
6. Milestone grants must be committed atomically with the claim record. `farm_v2_daily_activity_claims` uniqueness alone does not grant or protect wallet/inventory credit.
7. Never infer identity by casting legacy `farm_v2_mutation.user_id TEXT` to `core_wallets.owner_id UUID`; use the verified canonical auth identity mapping.
8. This contract is deliberately non-executable until the harvest quantity and reward crediting APIs are verified. No direct browser event insert endpoint.
