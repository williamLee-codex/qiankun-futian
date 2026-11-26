begin;

-- G03-P1: receipts remain unavailable for issuance until a trusted
-- server-authoritative minting transaction is implemented and reviewed.
-- In particular, service_role must not be able to insert a forged victory
-- directly, even when called by a server endpoint.
revoke insert, update, delete, truncate, references, trigger
  on table platform.rpg_battle_receipts
  from public, anon, authenticated, service_role;

-- PostgreSQL table privileges and RLS are distinct controls.
-- Force RLS for the table owner as an additional defense-in-depth measure;
-- this does not constrain superusers or BYPASSRLS roles.
alter table platform.rpg_battle_receipts force row level security;

comment on table platform.rpg_battle_receipts is
  'G03-P1 issuance blocked: no API role may directly mint or alter a battle receipt. Trusted minting and atomic settlement are not installed.';

commit;
