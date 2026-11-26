# Transaction Safety Core (TSC) V1.0 — shared contract

TSC is shared infrastructure, not an App. 乾坤福田 V2 is the first implementation
and the reference for every 御策羅盤 App that adopts it later. The typed contract
lives in `artifacts/api-server/src/lib/tsc-contract.ts`.

## Interfaces

| Interface | Farm V2 implementation | Contract |
| --- | --- | --- |
| Transaction pre-check | `precheckSeedPurchase`, `precheckCropExchange`, `precheckWorkshopMaterials`, `precheckSynthesisMaterials` | Refuse with a normal business code **before** any journal row, wallet charge or reservation. `ok:false` carries the reason and the amounts. |
| Transaction identity | `farm_v2_mutation(user_id, request_id)` primary key | One request id identifies one transaction for its whole life, including retries and recovery. |
| Wallet scope | `central` (Core coins) and `farm` (Farm coin bank) | A compensation is scoped to one wallet. Never mix the two ledgers in one refund. |
| Atomic charge | `farm_v2_apply_wallet_transaction`, `farm_v2_bank` | The charge and its ledger row commit together, or neither does. |
| Delivery | mutation `response` + `transaction_state='COMPLETED'` | Delivery is recorded with the same request id, so a lost answer can be replayed without a second charge. |
| Idempotency | deterministic key `farm-v2:<request>:primary` / `:compensation` | A repeated or delayed attempt finds the existing row instead of creating a second one. |
| Coin compensation | `farm-v2-coin-compensation.ts`, `farm_v2_post_coin_compensation`, `farm_v2_bank.post_compensation` | Full refund for a confirmed charge with no delivery and for an unknown outcome; no clawback of a delivered item; crystals, destiny tickets and real money are excluded. |
| Background recovery | `farm-v2-recovery-queue.ts`, `farm_v2_recovery_task` | Durable task, lease with expiry reclaim, capped exponential backoff, attempt limit, terminal `done`/`abandoned`. Driven by a schedule, never by a resident process. |
| Anomaly classes | `farm_v2_transaction_health` | `RESOURCE_SHORTAGE` (normal usage), `AWAITING_CONFIRMATION`, `COMPENSATED`, `UNRECOVERED`. A shortage is never a major fault. |
| Operator audit | `GET /farm/v2/admin/transaction-health` behind `FARM_V2_ADMIN_KEY` | Operators only. A player session never reaches internal transaction data. |
| App isolation | per-user, per-request, per-land rows and asset locks | One abnormal transaction protects only the assets it touched; other lands, crops, workshops, friends, sign-ins, pets and other Apps keep working. |

## Rules an adopting App must follow

1. Refuse a shortage normally: show the amounts, return to the previous screen,
   never call the wallet.
2. Charge once per request id. A retry with the same id must not charge twice.
3. If the charge succeeded but the result was not delivered, refund in full.
   Do not re-charge and do not ask the player to retry.
4. If the charge or the delivery outcome is unknown, refund in full.
5. If the result already exists and only the answer was lost, recover the
   original result instead of charging again.
6. Never let one App's fault block another App.

## Adoption

An App implements `TransactionSafetyCore` from `tsc-contract.ts` against its own
tables and registers the same sweep schedule. Nothing in Farm V2 is required to
change, and no other App is modified until its own stage is approved.

## Deliberate limits

- The coin grace policy applies to coins only. Crystals and real money use the
  existing strict path with no grace.
- Recovery timings are configuration (`FARM_V2_RECOVERY_LEASE_SECONDS`,
  `_BATCH`, `_MAX_ATTEMPTS`, `_BACKOFF_SECONDS`, `_MAX_BACKOFF_SECONDS`). No
  number is declared an operating policy here.
- The sweep endpoint fails closed when `FARM_V2_RECOVERY_CRON_SECRET` is unset,
  and the operator surface fails closed when `FARM_V2_ADMIN_KEY` is unset.
