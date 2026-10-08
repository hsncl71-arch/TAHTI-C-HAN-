-- TAHT-I CİHAN persistent world
-- Domain tables stay additive; campaign JSON is the live simulation snapshot.

create table if not exists profiles (
  user_id      text primary key,
  display_name text,
  locale       text not null default 'tr',
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists campaigns (
  id          text primary key,
  user_id     text not null unique,
  world_id    text not null default 'cihan',
  realm_name  text not null,
  ruler_name  text not null,
  year        int not null,
  status      text not null default 'active',
  state       jsonb not null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists campaigns_world_idx on campaigns (world_id);

create table if not exists world_presence (
  user_id     text primary key,
  campaign_id text not null,
  ruler_name  text not null,
  realm_name  text not null,
  year        int not null,
  last_seen   timestamptz not null default now()
);

create table if not exists envoys (
  id            text primary key,
  from_user_id  text not null,
  to_user_id    text not null,
  from_ruler    text not null,
  from_realm    text not null,
  kind          text not null,
  body          text not null,
  year          int not null,
  status        text not null default 'unread',
  created_at    timestamptz not null default now()
);

create index if not exists envoys_to_idx on envoys (to_user_id, created_at desc);
create index if not exists envoys_from_idx on envoys (from_user_id, created_at desc);

create table if not exists npc_counsel (
  id            serial primary key,
  user_id       text not null,
  advisor_role  text not null,
  question      text not null,
  answer        text not null,
  year          int not null,
  created_at    timestamptz not null default now()
);

create index if not exists npc_counsel_user_idx on npc_counsel (user_id, created_at desc);

create table if not exists admin_log (
  id         serial primary key,
  user_id    text not null,
  action     text not null,
  detail     text,
  created_at timestamptz not null default now()
);
