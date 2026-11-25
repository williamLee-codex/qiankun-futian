begin;

-- G03-P1: identity-only linkage is insufficient: a defeat execution must
-- never be represented by a victory receipt. Enforce the same outcome.
alter table platform.rpg_battle_executions
  add constraint rpg_battle_executions_identity_status_unique
  unique (battle_id, character_id, encounter_id, status);

alter table platform.rpg_battle_receipts
  add constraint rpg_battle_receipts_execution_outcome_fk
  foreign key (battle_id, character_id, encounter_id, status)
  references platform.rpg_battle_executions
    (battle_id, character_id, encounter_id, status)
  on update restrict
  on delete restrict;

-- This migration changes referential integrity only; it confers no new privileges.
-- Matching status is a database integrity guarantee, not proof of
-- trustworthy combat execution or permission to issue receipts.
comment on constraint rpg_battle_receipts_execution_outcome_fk
  on platform.rpg_battle_receipts is
  'Receipt outcome must match execution outcome; no authority to mint or settle is conferred.';

commit;
