import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nid } from "@/domains/ids";
import { migrateState } from "@/domains/palace/migrate";
import type { GameState } from "@/domains/types";
import { DEFAULT_CATALOG, mergeCatalog, productBySku } from "@/domains/commerce/catalog";
import { grantsForSku, resolveWallet } from "@/domains/commerce/entitlements";
import { assertNotPayToWin } from "@/domains/commerce/fairness";
import type { CosmeticSlot, EntitlementId, EntitlementRow, StorePlatform, StoreProduct, Wallet } from "@/domains/commerce/model";
import { isCosmeticSlot, isEntitlementId } from "@/domains/commerce/model";
import { signSandboxReceipt } from "@/domains/commerce/verify";
import { verifyReceiptResolved } from "@/domains/commerce/live";
import { ensureWardrobe, equipWardrobe } from "@/domains/commerce/wardrobe";
import { applyBillingEvent, rowsFromVerifiedPurchases, type BillingEventKind } from "@/domains/commerce/lifecycle";
import { requireOwner, writeAudit, takeRate, assertNotBanned } from "@/server/security/guard";

type Sql = Awaited<ReturnType<typeof getSql>>;

async function requireAdmin(userId: string) {
  const { sql } = await requireOwner(userId);
  return sql;
}

async function ensureCatalog(sql: Sql): Promise<void> {
  for (const p of DEFAULT_CATALOG) {
    await sql`
      insert into store_products (
        sku, kind, apple_product_id, google_product_id, title_key, body_key,
        price_try, price_usd, period, grants, slot, affects_simulation, active
      )
      values (
        ${p.sku}, ${p.kind}, ${p.appleProductId}, ${p.googleProductId}, ${p.titleKey}, ${p.bodyKey},
        ${p.priceTry}, ${p.priceUsd}, ${p.period}, ${JSON.stringify(p.grants)}::jsonb, ${p.slot},
        false, ${p.active}
      )
      on conflict (sku) do nothing
    `;
  }
}

function asMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

async function loadProducts(sql: Sql): Promise<StoreProduct[]> {
  await ensureCatalog(sql);
  const rows = await sql<{
    sku: string;
    price_try: number;
    price_usd: number;
    active: boolean;
  }>`select sku, price_try, price_usd, active from store_products`;
  return mergeCatalog(
    rows.map((r) => ({
      sku: r.sku,
      priceTry: Number(r.price_try),
      priceUsd: Number(r.price_usd),
      active: Boolean(r.active),
    })),
  );
}

async function loadRows(sql: Sql, userId: string): Promise<EntitlementRow[]> {
  const rows = await sql<{
    grant_id: string;
    sku: string;
    expires_at: string | null;
    status: string | null;
    grace_until: string | null;
  }>`
    select grant_id, sku, expires_at::text as expires_at, status, grace_until::text as grace_until
    from store_entitlements
    where user_id = ${userId}
  `.catch(async () =>
    sql<{ grant_id: string; sku: string; expires_at: string | null }>`
      select grant_id, sku, expires_at::text as expires_at
      from store_entitlements
      where user_id = ${userId}
    `.then((r) => r.map((x) => ({ ...x, status: "active", grace_until: null }))),
  );
  return rows
    .filter((r) => isEntitlementId(r.grant_id))
    .map((r) => ({
      grantId: r.grant_id as EntitlementId,
      sku: r.sku,
      expiresAt: asMs(r.expires_at),
      status: (r.status as EntitlementRow["status"]) ?? "active",
      graceUntil: asMs(r.grace_until),
    }));
}

