-- TAHT-I CİHAN production security: owner lock, bans, blocks, reports, audit, rate, replay, AI spend.

alter table profiles add column if not exists email text;
alter table profiles add column if not exists role text not null default 'player';
alter table profiles add column if not exists banned boolean not null default false;
alter table profiles add column if not exists banned_until timestamptz;
alter table profiles add column if not exists banned_reason text;
alter table profiles add column if not exists muted_until timestamptz;
alter table profiles add column if not exists mute_reason text;

create unique index if not exists profiles_single_owner
  on profiles (role)
  where role = 'owner';

create index if not exists profiles_email_idx on profiles (lower(email));

create table if not exists user_blocks (
  user_id         text not null,
  blocked_user_id text not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, blocked_user_id),
  check (user_id <> blocked_user_id)
);

create table if not exists reports (
  id             text primary key,
  reporter_id    text not null,
  target_user_id text not null,
  letter_id      text,
  envoy_id       text,
  reason         text not null default 'abuse',
  body           text,
  status         text not null default 'open',
  created_at     timestamptz not null default now()
);

create index if not exists reports_open_idx on reports (status, created_at desc);
create unique index if not exists reports_letter_dup
  on reports (reporter_id, letter_id)
  where letter_id is not null;

create table if not exists audit_log (
  id             text primary key,
  actor_id       text not null,
  actor_email    text,
  action         text not null,
  target_user_id text,
  scope          text not null,
  detail         jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create index if not exists audit_log_idx on audit_log (created_at desc);

create table if not exists rate_buckets (
  user_id      text not null,
  bucket       text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (user_id, bucket, window_start)
);

create table if not exists action_nonces (
  user_id    text not null,
  nonce      text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, nonce)
);

create index if not exists action_nonces_created_idx on action_nonces (created_at);

create table if not exists ai_usage (
  id         serial primary key,
  user_id    text not null,
  model      text not null,
  tokens_in  int not null default 0,
  tokens_out int not null default 0,
  cost_milli int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_idx on ai_usage (user_id, created_at desc);

create table if not exists duel_calls (
  duel_id    text not null,
  user_id    text not null,
  peer_id    text not null,
  tactic     text,
  created_at timestamptz not null default now(),
  primary key (duel_id, user_id)
);

create index if not exists duel_calls_duel_idx on duel_calls (duel_id);

-- Strip the first-signer-is-admin hole. Owner is granted only by verified email.
update profiles
set is_admin = false,
    role = 'player'
where role = 'owner' or is_admin = true;
