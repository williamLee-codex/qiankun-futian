-- Keep astrology taxonomy separate from the future standalone Tarot app.
-- Star Key and the Western Astrology placeholder are astrology-only entries.

update public.ref_apps
set
  category = '西洋占星',
  updated_at = now()
where app_id in ('star-key', 'western-astrology');

update public.apps
set
  category = '西洋占星',
  updated_at = now()
where id = 'star-key' or app_id = 'star-key';
