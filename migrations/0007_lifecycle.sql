-- Billing lifecycle + throne invites. No combat grants.

alter table store_purchases
  add column if not exists original_tx text;

create unique index if not exists store_purchases_receipt_hash_idx
  on store_purchases (receipt_hash)
  where receipt_hash is not null;

alter table store_entitlements
  add column if not exists status text not null default 'active';

alter table store_entitlements
  add column if not exists grace_until timestamptz;

alter table store_entitlements
  add column if not exists original_tx text;

create table if not exists world_invites (
  id            text primary key,
  token         text not null unique,
  from_user_id  text not null,
  from_seat     text not null,
  target_seat   text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  redeemed_by   text
);

create index if not exists world_invites_from_idx on world_invites (from_user_id, created_at desc);
