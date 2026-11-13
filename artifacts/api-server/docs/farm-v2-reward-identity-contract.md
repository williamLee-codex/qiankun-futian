# Farm V2 reward identity and transaction contract — 2026-11-13

Verified against isolated Supabase project `ijguwqserwiufpxizgzy` (read-only inspection; no schema changes).

## Three separate identifiers

- `auth.users.id`: authenticated account UUID; `farm_v2_identity_active(p_user_id uuid)` verifies its status.
- `core.users.id`: internal Core user UUID. `farm_v2_purchase_coin_land` resolves it from `core.users.auth_user_id = p_owner_id`, then uses it for `platform.entitlements.user_id`.
- `public.core_wallets.owner_id`: auth account UUID, as proven by `farm_v2_purchase_coin_land` calling `core_wallet_get_or_create(p_owner_id)` and `core_wallet_apply_transaction(p_owner_id,...)`.
- Legacy farm `farm_v2_player_state.user_id`, `farm_v2_land.user_id`, `farm_v2_mutation.user_id` are TEXT. Treat as a separate representation until actual existing values and API serialization are validated. **Do not infer that text can always be cast to UUID.**

## Safe activity integration

1. Authenticated server must derive auth UUID from validated session, never a client-supplied user ID.
2. Resolve Core user ID via active `core.users` for entitlement decisions.
3. For farm activity tables, use canonical auth UUID as `owner_id uuid` if the route is auth-only, OR use legacy farm TEXT ID only if the existing farm mutation owner mapping is proven. Do not join IDs by casting or comparing untrusted strings.
4. After a committed farm mutation, derive verified event from `farm_v2_mutation.request_id` and its server-side action/result; enforce unique owner+transaction ID. No client event submission.
5. To claim a milestone, lock player/day, recompute progress, call existing `core_wallet_apply_transaction` with a stable idempotency key for coins, and write claim in the same database transaction. Non-coin reward inventory and pot ownership need their verified existing authority; do not claim before those adapters are available.
6. If a ledger credit returns an unexpected status, abort the transaction, not merely record a claim.
7. Apply no migration to production until the identity and reward contract is integration-tested.

## Current migration review status

`farm-v2-daily-activity-foundation.review.sql` currently uses TEXT farm identity. This is intentionally a review artifact, not deployable until canonical identity selection is finalized. Existing rewards, 30-day sign-in, first-purchase and ad center must share the same owner and reward ledger contract.
