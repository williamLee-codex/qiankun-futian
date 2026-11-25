-- Taiwan birthplace precision for the shared platform profile.
-- The product intentionally exposes 20 county/city-level choices for Taiwan.
-- Hsinchu County + Hsinchu City and Chiayi County + Chiayi City are combined
-- product choices. Taiwan Main Island is retired before public launch.

update public.locations
set is_active = false, updated_at = now()
where country_code = 'TW'
  and external_id in (
    'TW-MAINLAND',
    'TW-HSQ', 'TW-HSZ',
    'TW-CYI', 'TW-CYQ'
  );

update public.locations
set is_active = true,
    display_name = case external_id
      when 'TW-CHA' then '彰化縣'
      when 'TW-HUA' then '花蓮縣'
      when 'TW-ILA' then '宜蘭縣'
      when 'TW-KEE' then '基隆市'
      when 'TW-KHH' then '高雄市'
      when 'TW-MIA' then '苗栗縣'
      when 'TW-NAN' then '南投縣'
      when 'TW-NWT' then '新北市'
      when 'TW-PIF' then '屏東縣'
      when 'TW-TAO' then '桃園市'
      when 'TW-TNN' then '台南市'
      when 'TW-TTT' then '台東縣'
      when 'TW-TXG' then '台中市'
      when 'TW-YUN' then '雲林縣'
      else display_name
    end,
    region = case external_id
      when 'TW-TNN' then '台南市'
      when 'TW-TTT' then '台東縣'
      when 'TW-TXG' then '台中市'
      else region
    end,
    updated_at = now()
where country_code = 'TW'
  and external_id in (
    'TW-CHA', 'TW-HUA', 'TW-ILA', 'TW-KEE', 'TW-KHH', 'TW-MIA', 'TW-NAN',
    'TW-NWT', 'TW-PIF', 'TW-TAO', 'TW-TNN', 'TW-TTT', 'TW-TXG', 'TW-YUN'
  );

update public.locations
set is_active = true,
    city = case external_id
      when 'TW-PENGHU' then 'Penghu County'
      when 'TW-KINMEN' then 'Kinmen County'
      when 'TW-MATSU' then 'Lienchiang County'
      else city
    end,
    region = case external_id
      when 'TW-PENGHU' then '澎湖縣'
      when 'TW-KINMEN' then '金門縣'
      when 'TW-MATSU' then '連江縣'
      else region
    end,
    display_name = case external_id
      when 'TW-PENGHU' then '澎湖縣'
      when 'TW-KINMEN' then '金門縣'
      when 'TW-MATSU' then '連江縣（馬祖）'
      else display_name
    end,
    updated_at = now()
where country_code = 'TW'
  and external_id in ('TW-PENGHU', 'TW-KINMEN', 'TW-MATSU');

insert into public.locations (
  id, country_code, region, city, display_name, timezone,
  latitude, longitude, source, external_id, is_active
)
select
  gen_random_uuid(), 'TW', '台北市', 'Taipei', '台北市', 'Asia/Taipei',
  25.0330, 121.5654, 'official-taiwan-cities', 'TW-TPE', true
where not exists (
  select 1 from public.locations where external_id = 'TW-TPE'
);

update public.locations
set region = '台北市',
    city = 'Taipei',
    display_name = '台北市',
    timezone = 'Asia/Taipei',
    latitude = 25.0330,
    longitude = 121.5654,
    source = 'official-taiwan-cities',
    is_active = true,
    updated_at = now()
where external_id = 'TW-TPE';

insert into public.locations (
  id, country_code, region, city, display_name, timezone,
  latitude, longitude, source, external_id, is_active
)
select
  gen_random_uuid(), 'TW', '新竹縣市', 'Hsinchu County/City', '新竹縣市', 'Asia/Taipei',
  24.8263, 120.9926, 'yuceluopan-canonical', 'TW-HSC', true
where not exists (
  select 1 from public.locations where external_id = 'TW-HSC'
);

update public.locations
set region = '新竹縣市',
    city = 'Hsinchu County/City',
    display_name = '新竹縣市',
    timezone = 'Asia/Taipei',
    latitude = 24.8263,
    longitude = 120.9926,
    source = 'yuceluopan-canonical',
    is_active = true,
    updated_at = now()
where external_id = 'TW-HSC';

insert into public.locations (
  id, country_code, region, city, display_name, timezone,
  latitude, longitude, source, external_id, is_active
)
select
  gen_random_uuid(), 'TW', '嘉義縣市', 'Chiayi County/City', '嘉義縣市', 'Asia/Taipei',
  23.4660, 120.3523, 'yuceluopan-canonical', 'TW-CYC', true
where not exists (
  select 1 from public.locations where external_id = 'TW-CYC'
);

update public.locations
set region = '嘉義縣市',
    city = 'Chiayi County/City',
    display_name = '嘉義縣市',
    timezone = 'Asia/Taipei',
    latitude = 23.4660,
    longitude = 120.3523,
    source = 'yuceluopan-canonical',
    is_active = true,
    updated_at = now()
where external_id = 'TW-CYC';
