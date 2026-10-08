/**
 * Live App Store / Play verification. Runs only when Hasan's credentials
 * are in env. Never grants from an unsigned production token.
 */
import { SignJWT, importPKCS8 } from "jose";
import { BUNDLE_APPLE, PACKAGE_GOOGLE, productBySku, productByStoreId } from "./catalog.ts";
import { assertNotPayToWin } from "./fairness.ts";
import type { VerifyInput, VerifyResult } from "./verify.ts";
import { verifyReceipt } from "./verify.ts";

export function appleApiReady(): boolean {
  return Boolean(
    process.env.APPLE_ISSUER_ID?.trim() && process.env.APPLE_KEY_ID?.trim() && process.env.APPLE_PRIVATE_KEY?.trim(),
  );
}

export function googlePlayApiReady(): boolean {
  return Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT?.trim());
}

export async function verifyReceiptResolved(input: VerifyInput, now = Date.now()): Promise<VerifyResult> {
  const first = verifyReceipt(input, now);
  if (first.ok) return first;
  if (first.reason === "apple_jws_verify_unconfigured") return verifyAppleLive(input, now);
  if (first.reason === "google_play_api_unconfigured") return verifyGoogleLive(input, now);
  return first;
}

function fail(reason: string): VerifyResult {
  return { ok: false, reason };
}

async function appleJwt(): Promise<string | null> {
  const iss = process.env.APPLE_ISSUER_ID?.trim();
  const kid = process.env.APPLE_KEY_ID?.trim();
  const pem = (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  if (!iss || !kid || !pem) return null;
  try {
    const key = await importPKCS8(pem, "ES256");
    return await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
      .setIssuer(iss)
      .setIssuedAt()
      .setExpirationTime("20m")
      .setAudience("appstoreconnect-v1")
      .sign(key);
  } catch {
    return null;
  }
}

async function verifyAppleLive(input: VerifyInput, now: number): Promise<VerifyResult> {
  const jwt = await appleJwt();
  if (!jwt) return fail("apple_credentials_required");
  const parts = input.receipt.split(".");
  if (parts.length !== 3) return fail("bad_jws");
  let tx = "";
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
      transactionId?: string;
      originalTransactionId?: string;
      productId?: string;
    };
    tx = String(payload.transactionId ?? payload.originalTransactionId ?? "");
  } catch {
    return fail("bad_jws");
  }
  if (!tx) return fail("missing_transaction");
  const urls = [
    `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${encodeURIComponent(tx)}`,
    `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${encodeURIComponent(tx)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${jwt}` } });
      if (res.status === 404) continue;
      if (!res.ok) return fail(`apple_api_${res.status}`);
      const body = (await res.json()) as { signedTransactionInfo?: string };
      const jws = body.signedTransactionInfo;
      if (!jws) return fail("apple_empty_transaction");
      const info = JSON.parse(Buffer.from(jws.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
        productId?: string;
        bundleId?: string;
        transactionId?: string;
        expiresDate?: number | string;
      };
      if (info.bundleId && info.bundleId !== BUNDLE_APPLE) return fail("bundle_mismatch");
      const storeId = String(info.productId ?? "");
      const product = productByStoreId("ios", storeId) ?? productBySku(input.productId);
      if (!product || !product.active) return fail("unknown_product");
      try {
        assertNotPayToWin(product);
      } catch {
        return fail("pay_to_win_forbidden");
      }
      const expRaw = info.expiresDate;
      const exp = typeof expRaw === "string" ? Number(expRaw) : typeof expRaw === "number" ? expRaw : NaN;
      return {
        ok: true,
        productId: product.sku,
        transactionId: `ios_${info.transactionId ?? tx}`,
        expiresHint: Number.isFinite(exp) && exp > now ? exp : product.period === "once" ? null : now + (product.period === "year" ? 365 : 30) * 86400_000,
      };
    } catch {
      continue;
    }
  }
  return fail("apple_transaction_not_found");
}

type GoogleSa = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
  project_id?: string;
};

function googleSa(): GoogleSa | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GoogleSa;
  } catch {
    return null;
  }
}

async function googleAccessToken(): Promise<string | null> {
  const sa = googleSa();
  if (!sa?.client_email || !sa.private_key) return null;
  try {
    const key = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");
    const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/androidpublisher",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(sa.client_email)
      .setAudience(sa.token_uri || "https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string };
    return body.access_token ?? null;
  } catch {
    return null;
  }
}

async function verifyGoogleLive(input: VerifyInput, now: number): Promise<VerifyResult> {
  const token = await googleAccessToken();
  if (!token) return fail("google_credentials_required");
  const product = productByStoreId("android", input.productId) ?? productBySku(input.productId);
  if (!product || !product.active) return fail("unknown_product");
  try {
    assertNotPayToWin(product);
  } catch {
    return fail("pay_to_win_forbidden");
  }
  const pkg = PACKAGE_GOOGLE;
  const sku = product.googleProductId;
  const purchaseToken = encodeURIComponent(input.receipt);
  const kind = product.kind === "subscription" ? "subscriptions" : "products";
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/${kind}/${sku}/tokens/${purchaseToken}`;
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return fail(`google_api_${res.status}`);
    const body = (await res.json()) as {
      purchaseState?: number;
      expiryTimeMillis?: string;
      paymentState?: number;
      acknowledgementState?: number;
    };
    if (kind === "products" && body.purchaseState !== 0) return fail("google_not_purchased");
    if (kind === "subscriptions" && body.paymentState !== 1 && body.paymentState !== 2) {
      if (body.expiryTimeMillis && Number(body.expiryTimeMillis) < now) return fail("google_expired");
    }
    const exp = body.expiryTimeMillis ? Number(body.expiryTimeMillis) : NaN;
    return {
      ok: true,
      productId: product.sku,
      transactionId: `gp_${input.receipt.slice(0, 16)}`,
      expiresHint: Number.isFinite(exp) ? exp : product.period === "once" ? null : now + (product.period === "year" ? 365 : 30) * 86400_000,
    };
  } catch {
    return fail("google_api_unreachable");
  }
}
