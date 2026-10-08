-- Unique entitlements; no duplicate grants on restore.

create unique index if not exists store_entitlements_user_grant_sku
  on store_entitlements (user_id, grant_id, sku);

create unique index if not exists store_purchases_receipt_hash
  on store_purchases (receipt_hash)
  where receipt_hash is not null;
