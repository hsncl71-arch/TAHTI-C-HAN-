import type { WardrobeState } from "@/domains/types";

export const STORE_CURRENCY = ["TRY", "USD"] as const;
export type StoreCurrency = (typeof STORE_CURRENCY)[number];

export const STORE_PLATFORMS = ["ios", "android", "sandbox"] as const;
export type StorePlatform = (typeof STORE_PLATFORMS)[number];

export const STORE_KINDS = ["subscription", "cosmetic"] as const;
export type StoreKind = (typeof STORE_KINDS)[number];

export const STORE_SLOTS = ["robe", "palace", "banner"] as const;
export type CosmeticSlot = (typeof STORE_SLOTS)[number];

/** Visual / convenience grants only. Combat, gold, troops are forbidden by type. */
export const ENTITLEMENT_IDS = [
  "premium",
  "archive",
  "reports",
  "replay",
  "kaftan.night",
  "kaftan.crimson",
  "kaftan.ivory",
  "palace.night",
  "palace.dawn",
  "banner.tugh",
  "banner.hilal",
] as const;
export type EntitlementId = (typeof ENTITLEMENT_IDS)[number];

export const COSMETIC_GRANTS: readonly EntitlementId[] = [
  "kaftan.night",
  "kaftan.crimson",
  "kaftan.ivory",
  "palace.night",
  "palace.dawn",
  "banner.tugh",
  "banner.hilal",
];

export const PREMIUM_FEATURES: readonly EntitlementId[] = ["premium", "archive", "reports", "replay"];

export type SubscriptionPlan = "free" | "monthly" | "yearly";

export interface StoreProduct {
  sku: string;
  kind: StoreKind;
  /** Apple StoreKit product id (placeholder until App Store Connect). */
  appleProductId: string;
  /** Google Play Billing product id (placeholder until Play Console). */
  googleProductId: string;
  titleKey: string;
  bodyKey: string;
  /** Price in kuruş (1 ₺ = 100). */
  priceTry: number;
  /** Price in USD cents. */
  priceUsd: number;
  period: "month" | "year" | "once";
  grants: EntitlementId[];
  slot: CosmeticSlot | null;
  /** Always false — catalog compiler rejects combat effects. */
  affectsSimulation: false;
  active: boolean;
}

export interface EntitlementRow {
  grantId: EntitlementId;
  sku: string;
  expiresAt: number | null;
  status?: "active" | "cancelled" | "expired" | "grace" | "refunded" | "revoked";
  graceUntil?: number | null;
  originalTx?: string | null;
}

export interface Wallet {
  plan: SubscriptionPlan;
  premium: boolean;
  premiumUntil: number | null;
  status: "free" | "active" | "grace" | "cancelled" | "expired";
  graceUntil: number | null;
  grants: EntitlementId[];
  ownedSkus: string[];
  wardrobe: WardrobeState;
}

export interface CatalogItem extends StoreProduct {}

export interface PricePatch {
  sku: string;
  priceTry: number;
  priceUsd: number;
  active: boolean;
}

export interface PurchaseRecord {
  id: string;
  userId: string;
  sku: string;
  platform: StorePlatform;
  status: "pending" | "verified" | "failed" | "refunded" | "revoked" | "restored";
  transactionId: string | null;
  createdAt: string;
  verifiedAt: string | null;
}

export const DEFAULT_WARDROBE: WardrobeState = {
  robeId: "default",
  palaceId: "default",
  bannerId: "default",
};

export const MS_MONTH = 30 * 24 * 60 * 60 * 1000;
export const MS_YEAR = 365 * 24 * 60 * 60 * 1000;

export function isEntitlementId(value: string): value is EntitlementId {
  return (ENTITLEMENT_IDS as readonly string[]).includes(value);
}

export function isCosmeticSlot(value: string): value is CosmeticSlot {
  return (STORE_SLOTS as readonly string[]).includes(value);
}
