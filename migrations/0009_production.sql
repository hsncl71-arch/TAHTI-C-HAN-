-- Production hardening: one active field per throne, device push tokens, outbox.

create unique index if not exists live_matches_host_active
  on live_matches (host_user_id)
  where status in ('open', 'lobby', 'live', 'resolving');

create unique index if not exists live_matches_guest_active
  on live_matches (guest_user_id)
  where status in ('open', 'lobby', 'live', 'resolving');

create table if not exists webrtc_peers (
  room      text not null,
  peer_id   text not null,
  name      text not null default '',
  last_seen timestamptz not null default now(),
  primary key (room, peer_id)
);

create table if not exists webrtc_signals (
  id         bigserial primary key,
  room       text not null,
  to_peer    text not null,
  from_peer  text not null,
  kind       text not null,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists webrtc_signals_inbox
  on webrtc_signals (room, to_peer, id);

create table if not exists device_tokens (
  id           text primary key,
  user_id      text not null,
  platform     text not null,
  token        text not null,
  locale       text not null default 'tr',
  last_seen    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists device_tokens_user_idx on device_tokens (user_id, last_seen desc);

create table if not exists push_outbox (
  id           text primary key,
  user_id      text not null,
  kind         text not null,
  title_key    text not null,
  body_key     text not null,
  vars         jsonb not null default '{}',
  route        text not null default '/oyun',
  status       text not null default 'queued',
  attempts     int not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);

create index if not exists push_outbox_due_idx
  on push_outbox (status, created_at)
  where status = 'queued';
