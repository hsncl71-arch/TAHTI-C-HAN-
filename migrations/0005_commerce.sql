-- TAHT-I CİHAN store: subscriptions + cosmetics. Never grants gold, troops or victory.

create table if not exists store_products (
  sku              text primary key,
  kind             text not null,
  apple_product_id text not null,
  google_product_id text not null,
  title_key        text not null,
  body_key         text not null,
  price_try        int not null,
  price_usd        int not null,
  period           text not null,
  grants           jsonb not null default '[]',
  slot             text,
  affects_simulation boolean not null default false,
  active           boolean not null default true,
  updated_at       timestamptz not null default now()
);

create table if not exists store_price_history (
  id         serial primary key,
  sku        text not null,
  admin_id   text not null,
  price_try  int not null,
  price_usd  int not null,
  active     boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists store_purchases (
  id              text primary key,
  user_id         text not null,
  sku             text not null,
  platform        text not null,
  status          text not null default 'pending',
  receipt_hash    text,
  transaction_id  text,
  payload         jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  verified_at     timestamptz
);

create unique index if not exists store_purchases_tx_idx
  on store_purchases (transaction_id)
  where transaction_id is not null;

create index if not exists store_purchases_user_idx on store_purchases (user_id, created_at desc);

create table if not exists store_entitlements (
  id         text primary key,
  user_id    text not null,
  grant_id   text not null,
  sku        text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists store_entitlements_user_idx on store_entitlements (user_id, grant_id);

insert into store_products (
  sku, kind, apple_product_id, google_product_id, title_key, body_key,
  price_try, price_usd, period, grants, slot, affects_simulation, active
) values
  ('cihan.premium.monthly', 'subscription', 'com.tahticihan.premium.monthly', 'cihan_premium_monthly',
   'shop.sku.premium.monthly.title', 'shop.sku.premium.monthly.body', 14900, 499, 'month',
   '["premium","archive","reports","replay"]'::jsonb, null, false, true),
  ('cihan.premium.yearly', 'subscription', 'com.tahticihan.premium.yearly', 'cihan_premium_yearly',
   'shop.sku.premium.yearly.title', 'shop.sku.premium.yearly.body', 119000, 3999, 'year',
   '["premium","archive","reports","replay"]'::jsonb, null, false, true),
  ('cihan.cosmetic.kaftan.night', 'cosmetic', 'com.tahticihan.kaftan.night', 'cihan_kaftan_night',
   'shop.sku.kaftan.night.title', 'shop.sku.kaftan.night.body', 8900, 299, 'once',
   '["kaftan.night"]'::jsonb, 'robe', false, true),
  ('cihan.cosmetic.kaftan.crimson', 'cosmetic', 'com.tahticihan.kaftan.crimson', 'cihan_kaftan_crimson',
   'shop.sku.kaftan.crimson.title', 'shop.sku.kaftan.crimson.body', 8900, 299, 'once',
   '["kaftan.crimson"]'::jsonb, 'robe', false, true),
  ('cihan.cosmetic.kaftan.ivory', 'cosmetic', 'com.tahticihan.kaftan.ivory', 'cihan_kaftan_ivory',
   'shop.sku.kaftan.ivory.title', 'shop.sku.kaftan.ivory.body', 7900, 249, 'once',
   '["kaftan.ivory"]'::jsonb, 'robe', false, true),
  ('cihan.cosmetic.palace.night', 'cosmetic', 'com.tahticihan.palace.night', 'cihan_palace_night',
   'shop.sku.palace.night.title', 'shop.sku.palace.night.body', 12900, 399, 'once',
   '["palace.night"]'::jsonb, 'palace', false, true),
  ('cihan.cosmetic.palace.dawn', 'cosmetic', 'com.tahticihan.palace.dawn', 'cihan_palace_dawn',
   'shop.sku.palace.dawn.title', 'shop.sku.palace.dawn.body', 12900, 399, 'once',
   '["palace.dawn"]'::jsonb, 'palace', false, true),
  ('cihan.cosmetic.banner.tugh', 'cosmetic', 'com.tahticihan.banner.tugh', 'cihan_banner_tugh',
   'shop.sku.banner.tugh.title', 'shop.sku.banner.tugh.body', 5900, 199, 'once',
   '["banner.tugh"]'::jsonb, 'banner', false, true),
  ('cihan.cosmetic.banner.hilal', 'cosmetic', 'com.tahticihan.banner.hilal', 'cihan_banner_hilal',
   'shop.sku.banner.hilal.title', 'shop.sku.banner.hilal.body', 5900, 199, 'once',
   '["banner.hilal"]'::jsonb, 'banner', false, true)
on conflict (sku) do nothing;
