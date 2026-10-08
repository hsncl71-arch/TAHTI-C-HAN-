import type { WardrobeState } from "@/domains/types";
import { DEFAULT_CATALOG } from "@/domains/commerce/catalog";
import {
  COSMETIC_GRANTS,
  DEFAULT_WARDROBE,
  MS_MONTH,
  MS_YEAR,
  type CosmeticSlot,
  type EntitlementId,
  type EntitlementRow,
  type SubscriptionPlan,
  type Wallet,
} from "@/domains/commerce/model";
import { fillWardrobe } from "@/domains/commerce/wardrobe";
import { graceUntilOf, isGrantLive, walletStatusOf } from "@/domains/commerce/lifecycle";

export function periodMs(period: "month" | "year" | "once"): number | null {
  if (period === "month") return MS_MONTH;
  if (period === "year") return MS_YEAR;
  return null;
}

export function resolveWallet(rows: EntitlementRow[], wardrobe: WardrobeState | undefined, now: number): Wallet {
  const live = rows.filter((r) => isGrantLive(r, now));
  const grants = unique(live.map((r) => r.grantId));
  const ownedSkus = unique(live.map((r) => r.sku));
  const premium = grants.includes("premium");
  const premiumUntil = live
    .filter((r) => r.grantId === "premium" && r.expiresAt)
    .reduce((max, r) => Math.max(max, r.expiresAt ?? 0), 0);
  const yearly = live.some((r) => r.sku === "cihan.premium.yearly" && r.grantId === "premium");
  const monthly = live.some((r) => r.sku === "cihan.premium.monthly" && r.grantId === "premium");
  const plan: SubscriptionPlan = yearly ? "yearly" : monthly || premium ? "monthly" : "free";
  const effectiveGrants: EntitlementId[] = premium
    ? unique([...grants, "archive", "reports", "replay", ...COSMETIC_GRANTS])
    : grants;
  return {
    plan,
    premium,
    premiumUntil: premiumUntil || null,
    status: walletStatusOf(rows, now),
    graceUntil: graceUntilOf(rows, now),
    grants: effectiveGrants,
    ownedSkus,
    wardrobe: resolveEquipped(fillWardrobe(wardrobe), effectiveGrants),
  };
}

export function hasFeature(wallet: Wallet, grant: EntitlementId): boolean {
  return wallet.grants.includes(grant);
}

export function canEquip(wallet: Wallet, slot: CosmeticSlot, itemId: string): boolean {
  if (itemId === "default") return true;
  if (wallet.premium) return COSMETIC_GRANTS.includes(itemId as EntitlementId);
  return wallet.grants.includes(itemId as EntitlementId);
}

export function grantsForSku(sku: string, now: number): EntitlementRow[] {
  const product = DEFAULT_CATALOG.find((p) => p.sku === sku);
  if (!product) return [];
  const ttl = periodMs(product.period);
  const expiresAt = ttl ? now + ttl : null;
  return product.grants.map((grantId) => ({ grantId, sku, expiresAt }));
}

function resolveEquipped(wardrobe: WardrobeState, grants: EntitlementId[]): WardrobeState {
  const robe = wardrobe.robeId === "default" || grants.includes(wardrobe.robeId as EntitlementId) ? wardrobe.robeId : "default";
  const palace =
    wardrobe.palaceId === "default" || grants.includes(wardrobe.palaceId as EntitlementId) ? wardrobe.palaceId : "default";
  const banner =
    wardrobe.bannerId === "default" || grants.includes(wardrobe.bannerId as EntitlementId) ? wardrobe.bannerId : "default";
  return { robeId: robe, palaceId: palace, bannerId: banner };
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list)];
}

export function emptyWallet(wardrobe?: WardrobeState): Wallet {
  return {
    plan: "free",
    premium: false,
    premiumUntil: null,
    status: "free",
    graceUntil: null,
    grants: [],
    ownedSkus: [],
    wardrobe: fillWardrobe(wardrobe ?? DEFAULT_WARDROBE),
  };
}
