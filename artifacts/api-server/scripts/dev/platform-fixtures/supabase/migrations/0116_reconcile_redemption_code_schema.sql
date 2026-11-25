begin;

alter table platform.redemption_codes
  add column if not exists code_hash text,
  add column if not exists code_hint text,
  add column if not exists currency text not null default 'coin',
  add column if not exists amount integer not null default 1,
  add column if not exists is_recharge boolean not null default false,
  add column if not exists max_uses integer not null default 1,
  add column if not exists used_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update platform.redemption_codes
set code_hash = encode(sha256(code::bytea), 'hex'),
    code_hint = right(code, 4),
    amount = coalesce((metadata->>'amount')::integer, 1),
    currency = coalesce(metadata->>'currency', 'coin'),
    is_recharge = coalesce((metadata->>'is_recharge')::boolean, false),
    max_uses = coalesce(max_redemptions, 1)
where code_hash is null;

create unique index if not exists redemption_codes_code_hash_key
  on platform.redemption_codes(code_hash);

commit;
