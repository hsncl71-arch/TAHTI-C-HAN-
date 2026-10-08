import { createHmac, timingSafeEqual } from "node:crypto";
import { BUNDLE_APPLE, productBySku, productByStoreId } from "@/domains/commerce/catalog";
import { assertNotPayToWin } from "@/domains/commerce/fairness";
import type { StorePlatform } from "@/domains/commerce/model";

export interface VerifyInput {
  platform: StorePlatform;
  productId: string;
  receipt: string;
  userId: string;
}

export type VerifyResult =
  | { ok: true; productId: string; transactionId: string; expiresHint: number | null }
  | { ok: false; reason: string };

const SANDBOX_PREFIX = "sandbox.v1.";

export function sandboxSecret(): string {
  return (typeof process !== "undefined" && process.env.BILLING_SANDBOX_SECRET?.trim()) || "taht-cihan-sandbox-billing";
}

export function signSandboxReceipt(payload: {
  productId: string;
  userId: string;
  nonce: string;
  iat: number;
}): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = createHmac("sha256", sandboxSecret()).update(body).digest("hex");
  return `${SANDBOX_PREFIX}${body}.${mac}`;
}

export function verifyReceipt(input: VerifyInput, now = Date.now()): VerifyResult {
  if (!input.userId) return fail("missing_user");
  if (!input.receipt || input.receipt.length < 12) return fail("empty_receipt");
  if (input.platform === "sandbox") return verifySandbox(input, now);
  if (input.platform === "ios") return verifyApple(input, now);
  if (input.platform === "android") return verifyGoogle(input, now);
  return fail("unknown_platform");
}

function verifySandbox(input: VerifyInput, now: number): VerifyResult {
  if (!input.receipt.startsWith(SANDBOX_PREFIX)) return fail("bad_sandbox_prefix");
  const rest = input.receipt.slice(SANDBOX_PREFIX.length);
  const dot = rest.lastIndexOf(".");
  if (dot < 8) return fail("bad_sandbox_shape");
  const body = rest.slice(0, dot);
  const mac = rest.slice(dot + 1);
  const expected = createHmac("sha256", sandboxSecret()).update(body).digest("hex");
  if (!safeEqualHex(mac, expected)) return fail("bad_sandbox_mac");
  let payload: { productId?: string; userId?: string; nonce?: string; iat?: number };
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as typeof payload;
  } catch {
    return fail("bad_sandbox_json");
  }
  if (payload.userId !== input.userId) return fail("user_mismatch");
  if (payload.productId !== input.productId) return fail("product_mismatch");
  if (typeof payload.iat !== "number" || now - payload.iat > 30 * 60_000) return fail("stale_receipt");
  const product = productBySku(input.productId);
  if (!product || !product.active) return fail("unknown_product");
  try {
    assertNotPayToWin(product);
  } catch {
    return fail("pay_to_win_forbidden");
  }
  return {
    ok: true,
    productId: product.sku,
    transactionId: `sbx_${payload.nonce ?? body.slice(0, 12)}`,
    expiresHint: product.period === "once" ? null : product.period === "year" ? now + 365 * 86400_000 : now + 30 * 86400_000,
  };
}

function verifyApple(input: VerifyInput, now: number): VerifyResult {
  const parsed = parseJws(input.receipt);
  if (!parsed) return fail("bad_jws");
  const storeId = String(parsed.productId ?? parsed.productID ?? "");
  const bundle = String(parsed.bundleId ?? "");
  const tx = String(parsed.transactionId ?? parsed.originalTransactionId ?? "");
  if (!tx) return fail("missing_transaction");
  if (bundle && bundle !== BUNDLE_APPLE) return fail("bundle_mismatch");
  const product = productByStoreId("ios", storeId) ?? productBySku(input.productId);
  if (!product || !product.active) return fail("unknown_product");
  if (storeId && product.appleProductId !== storeId && product.sku !== storeId) return fail("product_mismatch");
  try {
    assertNotPayToWin(product);
  } catch {
    return fail("pay_to_win_forbidden");
  }
  const env = String(parsed.environment ?? "Sandbox");
  if (env !== "Sandbox" && env !== "Production" && env !== "Xcode") return fail("bad_environment");
  if (env === "Production") {
    const live = Boolean(
      typeof process !== "undefined" &&
        process.env.APPLE_ISSUER_ID?.trim() &&
        process.env.APPLE_KEY_ID?.trim() &&
        process.env.APPLE_PRIVATE_KEY?.trim(),
    );
    if (!live) return fail("apple_credentials_required");
    return fail("apple_jws_verify_unconfigured");
  }
  return {
    ok: true,
    productId: product.sku,
    transactionId: `ios_${tx}`,
    expiresHint: product.period === "once" ? null : expiryFromApple(parsed, now, product.period),
  };
}

function verifyGoogle(input: VerifyInput, now: number): VerifyResult {
  const token = input.receipt;
  if (token.length < 16) return fail("bad_token");
  const storeId = input.productId;
  const product = productByStoreId("android", storeId) ?? productBySku(storeId) ?? productBySku(input.productId);
  if (!product || !product.active) return fail("unknown_product");
  try {
    assertNotPayToWin(product);
  } catch {
    return fail("pay_to_win_forbidden");
  }
  const sandbox = token.startsWith("GPA.SANDBOX.");
  const live = Boolean(typeof process !== "undefined" && process.env.GOOGLE_PLAY_SERVICE_ACCOUNT?.trim());
  if (!sandbox && !live) return fail("google_credentials_required");
  if (!sandbox && live) return fail("google_play_api_unconfigured");
  if (!sandbox && !/^[A-Za-z0-9._:-]{16,200}$/.test(token)) return fail("bad_token_shape");
  return {
    ok: true,
    productId: product.sku,
    transactionId: `gp_${hashShort(token)}`,
    expiresHint: product.period === "once" ? null : product.period === "year" ? now + 365 * 86400_000 : now + 30 * 86400_000,
  };
}

function parseJws(jws: string): Record<string, unknown> | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json) as Record<string, unknown>;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

function expiryFromApple(payload: Record<string, unknown>, now: number, period: "month" | "year"): number {
  const raw = payload.expiresDate ?? payload.expiresDateMs;
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (Number.isFinite(n) && n > now) return n;
  return now + (period === "year" ? 365 : 30) * 86400_000;
}

function hashShort(value: string): string {
  return createHmac("sha256", "tx").update(value).digest("hex").slice(0, 16);
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    if (left.length !== right.length || left.length === 0) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function fail(reason: string): VerifyResult {
  return { ok: false, reason };
}

export function encodeAppleJws(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" }), "utf8").toString("base64url");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${header}.${body}.sandbox-sig`;
}
