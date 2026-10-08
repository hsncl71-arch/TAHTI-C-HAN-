-- Shared world diplomacy: seats, bonds, offers, moderated letters.

create table if not exists world_seats (
  seat_id     text primary key,
  kind        text not null default 'ai',
  user_id     text,
  campaign_id text,
  ruler_name  text not null,
  realm_name  text not null,
  last_seen   timestamptz,
  claimed_at  timestamptz
);

create unique index if not exists world_seats_user_idx
  on world_seats (user_id)
  where user_id is not null;

create table if not exists world_relations (
  seat_a             text not null,
  seat_b             text not null,
  value              int not null default 0,
  treaty             text not null default 'peace',
  trade_pact         boolean not null default false,
  coalition_against  text,
  updated_at         timestamptz not null default now(),
  primary key (seat_a, seat_b),
  check (seat_a < seat_b)
);

create table if not exists dip_offers (
  id              text primary key,
  from_seat       text not null,
  to_seat         text not null,
  from_user_id    text,
  to_user_id      text,
  kind            text not null,
  tribute         int not null default 0,
  duration_years  int not null default 5,
  against_seat    text,
  note            text not null default '',
  status          text not null default 'pending',
  year            int not null,
  created_at      timestamptz not null default now()
);

create index if not exists dip_offers_to_idx on dip_offers (to_seat, status, created_at desc);
create index if not exists dip_offers_from_idx on dip_offers (from_seat, created_at desc);

create table if not exists dip_letters (
  id            text primary key,
  from_user_id  text not null,
  to_user_id    text not null,
  from_seat     text not null,
  to_seat       text not null,
  from_ruler    text not null,
  from_realm    text not null,
  body          text not null,
  year          int not null,
  status        text not null default 'sent',
  created_at    timestamptz not null default now()
);

create index if not exists dip_letters_to_idx on dip_letters (to_user_id, created_at desc);
create index if not exists dip_letters_from_idx on dip_letters (from_user_id, created_at desc);

create table if not exists dip_reports (
  id          text primary key,
  letter_id   text not null,
  user_id     text not null,
  reason      text not null default 'abuse',
  created_at  timestamptz not null default now()
);

create unique index if not exists dip_reports_unique on dip_reports (letter_id, user_id);
