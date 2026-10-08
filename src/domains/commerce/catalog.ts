import type { EntitlementId, StoreProduct } from "@/domains/commerce/model";

/**
 * Placeholder store product ids — no live App Store / Play Console catalog yet.
 * Native shells map these 1:1 onto StoreKit and Google Play Billing.
 */
export const BUNDLE_APPLE = "com.tahticihan.app";
export const PACKAGE_GOOGLE = "com.tahticihan.app";

const COSMETIC = {
  kind: "cosmetic" as const,
  period: "once" as const,
  affectsSimulation: false as const,
  active: true,
};

export const DEFAULT_CATALOG: StoreProduct[] = [
  {
    sku: "cihan.premium.monthly",
    kind: "subscription",
    appleProductId: "com.tahticihan.premium.monthly",
    googleProductId: "cihan_premium_monthly",
    titleKey: "shop.sku.premium.monthly.title",
    bodyKey: "shop.sku.premium.monthly.body",
    priceTry: 14_900,
    priceUsd: 499,
    period: "month",
    grants: ["premium", "archive", "reports", "replay"],
    slot: null,
    affectsSimulation: false,
    active: true,
  },
  {
    sku: "cihan.premium.yearly",
    kind: "subscription",
    appleProductId: "com.tahticihan.premium.yearly",
    googleProductId: "cihan_premium_yearly",
    titleKey: "shop.sku.premium.yearly.title",
    bodyKey: "shop.sku.premium.yearly.body",
    priceTry: 119_000,
    priceUsd: 3_999,
    period: "year",
    grants: ["premium", "archive", "reports", "replay"],
    slot: null,
    affectsSimulation: false,
    active: true,
  },
  {
    sku: "cihan.cosmetic.kaftan.night",
    appleProductId: "com.tahticihan.kaftan.night",
    googleProductId: "cihan_kaftan_night",
    titleKey: "shop.sku.kaftan.night.title",
    bodyKey: "shop.sku.kaftan.night.body",
    priceTry: 8_900,
    priceUsd: 299,
    grants: ["kaftan.night"],
    slot: "robe",
    ...COSMETIC,
  },
  {
    sku: "cihan.cosmetic.kaftan.crimson",
    appleProductId: "com.tahticihan.kaftan.crimson",
    googleProductId: "cihan_kaftan_crimson",
    titleKey: "shop.sku.kaftan.crimson.title",
    bodyKey: "shop.sku.kaftan.crimson.body",
    priceTry: 8_900,
    priceUsd: 299,
    grants: ["kaftan.crimson"],
    slot: "robe",
    ...COSMETIC,
  },
  {
    sku: "cihan.cosmetic.kaftan.ivory",
    appleProductId: "com.tahticihan.kaftan.ivory",
    googleProductId: "cihan_kaftan_ivory",
    titleKey: "shop.sku.kaftan.ivory.title",
    bodyKey: "shop.sku.kaftan.ivory.body",
    priceTry: 7_900,
    priceUsd: 249,
    grants: ["kaftan.ivory"],
    slot: "robe",
    ...COSMETIC,
  },
  {
    sku: "cihan.cosmetic.palace.night",
    appleProductId: "com.tahticihan.palace.night",
    googleProductId: "cihan_palace_night",
    titleKey: "shop.sku.palace.night.title",
    bodyKey: "shop.sku.palace.night.body",
    priceTry: 12_900,
    priceUsd: 399,
    grants: ["palace.night"],
    slot: "palace",
    ...COSMETIC,
  },
  {
    sku: "cihan.cosmetic.palace.dawn",
    appleProductId: "com.tahticihan.palace.dawn",
    googleProductId: "cihan_palace_dawn",
    titleKey: "shop.sku.palace.dawn.title",
    bodyKey: "shop.sku.palace.dawn.body",
    priceTry: 12_900,
    priceUsd: 399,
    grants: ["palace.dawn"],
    slot: "palace",
    ...COSMETIC,
  },
  {
    sku: "cihan.cosmetic.banner.tugh",
    appleProductId: "com.tahticihan.banner.tugh",
    googleProductId: "cihan_banner_tugh",
    titleKey: "shop.sku.banner.tugh.title",
    bodyKey: "shop.sku.banner.tugh.body",
    priceTry: 5_900,
    priceUsd: 199,
    grants: ["banner.tugh"],
    slot: "banner",
    ...COSMETIC,
  },
  {
    sku: "cihan.cosmetic.banner.hilal",
    appleProductId: "com.tahticihan.banner.hilal",
    googleProductId: "cihan_banner_hilal",
    titleKey: "shop.sku.banner.hilal.title",
    bodyKey: "shop.sku.banner.hilal.body",
    priceTry: 5_900,
    priceUsd: 199,
    grants: ["banner.hilal"],
    slot: "banner",
    ...COSMETIC,
  },
];

export const DEFAULT_SKUS = DEFAULT_CATALOG.map((p) => p.sku);

export function productBySku(sku: string, catalog: StoreProduct[] = DEFAULT_CATALOG): StoreProduct | undefined {
  return catalog.find((p) => p.sku === sku);
}

export function productByStoreId(
  platform: "ios" | "android",
  storeId: string,
  catalog: StoreProduct[] = DEFAULT_CATALOG,
): StoreProduct | undefined {
  return catalog.find((p) => (platform === "ios" ? p.appleProductId === storeId : p.googleProductId === storeId));
}

export function grantOfSlot(slot: "robe" | "palace" | "banner", itemId: string): EntitlementId | null {
  if (itemId === "default") return null;
  const product = DEFAULT_CATALOG.find((p) => p.slot === slot && p.grants[0] === itemId);
  return (product?.grants[0] as EntitlementId | undefined) ?? (itemId as EntitlementId);
}

export function mergeCatalog(overrides: Partial<StoreProduct>[]): StoreProduct[] {
  const bySku = new Map(overrides.map((p) => [p.sku, p]));
  return DEFAULT_CATALOG.map((base) => {
    const patch = bySku.get(base.sku);
    if (!patch) return base;
    return {
      ...base,
      priceTry: typeof patch.priceTry === "number" ? Math.max(0, Math.round(patch.priceTry)) : base.priceTry,
      priceUsd: typeof patch.priceUsd === "number" ? Math.max(0, Math.round(patch.priceUsd)) : base.priceUsd,
      active: typeof patch.active === "boolean" ? patch.active : base.active,
    };
  });
}
