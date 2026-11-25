# Farm DB baseline migration safety review

Local baseline preparation PASS; production identity/catalog/journal BLOCKED.

## Source and exact schema inventory

Source: `lib/db/src/schema/farm-v2.ts`, exported by `schema/index.ts`.
Migration: `lib/db/migrations/0002_farm_v2_game_baseline.sql`.
SHA256: `ec2027f41da1170cd7698c692ff2fcf30b084fbc7ce7d35198678101ccbb09b5`.

Notation: `!` means NOT NULL; `=...` means default. Primary-key columns are NOT NULL.

| Table                | Columns                                                                                                                                                                                                                                                                         | Primary key         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| farm_v2_player_state | user_id text!; first_farm_entered_at timestamptz; effective_paid_crystals integer!=0; access_state jsonb!; warehouse_state jsonb!; mission_state jsonb!; pet_state jsonb!; farmer_state jsonb!; chaos_seed_state jsonb; updated_at timestamptz!=now()                           | user_id             |
| farm_v2_land         | user_id text!; land_id integer!; lifecycle text!; access_active boolean!; planted_quantity integer!=0; planted_at timestamptz; matures_at timestamptz; version bigint!=0                                                                                                        | user_id, land_id    |
| farm_v2_mutation     | request_id text!; user_id text!; action text!; response jsonb; transaction_state text!='PENDING'; wallet_direction text; wallet_currency text; wallet_amount integer; wallet_transaction jsonb; failure_code text; updated_at timestamptz!=now(); created_at timestamptz!=now() | user_id, request_id |

Each table has only its implicit unique primary-key btree index. No foreign keys, additional unique/check constraints, or secondary indexes exist in the Drizzle baseline. SQL matches this exactly. No auth.users foreign key or product rules are added. No RLS policy or grant is invented; actual runtime role and schema default privileges must be reviewed before approval.

## Actual connection: unresolved

`lib/db/src/index.ts` and `lib/db/drizzle.config.ts` use `DATABASE_URL`. No project ID is hardcoded. The current environment has no DATABASE_URL or Farm/Supabase connection binding, no Farm .env file, and managed environment status reports no secrets/runtime variables/outbound identities. Neither Replit configuration nor deployment documentation identifies the live database. Platform project qowjznvinqoxekiyjyvy does not establish Farm identity.

Production table existence and Migration Journal are NOT verified. Missing prerequisite: a secure, verified Farm read-only connection, or operator-produced sanitized catalog/journal export plus trusted deployment database identity. Do not send credentials in chat.

`node scripts/farm-v2-db-preflight.mjs --plan` is offline and prints 0001 → 0002. Its legacy default preflight checks baseline readiness before 0001; it is not a fresh-install migration approval. Use `scripts/farm-v2-baseline-catalog.sql` for fresh-install read-only inspection. It discovers common journal table names and their shapes but does not assume any is authoritative. An operator must identify the actual journal and read its entries through a read-only query, then confirm both versions are unused or already applied with matching hashes. Absence of a journal in this repository is not evidence of absence in production.

## Order, stop conditions, recovery and acceptance

1. Keep V2 closed; verify the Farm endpoint/project independently of the platform. Obtain read-only schema, indexes, constraints, RLS, grants, and authoritative journal entries. Confirm public schema ownership/CREATE privilege for the eventual migration role and runtime SELECT/INSERT/UPDATE privileges. Anonymous/public access must be explicitly reviewed. Stop if identity/history/privileges cannot be established.
2. For a fresh six-table schema, execute existing **0001 → new 0002** only after separate approval. 0001 references only its own reconciliation tables/function, so it has no structural dependency on baseline tables. The previous “baseline before 0001” requirement was a runtime-readiness convention, superseded for fresh installations by this verified sequence. Runtime needs all six tables.
3. If 0001 is already recorded and its exact objects match, skip its execution. If any baseline table already exists, STOP: do not run 0002, use IF NOT EXISTS, drop tables, or push the schema. Compare exact catalog and journal; a separate reviewed adoption/repair procedure is required. Do not silently mark 0002 applied.
4. Execute each file with ON_ERROR_STOP and transaction support. 0002 has 5s lock / 30s statement timeouts and strict CREATE. Conflict, lock timeout, permission failure, schema mismatch, connection loss, or journal mismatch stops the entire sequence. Do not continue to deployment. Record version/hash only under the verified migration runner's transactional journal contract; this file does not invent a production journal.
5. Before COMMIT any 0002 error rolls back all its DDL. If connection outcome is uncertain, inspect catalog and journal read-only before retry. If 0001 committed but 0002 failed, retain 0001 and keep V2 closed; repair the cause then rerun only uncommitted 0002. After successful commit use forward fixes or approved backup recovery; never drop populated tables as an automatic rollback.
6. Acceptance: six public tables and 0001 audit trigger/function match source; all baseline columns/nullability/defaults/PKs/indexes match Drizzle; runtime role access is verified, unauthorized roles cannot access game data; authoritative journal versions/hashes are correct; old V1 remains available and V2 remains closed until separate release approval.

## Actual local evidence

PostgreSQL 17 in isolated container farm-v2-p0-test-db; generated disposable test databases only. No production query or mutation performed.

- Node tests: 5 PASS, 0 fail, 0 skip (additive SQL, empty DB + 0001 order, duplicate execution rejection, partial collision atomic rollback + retained sentinel row, existing preflight read-only/access/type checks).
- Drizzle-to-PostgreSQL catalog test: 1 PASS, 0 skip; every column type/nullability/default, PK order, index count and absence of FK/check/extra unique constraints compared against actual Drizzle objects.
- Workspace TypeScript: PASS.

No existing migration SQL was changed. No drizzle-kit push, remote build, deployment, push, or production SQL was run.

Local SQL preparation PASS. Formal Farm DB pre-migration acceptance remains BLOCKED until actual identity, catalog, journal, runtime ACL/RLS, and migration runner journal contract are verified. This is not production acceptance.
