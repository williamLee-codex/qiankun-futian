BEGIN;

INSERT INTO public.ref_apps (
  app_id, display_name, category, supports_profile, supports_unlock,
  supports_gold, supports_crystal, sort_order, is_active
)
VALUES ('ziwei', '紫宸天策', 'ziwei', true, true, true, true, 40, true)
ON CONFLICT (app_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  supports_profile = true,
  supports_unlock = true,
  supports_gold = true,
  supports_crystal = true,
  is_active = true,
  updated_at = now();

COMMIT;
