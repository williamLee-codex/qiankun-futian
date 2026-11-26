begin;

-- A matching battle ID and status still permits a forged monster kill list.
-- Bind the entire outcome to the immutable execution row as well.
alter table platform.rpg_battle_executions
  add constraint rpg_battle_executions_full_outcome_unique
  unique (battle_id, character_id, encounter_id, status, defeated_monster_ids);

alter table platform.rpg_battle_receipts
  add constraint rpg_battle_receipts_full_outcome_fk
  foreign key (battle_id, character_id, encounter_id, status, defeated_monster_ids)
  references platform.rpg_battle_executions
    (battle_id, character_id, encounter_id, status, defeated_monster_ids)
  on update restrict
  on delete restrict;

-- The ledger and receipts are still closed to direct API writes.
-- This integrity constraint does not constitute a trusted battle executor.
comment on constraint rpg_battle_receipts_full_outcome_fk
  on platform.rpg_battle_receipts is
  'Receipt defeated monster list and status must exactly match the execution record; issuance remains blocked.';

commit;
