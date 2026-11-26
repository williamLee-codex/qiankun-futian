begin;

-- G03-P1: a receipt must reference the exact recorded battle, character,
-- and encounter. This is a structural integrity check, NOT trusted issuance.
-- A future trusted writer must still prove the combat actually occurred.
alter table platform.rpg_battle_executions
  add constraint rpg_battle_executions_identity_unique
  unique (battle_id, character_id, encounter_id);

alter table platform.rpg_battle_receipts
  add constraint rpg_battle_receipts_execution_identity_fk
  foreign key (battle_id, character_id, encounter_id)
  references platform.rpg_battle_executions (battle_id, character_id, encounter_id)
  on update restrict
  on delete restrict;

-- Fail deployment rather than silently allowing orphan or mismatched receipts.
-- Existing receipt rows, if any, must already have matching ledger evidence.
comment on constraint rpg_battle_receipts_execution_identity_fk
  on platform.rpg_battle_receipts is
  'Receipt must reference matching durable battle execution identity. Does not by itself prove authoritative combat or enable issuance.';

commit;
