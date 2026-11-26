-- Tarot Miyu: retire the legacy client-supplied-card quota RPC.
-- The legacy function accepts caller-provided draws without a saved draw_id.
-- Restrict it to its owner (migration/maintenance) and require application
-- code to call tarot_miyu_consume_saved_draw instead.
-- Candidate migration: validate in isolated test project before production.
BEGIN;
REVOKE ALL ON FUNCTION public.tarot_miyu_consume_quota(uuid,uuid,uuid,text,text,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
