begin;

-- G03-P1 fail-closed transition. The existing gameplay EXP and DUN007
-- functions accept caller assertions without an authoritative battle receipt.
-- Do not edit historical migrations: remove their callable privilege until
-- receipt-bound replacements are implemented and verified.
revoke execute on function platform.settle_rpg_gameplay_experience(uuid, text, text, bigint, text)
  from public, anon, authenticated, service_role;
revoke execute on function platform.settle_rpg_dun007_progress(uuid, text)
  from public, anon, authenticated, service_role;

comment on function platform.settle_rpg_gameplay_experience(uuid, text, text, bigint, text) is
  'G03-P1 BLOCKED: unverified gameplay EXP settlement; do not grant EXECUTE before receipt-bound replacement.';
comment on function platform.settle_rpg_dun007_progress(uuid, text) is
  'G03-P1 BLOCKED: unverified DUN007 settlement; do not grant EXECUTE before receipt-bound replacement.';

commit;
