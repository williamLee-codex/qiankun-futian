begin;

create table if not exists platform.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text not null default 'GENERAL'
    check (category in ('GENERAL', 'EVENT', 'MAINTENANCE', 'UPDATE')),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  pinned boolean not null default false,
  publish_at timestamptz null,
  expires_at timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_expiry_after_publish
    check (expires_at is null or publish_at is null or expires_at > publish_at)
);

create index if not exists announcements_public_order_idx
  on platform.announcements (status, pinned desc, publish_at desc);

create or replace view public.published_announcements as
select
  id,
  title,
  content,
  category,
  pinned,
  publish_at,
  expires_at
from platform.announcements
where status = 'PUBLISHED'
  and (publish_at is null or publish_at <= now())
  and (expires_at is null or expires_at > now());

grant select on public.published_announcements to anon, authenticated;

commit;