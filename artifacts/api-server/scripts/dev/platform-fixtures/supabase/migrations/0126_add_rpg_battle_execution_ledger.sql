begin;

-- G03-P1: durable server-execution provenance foundation.
-- This table is intentionally NOT a receipt issuer or a settlement authority.
-- A later trusted transaction must bind an authenticated owned character,
-- the approved encounter, a server-computed outcome, and receipt issuance.
create table platform.rpg_battle_executions (
  battle_id uuid primary key,
  character_id uuid not null references platform.rpg_characters(id) on delete cascade,
  encounter_id text not null,
  player_level integer not null check (player_level between 1 and 100),
  status text not null check (status in ('victory', 'defeat')),
  defeated_monster_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(defeated_monster_ids) = 'array'),
  created_at timestamptz not null default now(),
  constraint rpg_battle_executions_encounter_nonempty
    check (char_length(btrim(encounter_id)) between 1 and 128)
);

create index rpg_battle_executions_character_idx
  on platform.rpg_battle_executions (character_id, created_at desc);

alter table platform.rpg_battle_executions enable row level security;
alter table platform.rpg_battle_executions force row level security;

-- No RLS policies and no API-role privileges. Neither authenticated users
-- nor service_role may directly fabricate or change execution evidence.
revoke all on table platform.rpg_battle_executions
  from public, anon, authenticated, service_role;

comment on table platform.rpg_battle_executions is
  'G03-P1 protected battle execution ledger. No issuance/settlement is enabled; future narrow trusted writer must prove server execution provenance.';

commit;
