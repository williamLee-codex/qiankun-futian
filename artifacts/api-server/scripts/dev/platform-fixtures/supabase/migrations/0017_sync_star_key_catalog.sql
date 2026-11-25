-- Keep the runtime apps mirror aligned with the canonical Git catalog entry
-- in src/lib/catalog/apps.ts. This migration is intentionally idempotent.

insert into public.ref_apps (
  app_id,
  display_name,
  category,
  sort_order,
  is_active
)
values (
  'star-key',
  '星穹密鑰',
  '占星塔羅',
  12,
  true
)
on conflict (app_id) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.apps (
  id,
  app_id,
  name,
  subtitle,
  description,
  category,
  status,
  launch_url,
  allows_gifted_credits,
  allow_gifted_points,
  required_consent_types,
  icon,
  color_theme,
  cost_type,
  base_cost,
  sort_order
)
values (
  'star-key',
  'star-key',
  '星穹密鑰',
  'Star Key',
  '以星象與個人出生資料為核心的個人化占星體驗，透過御策羅盤共享人物資料啟動。',
  '占星塔羅',
  'available',
  'https://star-tarot-key.replit.app',
  true,
  true,
  array['platform_terms', 'birth_profile'],
  'stars',
  'black-gold',
  'external',
  0,
  12
)
on conflict (id) do update set
  app_id = excluded.app_id,
  name = excluded.name,
  subtitle = excluded.subtitle,
  description = excluded.description,
  category = excluded.category,
  status = excluded.status,
  launch_url = excluded.launch_url,
  allows_gifted_credits = excluded.allows_gifted_credits,
  allow_gifted_points = excluded.allow_gifted_points,
  required_consent_types = excluded.required_consent_types,
  icon = excluded.icon,
  color_theme = excluded.color_theme,
  cost_type = excluded.cost_type,
  base_cost = excluded.base_cost,
  sort_order = excluded.sort_order,
  updated_at = now();
