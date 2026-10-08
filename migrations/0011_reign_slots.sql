create table if not exists reign_slots (
  user_id text not null references "user" (id) on delete cascade,
  slot text not null,
  year integer not null,
  ruler_name text not null,
  realm_name text not null,
  lands integer not null,
  saved_at timestamptz not null default now(),
  state jsonb not null,
  primary key (user_id, slot)
);
