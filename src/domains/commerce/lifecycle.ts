import { grantsForSku } from "@/domains/commerce/entitlements";
import type { EntitlementRow } from "@/domains/commerce/model";

/** Apple billing-retry window. Play is typically 7 days; we keep the longer one. */
export const GRACE_MS = 16 * 24 * 60 * 60 * 1000;

export type GrantStatus = "active" | "cancelled" | "expired" | "grace" | "refunded" | "revoked";

export type WalletStatus = "free" | "active" | "grace" | "cancelled" | "expired";

export type BillingEventKind = "renew" | "cancel" | "expire" | "grace" | "refund" | "revoke" | "restore";

export interface BillingEvent {
  kind: BillingEventKind;
  sku: string;
  now: number;
}

export function isGrantLive(row: EntitlementRow, now: number): boolean {
  if (row.status === "refunded" || row.status === "revoked" || row.status === "expired") return false;
  if (row.expiresAt == null) return true;
  if (row.expiresAt > now) return true;
  const graceUntil = row.graceUntil ?? (row.status === "grace" ? row.expiresAt + GRACE_MS : null);
  return Boolean(graceUntil && graceUntil > now);
}

export function walletStatusOf(rows: EntitlementRow[], now: number): WalletStatus {
  const prem = rows.filter((r) => r.grantId === "premium");
  if (!prem.length) return "free";
  const live = prem.filter((r) => isGrantLive(r, now));
  if (!live.length) return "expired";
  if (live.some((r) => r.status === "refunded" || r.status === "revoked")) return "expired";
  if (live.some((r) => r.status === "cancelled" && (r.expiresAt ?? 0) > now)) return "cancelled";
  const inGrace = live.some((r) => {
    if (r.status === "grace") return true;
    if (r.expiresAt && r.expiresAt <= now && isGrantLive(r, now)) return true;
    return false;
  });
  if (inGrace) return "grace";
  return "active";
}

export function graceUntilOf(rows: EntitlementRow[], now: number): number | null {
  const live = rows.filter((r) => r.grantId === "premium" && isGrantLive(r, now));
  const times = live
    .map((r) => r.graceUntil ?? (r.expiresAt && r.expiresAt <= now ? r.expiresAt + GRACE_MS : null))
    .filter((n): n is number => typeof n === "number" && n > now);
  return times.length ? Math.max(...times) : null;
}

export function applyBillingEvent(rows: EntitlementRow[], event: BillingEvent): EntitlementRow[] {
  if (event.kind === "restore") {
    const existing = rows.filter((r) => r.sku === event.sku && r.status !== "refunded" && r.status !== "revoked");
    if (existing.length) {
      return rows.map((r) =>
        r.sku === event.sku && r.status !== "refunded" && r.status !== "revoked"
          ? { ...r, status: r.expiresAt && r.expiresAt <= event.now ? "grace" : "active", graceUntil: r.expiresAt && r.expiresAt <= event.now ? event.now + GRACE_MS : r.graceUntil ?? null }
          : r,
      );
    }
    return [...rows, ...grantsForSku(event.sku, event.now).map((g) => ({ ...g, status: "active" as const }))];
  }
  return rows.map((r) => {
    if (r.sku !== event.sku) return r;
    if (event.kind === "refund" || event.kind === "revoke") {
      return { ...r, status: event.kind === "refund" ? "refunded" : "revoked", expiresAt: event.now, graceUntil: null };
    }
    if (event.kind === "cancel") {
      return { ...r, status: "cancelled", graceUntil: null };
    }
    if (event.kind === "expire") {
      return { ...r, status: "expired", expiresAt: Math.min(r.expiresAt ?? event.now, event.now), graceUntil: null };
    }
    if (event.kind === "grace") {
      return { ...r, status: "grace", graceUntil: event.now + GRACE_MS };
    }
    if (event.kind === "renew") {
      const periodDays = /year|annual/i.test(r.sku) ? 365 : 30;
      const base = Math.max(r.expiresAt ?? event.now, event.now);
      return { ...r, status: "active", expiresAt: base + periodDays * 86_400_000, graceUntil: null };
    }
    return r;
  });
}

export function rowsFromVerifiedPurchases(
  purchases: { sku: string; status: string }[],
  now: number,
): EntitlementRow[] {
  const out: EntitlementRow[] = [];
  for (const p of purchases) {
    if (p.status === "refunded" || p.status === "revoked" || p.status === "failed") continue;
    if (p.status !== "verified" && p.status !== "restored") continue;
    out.push(...grantsForSku(p.sku, now).map((g) => ({ ...g, status: "active" as const })));
  }
  return out;
}