async function loadCampaignState(sql: Sql, userId: string): Promise<{ id: string; state: GameState } | null> {
  const rows = await sql<{ id: string; state: GameState }>`
    select id, state from campaigns where user_id = ${userId} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const raw = typeof row.state === "string" ? (JSON.parse(row.state) as GameState) : row.state;
  return { id: row.id, state: ensureWardrobe(migrateState(raw)) };
}

async function saveWardrobe(sql: Sql, userId: string, campaignId: string, state: GameState): Promise<void> {
  await sql`
    update campaigns
    set state = ${JSON.stringify(state)}::jsonb, updated_at = now()
    where id = ${campaignId} and user_id = ${userId}
  `;
}

async function walletFor(sql: Sql, userId: string, now = Date.now()): Promise<Wallet> {
  const camp = await loadCampaignState(sql, userId);
  const rows = await loadRows(sql, userId);
  return resolveWallet(rows, camp?.state.wardrobe, now);
}

export const getStorefront = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const catalog = await loadProducts(sql);
    const wallet = await walletFor(sql, context.userId);
    return { catalog, wallet };
  });

export const getWallet = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return walletFor(sql, context.userId);
  });

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const sku = String((input as { sku?: string })?.sku ?? "");
    const platform = String((input as { platform?: string })?.platform ?? "sandbox") as StorePlatform;
    return { sku, platform: platform === "ios" || platform === "android" ? platform : "sandbox" };
  })
  .handler(async ({ context, data }) => {
    await assertNotBanned(context.userId);
    await takeRate(context.userId, "checkout");
    const sql = await getSql();
    const catalog = await loadProducts(sql);
    const product = catalog.find((p) => p.sku === data.sku && p.active);
    if (!product) throw new Error("unknown_product");
    assertNotPayToWin(product);
    const id = nid("buy");
    const nonce = nid("n").slice(-8);
    const iat = Date.now();
    const receipt = signSandboxReceipt({ productId: product.sku, userId: context.userId, nonce, iat });
    await sql`
      insert into store_purchases (id, user_id, sku, platform, status, payload)
      values (
        ${id}, ${context.userId}, ${product.sku}, ${data.platform}, ${"pending"},
        ${JSON.stringify({ nonce, iat, apple: product.appleProductId, google: product.googleProductId })}::jsonb
      )
    `;
    return {
      purchaseId: id,
      sku: product.sku,
      platform: data.platform,
      appleProductId: product.appleProductId,
      googleProductId: product.googleProductId,
      sandboxReceipt: data.platform === "sandbox" ? receipt : null,
    };
  });

export const confirmPurchase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { purchaseId?: string; platform?: string; productId?: string; receipt?: string };
    const platform = i.platform === "ios" || i.platform === "android" ? i.platform : "sandbox";
    return {
      purchaseId: String(i.purchaseId ?? ""),
      platform: platform as StorePlatform,
      productId: String(i.productId ?? ""),
      receipt: String(i.receipt ?? ""),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const pending = await sql<{ id: string; sku: string; status: string; platform: string }>`
      select id, sku, status, platform from store_purchases
      where id = ${data.purchaseId} and user_id = ${context.userId}
      limit 1
    `;
    const row = pending[0];
    if (!row) throw new Error("unknown_purchase");
    if (row.status === "verified") {
      return { ok: true as const, already: true, wallet: await walletFor(sql, context.userId) };
    }
    const productId = data.productId || row.sku;
    const platform = row.platform === "ios" || row.platform === "android" ? row.platform : data.platform;
    const verified = await verifyReceiptResolved(
      { platform, productId, receipt: data.receipt, userId: context.userId },
      Date.now(),
    );
    if (!verified.ok) {
      await sql`
        update store_purchases set status = ${"failed"}
        where id = ${row.id}
      `;
      throw new Error(verified.reason);
    }
    if (verified.productId !== row.sku && productBySku(verified.productId)?.sku !== row.sku) {
      await sql`update store_purchases set status = ${"failed"} where id = ${row.id}`;
      throw new Error("product_mismatch");
    }
    const product = productBySku(verified.productId);
    if (!product) throw new Error("unknown_product");
    assertNotPayToWin(product);
    const hash = createHash("sha256").update(data.receipt).digest("hex");
    const dup = await sql<{ id: string }>`
      select id from store_purchases where receipt_hash = ${hash} and status = ${"verified"} limit 1
    `;
    if (dup[0]) throw new Error("receipt_replay");
    const now = Date.now();
    try {
      await sql`
        update store_purchases
        set status = ${"verified"},
            receipt_hash = ${hash},
            transaction_id = ${verified.transactionId},
            verified_at = now()
        where id = ${row.id} and user_id = ${context.userId}
      `;
    } catch {
      throw new Error("receipt_replay");
    }
    const grants = grantsForSku(product.sku, now);
    for (const g of grants) {
      const eid = nid("ent");
      if (g.expiresAt) {
        const exp = new Date(g.expiresAt).toISOString();
        await sql`
          insert into store_entitlements (id, user_id, grant_id, sku, expires_at, status)
          values (${eid}, ${context.userId}, ${g.grantId}, ${g.sku}, ${exp}::timestamptz, ${"active"})
        `;
      } else {
        await sql`
          insert into store_entitlements (id, user_id, grant_id, sku, expires_at, status)
          values (${eid}, ${context.userId}, ${g.grantId}, ${g.sku}, null, ${"active"})
        `;
      }
    }
    await sql`
      insert into admin_log (user_id, action, detail)
      values (${context.userId}, ${"purchase"}, ${product.sku})
    `;
    return { ok: true as const, already: false, wallet: await walletFor(sql, context.userId) };
  });

export const cancelCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { purchaseId?: string; reason?: string };
    return { purchaseId: String(i.purchaseId ?? "").slice(0, 64), reason: String(i.reason ?? "cancelled").slice(0, 32) };
  })
  .handler(async ({ context, data }) => {
    await assertNotBanned(context.userId);
    const sql = await getSql();
    const status = data.reason === "failed" ? "failed" : "cancelled";
    await sql`
      update store_purchases
      set status = ${status}
      where id = ${data.purchaseId} and user_id = ${context.userId} and status = ${"pending"}
    `;
    return { ok: true as const };
  });

export const equipCosmetic = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { slot?: string; itemId?: string };
    if (!isCosmeticSlot(String(i.slot))) throw new Error("bad_slot");
    return { slot: i.slot as CosmeticSlot, itemId: String(i.itemId ?? "default") };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const camp = await loadCampaignState(sql, context.userId);
    if (!camp) throw new Error("no_campaign");
    const wallet = await walletFor(sql, context.userId);
    const { canEquip } = await import("@/domains/commerce/entitlements");
    if (!canEquip(wallet, data.slot, data.itemId)) throw new Error("not_owned");
    const next = equipWardrobe(camp.state, data.slot, data.itemId);
    await saveWardrobe(sql, context.userId, camp.id, next);
    return { state: next, wallet: { ...wallet, wardrobe: next.wardrobe } };
  });

export const listStoreAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await requireAdmin(context.userId);
    const catalog = await loadProducts(sql);
    const purchases = await sql<{
      id: string;
      user_id: string;
      sku: string;
      platform: string;
      status: string;
      transaction_id: string | null;
      created_at: string;
    }>`
      select id, user_id, sku, platform, status, transaction_id, created_at::text as created_at
      from store_purchases
      order by created_at desc
      limit 60
    `;
    return { catalog, purchases };
  });

export const setProductPrice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { sku?: string; priceTry?: number; priceUsd?: number; active?: boolean };
    const sku = String(i.sku ?? "");
    const priceTry = Math.max(0, Math.round(Number(i.priceTry)));
    const priceUsd = Math.max(0, Math.round(Number(i.priceUsd)));
    if (!productBySku(sku)) throw new Error("unknown_product");
    if (!Number.isFinite(priceTry) || !Number.isFinite(priceUsd)) throw new Error("bad_price");
    return { sku, priceTry, priceUsd, active: i.active !== false };
  })
  .handler(async ({ context, data }) => {
    const sql = await requireAdmin(context.userId);
    await ensureCatalog(sql);
    await sql`
      update store_products
      set price_try = ${data.priceTry}, price_usd = ${data.priceUsd}, active = ${data.active}, updated_at = now()
      where sku = ${data.sku}
    `;
    await sql`
      insert into store_price_history (sku, admin_id, price_try, price_usd, active)
      values (${data.sku}, ${context.userId}, ${data.priceTry}, ${data.priceUsd}, ${data.active})
    `;
    await sql`
      insert into admin_log (user_id, action, detail)
      values (${context.userId}, ${"price"}, ${`${data.sku}:${data.priceTry}/${data.priceUsd}`})
    `;
    await writeAudit({
      actorId: context.userId,
      action: "price",
      scope: "packages",
      detail: { sku: data.sku, priceTry: data.priceTry, priceUsd: data.priceUsd, active: data.active },
    });
    const catalog = await loadProducts(sql);
    return { ok: true, catalog };
  });

export const restorePurchases = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { platform?: string; receipts?: { productId?: string; receipt?: string }[] };
    const platform: StorePlatform = i?.platform === "ios" || i?.platform === "android" ? i.platform : "sandbox";
    const receipts = Array.isArray(i?.receipts)
      ? i.receipts
          .map((r) => ({ productId: String(r.productId ?? ""), receipt: String(r.receipt ?? "") }))
          .filter((r) => r.receipt.length > 8)
          .slice(0, 20)
      : [];
    return { platform, receipts };
  })
  .handler(async ({ context, data }) => {
    await assertNotBanned(context.userId);
    await takeRate(context.userId, "checkout");
    const sql = await getSql();
    await ensureCatalog(sql);
    const now = Date.now();
    for (const rec of data.receipts) {
      const verified = await verifyReceiptResolved(
        { platform: data.platform, productId: rec.productId, receipt: rec.receipt, userId: context.userId },
        now,
      );
      if (!verified.ok) continue;
      const hash = createHash("sha256").update(rec.receipt).digest("hex");
      const dup = await sql<{ id: string }>`
        select id from store_purchases where receipt_hash = ${hash} and status in (${"verified"}, ${"restored"}) limit 1
      `;
      if (dup[0]) continue;
      const id = nid("buy");
      await sql`
        insert into store_purchases (id, user_id, sku, platform, status, receipt_hash, transaction_id, payload, verified_at)
        values (
          ${id}, ${context.userId}, ${verified.productId}, ${data.platform}, ${"restored"},
          ${hash}, ${verified.transactionId}, ${JSON.stringify({ restore: true })}::jsonb, now()
        )
        on conflict (id) do nothing
      `;
    }
    const purchases = await sql<{ sku: string; status: string }>`
      select sku, status from store_purchases
      where user_id = ${context.userId} and status in (${"verified"}, ${"restored"})
    `;
    const restored = rowsFromVerifiedPurchases(purchases, now);
    for (const g of restored) {
      const exists = await sql<{ id: string }>`
        select id from store_entitlements
        where user_id = ${context.userId} and grant_id = ${g.grantId} and sku = ${g.sku}
        limit 1
      `;
      if (exists[0]) continue;
      const eid = nid("ent");
      if (g.expiresAt) {
        const exp = new Date(g.expiresAt).toISOString();
        await sql`
          insert into store_entitlements (id, user_id, grant_id, sku, expires_at, status)
          values (${eid}, ${context.userId}, ${g.grantId}, ${g.sku}, ${exp}::timestamptz, ${"active"})
        `;
      } else {
        await sql`
          insert into store_entitlements (id, user_id, grant_id, sku, expires_at, status)
          values (${eid}, ${context.userId}, ${g.grantId}, ${g.sku}, null, ${"active"})
        `;
      }
    }
    await writeAudit({ actorId: context.userId, action: "restore", scope: "packages" });
    return { ok: true as const, wallet: await walletFor(sql, context.userId) };
  });

export const applyOwnerBillingEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { userId?: string; sku?: string; kind?: string };
    const kind = String(i.kind ?? "") as BillingEventKind;
    const kinds: BillingEventKind[] = ["renew", "cancel", "expire", "grace", "refund", "revoke", "restore"];
    if (!kinds.includes(kind)) throw new Error("bad_event");
    const sku = String(i.sku ?? "");
    if (!productBySku(sku)) throw new Error("unknown_product");
    return { userId: String(i.userId ?? "").slice(0, 80), sku, kind };
  })
  .handler(async ({ context, data }) => {
    const sql = await requireAdmin(context.userId);
    const rows = await sql<{ grant_id: string; sku: string; expires_at: string | null; status: string | null; grace_until: string | null }>`
      select grant_id, sku, expires_at::text as expires_at, status, grace_until::text as grace_until
      from store_entitlements where user_id = ${data.userId}
    `;
    const mapped = rows
      .filter((r) => isEntitlementId(r.grant_id))
      .map((r) => ({
        grantId: r.grant_id as EntitlementId,
        sku: r.sku,
        expiresAt: asMs(r.expires_at),
        status: (r.status as EntitlementRow["status"]) ?? "active",
        graceUntil: asMs(r.grace_until),
      }));
    const next = applyBillingEvent(mapped, { kind: data.kind, sku: data.sku, now: Date.now() });
    for (const g of next.filter((r) => r.sku === data.sku)) {
      const exp = g.expiresAt ? new Date(g.expiresAt).toISOString() : null;
      const grace = g.graceUntil ? new Date(g.graceUntil).toISOString() : null;
      await sql`
        update store_entitlements
        set status = ${g.status ?? "active"},
            expires_at = ${exp}::timestamptz,
            grace_until = ${grace}::timestamptz
        where user_id = ${data.userId} and sku = ${g.sku} and grant_id = ${g.grantId}
      `;
    }
    if (data.kind === "refund" || data.kind === "revoke") {
      await sql`
        update store_purchases set status = ${data.kind === "refund" ? "refunded" : "revoked"}
        where user_id = ${data.userId} and sku = ${data.sku} and status in (${"verified"}, ${"restored"})
      `;
    }
    await writeAudit({
      actorId: context.userId,
      action: `billing.${data.kind}`,
      scope: "packages",
      targetUserId: data.userId,
      detail: { sku: data.sku },
    });
    return { ok: true, wallet: await walletFor(sql, data.userId) };
  });

export async function readWallet(userId: string): Promise<Wallet> {
  const sql = await getSql();
  return walletFor(sql, userId);
}
