import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { appleApiReady, googlePlayApiReady, verifyReceiptResolved } from "@/domains/commerce/live";
import { applyBillingEvent } from "@/domains/commerce/lifecycle";
import { productBySku, productByStoreId } from "@/domains/commerce/catalog";
import { isEntitlementId } from "@/domains/commerce/model";

/**
 * App Store Server Notifications V2 / Play RTDN ingest.
 * Without Hasan's keys this answers 503 honestly — it does not fake a refund.
 */
async function handle(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  const url = new URL(request.url);
  const source = url.searchParams.get("source") ?? "apple";
  if (source === "apple" && !appleApiReady()) return json({ error: "apple_unconfigured" }, 503);
  if (source === "google" && !googlePlayApiReady()) return json({ error: "google_unconfigured" }, 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const sql = await getSql();
  if (source === "apple") {
    const signed = String(body.signedPayload ?? "");
    if (!signed.includes(".")) return json({ error: "bad_payload" }, 400);
    let notificationType = "";
    let originalTx = "";
    let productId = "";
    try {
      const payload = JSON.parse(Buffer.from(signed.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
        notificationType?: string;
        data?: { signedTransactionInfo?: string };
      };
      notificationType = String(payload.notificationType ?? "");
      const txJws = payload.data?.signedTransactionInfo ?? "";
      if (txJws) {
        const tx = JSON.parse(Buffer.from(txJws.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
          originalTransactionId?: string;
          productId?: string;
        };
        originalTx = String(tx.originalTransactionId ?? "");
        productId = String(tx.productId ?? "");
      }
    } catch {
      return json({ error: "bad_jws" }, 400);
    }
    const kind =
      notificationType === "REFUND" || notificationType === "REVOKE"
        ? "refund"
        : notificationType === "EXPIRED"
          ? "expire"
          : notificationType === "DID_CHANGE_RENEWAL_STATUS"
            ? "cancel"
            : null;
    if (!kind || !originalTx) return json({ ok: true, ignored: true });
    const product = productByStoreId("ios", productId) ?? productBySku(productId);
    if (!product) return json({ ok: true, ignored: true });
    const rows = await sql<{ user_id: string }>`
      select user_id from store_purchases
      where transaction_id = ${"ios_" + originalTx} or transaction_id like ${"ios_" + originalTx + "%"}
      limit 1
    `.catch(() => []);
    const userId = rows[0]?.user_id;
    if (!userId) return json({ ok: true, unmatched: true });
    await applyStoreEvent(sql, userId, product.sku, kind);
    return json({ ok: true });
  }

  const token = String(body.purchaseToken ?? body.token ?? "");
  const sku = String(body.sku ?? body.subscriptionId ?? "");
  if (!token || !sku) return json({ error: "bad_google" }, 400);
  const verified = await verifyReceiptResolved({
    platform: "android",
    productId: sku,
    receipt: token,
    userId: "notify",
  });
  if (!verified.ok) return json({ error: verified.reason }, 400);
  return json({ ok: true, note: "play_rtdn_needs_pubsub_binding" });
}

async function applyStoreEvent(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  sku: string,
  kind: "refund" | "expire" | "cancel",
) {
  const rows = await sql<{ grant_id: string; sku: string; expires_at: string | null; status: string | null; grace_until: string | null }>`
    select grant_id, sku, expires_at::text as expires_at, status, grace_until::text as grace_until
    from store_entitlements where user_id = ${userId} and sku = ${sku}
  `;
  const mapped = rows
    .filter((r) => isEntitlementId(r.grant_id))
    .map((r) => ({
      grantId: r.grant_id as import("@/domains/commerce/model").EntitlementId,
      sku: r.sku,
      expiresAt: r.expires_at ? Date.parse(r.expires_at) : null,
      status: (r.status as "active" | "cancelled" | "expired" | "grace" | "refunded") ?? "active",
      graceUntil: r.grace_until ? Date.parse(r.grace_until) : null,
    }));
  const next = applyBillingEvent(mapped, { kind, sku, now: Date.now() });
  for (const g of next) {
    const exp = g.expiresAt ? new Date(g.expiresAt).toISOString() : null;
    const grace = g.graceUntil ? new Date(g.graceUntil).toISOString() : null;
    await sql`
      update store_entitlements
      set status = ${g.status ?? "active"}, expires_at = ${exp}::timestamptz, grace_until = ${grace}::timestamptz
      where user_id = ${userId} and sku = ${g.sku} and grant_id = ${g.grantId}
    `;
  }
  if (kind === "refund") {
    await sql`
      update store_purchases set status = ${"refunded"}
      where user_id = ${userId} and sku = ${sku} and status in (${"verified"}, ${"restored"})
    `;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const handlePost = ({ request }: { request: Request }) => handle(request);

export const Route = createFileRoute("/api/store-notify")({
  server: { handlers: { POST: handlePost } },
});
