import type { GameState } from "@/domains/types";
import { DEFAULT_CATALOG } from "@/domains/commerce/catalog";
import type { StoreProduct } from "@/domains/commerce/model";

const FORBIDDEN_SKU = /(gold|akce|troop|ordu|win|victory|boost|cheat|power|morale|ulufe)/i;
const FORBIDDEN_GRANT = /^(gold|troops|morale|combat|treasury|prestige|win|power)/i;

export function assertNotPayToWin(product: StoreProduct): void {
  if (product.affectsSimulation !== false) {
    throw new Error("pay_to_win_forbidden");
  }
  if (product.kind !== "subscription" && product.kind !== "cosmetic") {
    throw new Error("pay_to_win_forbidden");
  }
  if (FORBIDDEN_SKU.test(product.sku) || FORBIDDEN_SKU.test(product.appleProductId) || FORBIDDEN_SKU.test(product.googleProductId)) {
    throw new Error("pay_to_win_forbidden");
  }
  for (const grant of product.grants) {
    if (FORBIDDEN_GRANT.test(grant)) throw new Error("pay_to_win_forbidden");
  }
}

export function assertCatalogFair(catalog: StoreProduct[] = DEFAULT_CATALOG): void {
  if (catalog.length === 0) throw new Error("empty_catalog");
  for (const product of catalog) assertNotPayToWin(product);
}

/** Simulation fields real money must never touch. */
export function combatFingerprint(s: GameState): string {
  return JSON.stringify({
    year: s.year,
    treasury: s.treasury,
    prestige: s.prestige,
    piety: s.piety,
    stability: s.stability,
    taxRate: s.taxRate,
    army: s.army,
    campaign: s.campaign,
    siege: s.siege
      ? {
          outcome: s.siege.outcome,
          atk: s.siege.atkPower,
          def: s.siege.defPower,
          provinceId: s.siege.provinceId,
        }
      : null,
    provinces: s.provinces.map((p) => ({
      id: p.id,
      ownerId: p.ownerId,
      loyalty: p.loyalty,
      manpower: p.manpower,
    })),
  });
}
