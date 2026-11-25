-- Correct the Star Key runtime category to match the canonical Git catalog.
-- Tarot is a separate future app and must not be included in Star Key taxonomy.

update public.ref_apps
set
  category = '西洋占星',
  updated_at = now()
where app_id = 'star-key'
  and category is distinct from '西洋占星';

update public.apps
set
  category = '西洋占星',
  updated_at = now()
where id = 'star-key'
  and category is distinct from '西洋占星';
