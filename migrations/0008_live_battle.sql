-- Server-authoritative two-player field command.

create table if not exists live_matches (
  id                 text primary key,
  host_user_id       text not null,
  guest_user_id      text not null,
  host_seat          text not null default '',
  guest_seat         text not null default '',
  host_name          text not null default '',
  guest_name         text not null default '',
  province_id        text not null,
  status             text not null default 'open',
  host_ready         boolean not null default false,
  guest_ready        boolean not null default false,
  host_tactic        text,
  guest_tactic       text,
  host_connected_at  timestamptz not null default now(),
  guest_connected_at timestamptz not null default now(),
  seed               bigint not null,
  lock_at            timestamptz,
  winner_user_id     text,
  result             text,
  report             jsonb,
  forfeit_user_id    text,
  settle_key         text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (host_user_id <> guest_user_id)
);

create index if not exists live_matches_host_idx on live_matches (host_user_id, status, updated_at desc);
create index if not exists live_matches_guest_idx on live_matches (guest_user_id, status, updated_at desc);
create index if not exists live_matches_open_idx on live_matches (status, created_at desc);

create table if not exists live_match_actions (
  id         text primary key,
  match_id   text not null references live_matches(id) on delete cascade,
  user_id    text not null,
  seq        int not null,
  kind       text not null,
  nonce      text,
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (match_id, user_id, seq)
);

create unique index if not exists live_match_actions_nonce
  on live_match_actions (match_id, user_id, nonce)
  where nonce is not null;
