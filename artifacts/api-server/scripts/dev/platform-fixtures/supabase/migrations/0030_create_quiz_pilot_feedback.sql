create table if not exists public.quiz_pilot_feedback (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.quiz_attempts(id) on delete cascade,
  tester_hash text not null check (tester_hash ~ '^[0-9a-f]{64}$'),
  comprehension smallint not null check (comprehension between 1 and 5),
  self_fit smallint not null check (self_fit between 1 and 5),
  distinctiveness smallint not null check (distinctiveness between 1 and 5),
  question_confusion boolean not null,
  result_confusion boolean not null,
  feedback text null check (feedback is null or char_length(feedback) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists quiz_pilot_feedback_tester_hash_idx
  on public.quiz_pilot_feedback (tester_hash);
create index if not exists quiz_pilot_feedback_created_at_idx
  on public.quiz_pilot_feedback (created_at desc);

alter table public.quiz_pilot_feedback enable row level security;

revoke all on table public.quiz_pilot_feedback from anon, authenticated;
grant select, insert on table public.quiz_pilot_feedback to service_role;
