-- 24/7 persistent world: clock, event jobs, notices, campaign wake index.

create table if not exists world_clock (
  world_id      text primary key,
  epoch_ms      bigint not null,
  ms_per_year   int not null default 90000,
  last_sweep_at timestamptz not null default now()
);

insert into world_clock (world_id, epoch_ms, ms_per_year)
values ('cihan', 0, 90000)
on conflict (world_id) do nothing;

alter table campaigns add column if not exists last_sim_at timestamptz;
alter table campaigns add column if not exists paused boolean not null default false;
alter table campaigns add column if not exists pause_reason text;

update campaigns set last_sim_at = coalesce(last_sim_at, updated_at, now()) where last_sim_at is null;

create index if not exists campaigns_due_idx
  on campaigns (status, last_sim_at)
  where status = 'active';

create table if not exists world_jobs (
  id           text primary key,
  world_id     text not null default 'cihan',
  campaign_id  text,
  user_id      text,
  kind         text not null,
  due_at       timestamptz not null,
  payload      jsonb not null default '{}',
  status       text not null default 'queued',
  attempts     int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists world_jobs_due_idx
  on world_jobs (status, due_at)
  where status = 'queued';

create table if not exists world_notices (
  id           text primary key,
  user_id      text not null,
  campaign_id  text,
  kind         text not null,
  severity     text not null default 'info',
  title_key    text not null,
  body_key     text not null,
  vars         jsonb not null default '{}',
  year         int not null,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists world_notices_user_idx
  on world_notices (user_id, created_at desc);
