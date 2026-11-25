begin;

-- Foundation only. No client or public API may mint authoritative receipts.
-- A later server-authoritative combat execution path must populate this table.
create table platform.rpg_battle_receipts (
  battle_id uuid primary key,
  character_id uuid not null references platform.rpg_characters(id) on delete cascade,
  encounter_id text not null,
  status text not null check (status in ('victory', 'defeat')),
  defeated_monster_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(defeated_monster_ids) = 'array'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rpg_battle_receipts_encounter_nonempty
    check (char_length(btrim(encounter_id)) between 1 and 128)
);

create index rpg_battle_receipts_character_idx
  on platform.rpg_battle_receipts (character_id, created_at desc);

alter table platform.rpg_battle_receipts enable row level security;

-- No authenticated RLS policies: clients cannot insert, update or delete
-- server-authored battle receipts, or access their contents directly.
revoke all on table platform.rpg_battle_receipts from public, anon, authenticated;
-- Deliberately withhold direct INSERT/UPDATE from the API service role.
-- Future trusted issuance/settlement must run through narrow SECURITY DEFINER
-- functions, with provenance checks before a receipt can be created.
grant select on table platform.rpg_battle_receipts to service_role;

comment on table platform.rpg_battle_receipts is
  'Server-authored battle result receipts. This migration only establishes protected persistence; issuance and atomic settlement remain blocked until implemented and verified.';

commit;
