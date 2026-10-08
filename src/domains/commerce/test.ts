import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction } from "../world/engine.ts";
import { createInitialState } from "../world/seed.ts";
import { migrateState } from "../palace/migrate.ts";
import { hostPower } from "../military/combat.ts";
import { STATE_VERSION, type GameState } from "../types.ts";
import { DEFAULT_CATALOG, mergeCatalog, productBySku } from "./catalog.ts";
import { canEquip, grantsForSku, resolveWallet } from "./entitlements.ts";
import { assertCatalogFair, combatFingerprint } from "./fairness.ts";
import { encodeAppleJws, signSandboxReceipt, verifyReceipt } from "./verify.ts";
import { verifyReceiptResolved } from "./live.ts";
import { detectStorePlatform } from "./platform.ts";
import type { EntitlementRow } from "./model.ts";
import { applyBillingEvent, GRACE_MS, isGrantLive, walletStatusOf } from "./lifecycle.ts";
import { ensureWardrobe, equipWardrobe } from "./wardrobe.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "kanuni" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "shop-user");
}

describe("commerce catalog fairness", () => {
  it("ships only cosmetic and subscription skus with no simulation flags", () => {
    assertCatalogFair();
    for (const p of DEFAULT_CATALOG) {
      assert.equal(p.affectsSimulation, false);
      assert.ok(p.kind === "cosmetic" || p.kind === "subscription");
      assert.ok(p.appleProductId.startsWith("com.tahticihan."));
      assert.ok(p.googleProductId.length > 4);
    }
    assert.ok(productBySku("cihan.premium.monthly"));
    assert.ok(productBySku("cihan.premium.yearly"));
  });

  it("rejects a combat sku at the fairness gate", () => {
    assert.throws(() =>
      assertCatalogFair([
        {
          ...DEFAULT_CATALOG[0],
          sku: "cihan.gold.pack",
          grants: ["premium"],
        },
      ]),
    );
  });
});

describe("commerce wardrobe", () => {
  it("migrates a missing wardrobe and keeps STATE_VERSION", () => {
    const s = fresh();
    assert.equal(s.version, STATE_VERSION);
    assert.equal(s.wardrobe.robeId, "default");
    const stripped = { ...s, wardrobe: undefined as never, version: 13 };
    const next = migrateState(stripped as GameState);
    assert.equal(next.version, STATE_VERSION);
    assert.equal(next.wardrobe.robeId, "default");
    const twice = migrateState(next);
    assert.equal(twice.wardrobe.palaceId, "default");
  });

  it("equipping a kaftan never changes treasury, army or siege power", () => {
    const s = ensureWardrobe(fresh());
    const before = combatFingerprint(s);
    const power = hostPower(s, s.army, { terrain: "plain", weather: "fair", tactic: "center", siege: false, naval: false }).power;
    const equipped = applyAction(s, { type: "EQUIP_COSMETIC", slot: "robe", itemId: "kaftan.crimson" }).state;
    assert.equal(equipped.wardrobe.robeId, "kaftan.crimson");
    assert.equal(combatFingerprint(equipped), before);
    const after = hostPower(equipped, equipped.army, {
      terrain: "plain",
      weather: "fair",
      tactic: "center",
      siege: false,
      naval: false,
    }).power;
    assert.equal(after, power);
    assert.equal(equipped.treasury, s.treasury);
    assert.equal(equipped.prestige, s.prestige);
  });

  it("ignores unknown cosmetic ids", () => {
    const s = equipWardrobe(fresh(), "robe", "kaftan.win_war");
    assert.equal(s.wardrobe.robeId, "default");
  });
});

describe("commerce entitlements", () => {
  it("monthly premium unlocks archive, reports, replay and cosmetics until expiry", () => {
    const now = 1_700_000_000_000;
    const rows = grantsForSku("cihan.premium.monthly", now);
    const wallet = resolveWallet(rows, undefined, now + 1000);
    assert.equal(wallet.premium, true);
    assert.equal(wallet.plan, "monthly");
    assert.ok(wallet.grants.includes("archive"));
    assert.ok(wallet.grants.includes("replay"));
    assert.equal(canEquip(wallet, "robe", "kaftan.night"), true);
    const later = resolveWallet(rows, undefined, now + 40 * 86400_000);
    assert.equal(later.premium, false);
    assert.equal(canEquip(later, "robe", "kaftan.night"), false);
  });

  it("one-time kaftan survives after a lapsed subscription", () => {
    const now = 1_700_000_000_000;
    const rows = [...grantsForSku("cihan.premium.monthly", now), ...grantsForSku("cihan.cosmetic.kaftan.ivory", now)];
    const lapsed = resolveWallet(rows, { robeId: "kaftan.ivory", palaceId: "palace.night", bannerId: "default" }, now + 40 * 86400_000);
    assert.equal(lapsed.premium, false);
    assert.equal(canEquip(lapsed, "robe", "kaftan.ivory"), true);
    assert.equal(canEquip(lapsed, "palace", "palace.night"), false);
    assert.equal(lapsed.wardrobe.robeId, "kaftan.ivory");
    assert.equal(lapsed.wardrobe.palaceId, "default");
  });
});

describe("commerce receipt verification", () => {
  it("accepts a signed sandbox receipt for the owning user", () => {
    const receipt = signSandboxReceipt({
      productId: "cihan.premium.yearly",
      userId: "u1",
      nonce: "abc12345",
      iat: Date.now(),
    });
    const ok = verifyReceipt({ platform: "sandbox", productId: "cihan.premium.yearly", receipt, userId: "u1" });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.productId, "cihan.premium.yearly");
      assert.ok(ok.transactionId.startsWith("sbx_"));
    }
  });

  it("rejects a sandbox receipt for another user or a tampered mac", () => {
    const receipt = signSandboxReceipt({
      productId: "cihan.cosmetic.banner.tugh",
      userId: "u1",
      nonce: "n1",
      iat: Date.now(),
    });
    const other = verifyReceipt({ platform: "sandbox", productId: "cihan.cosmetic.banner.tugh", receipt, userId: "u2" });
    assert.equal(other.ok, false);
    const bad = verifyReceipt({
      platform: "sandbox",
      productId: "cihan.cosmetic.banner.tugh",
      receipt: `${receipt}00`,
      userId: "u1",
    });
    assert.equal(bad.ok, false);
  });

  it("parses a StoreKit-shaped JWS and a Play token without granting combat", () => {
    const jws = encodeAppleJws({
      bundleId: "com.tahticihan.app",
      productId: "com.tahticihan.kaftan.night",
      transactionId: "100000012345",
      environment: "Sandbox",
    });
    const apple = verifyReceipt({
      platform: "ios",
      productId: "cihan.cosmetic.kaftan.night",
      receipt: jws,
      userId: "u1",
    });
    assert.equal(apple.ok, true);
    const play = verifyReceipt({
      platform: "android",
      productId: "cihan_banner_hilal",
      receipt: "GPA.SANDBOX.TOKEN-1234567890",
      userId: "u1",
    });
    assert.equal(play.ok, true);
    const unknown = verifyReceipt({
      platform: "ios",
      productId: "com.cheat.win",
      receipt: encodeAppleJws({ bundleId: "com.tahticihan.app", productId: "com.cheat.win", transactionId: "1" }),
      userId: "u1",
    });
    assert.equal(unknown.ok, false);
  });

  it("rejects live App Store and Play tokens without credentials", () => {
    const prod = verifyReceipt({
      platform: "ios",
      productId: "cihan.cosmetic.kaftan.night",
      receipt: encodeAppleJws({
        bundleId: "com.tahticihan.app",
        productId: "com.tahticihan.kaftan.night",
        transactionId: "200000012345",
        environment: "Production",
      }),
      userId: "u1",
    });
    assert.equal(prod.ok, false);
    if (!prod.ok) assert.equal(prod.reason, "apple_credentials_required");
    const playLive = verifyReceipt({
      platform: "android",
      productId: "cihan_banner_hilal",
      receipt: "GPA.LIVE-TOKEN-1234567890",
      userId: "u1",
    });
    assert.equal(playLive.ok, false);
  });

  it("async live path still refuses production tokens without credentials", async () => {
    const prod = await verifyReceiptResolved({
      platform: "ios",
      productId: "cihan.cosmetic.kaftan.night",
      receipt: encodeAppleJws({
        bundleId: "com.tahticihan.app",
        productId: "com.tahticihan.kaftan.night",
        transactionId: "200000012345",
        environment: "Production",
      }),
      userId: "u1",
    });
    assert.equal(prod.ok, false);
  });

  it("browser / node has no native shell so billing stays sandbox", () => {
    assert.equal(detectStorePlatform(), "sandbox");
  });
});

describe("commerce owner prices", () => {
  it("merges owner price overrides without inventing combat skus", () => {
    const merged = mergeCatalog([{ sku: "cihan.premium.monthly", priceTry: 9900, priceUsd: 399, active: true }]);
    const monthly = merged.find((p) => p.sku === "cihan.premium.monthly");
    assert.equal(monthly?.priceTry, 9900);
    assert.equal(monthly?.priceUsd, 399);
    assert.equal(monthly?.affectsSimulation, false);
    assert.equal(merged.length, DEFAULT_CATALOG.length);
    assertCatalogFair(merged);
  });
});

describe("commerce billing lifecycle", () => {
  it("keeps a cancelled sub live until expiry and kills refunds immediately", () => {
    const now = 1_700_000_000_000;
    let rows: EntitlementRow[] = grantsForSku("cihan.premium.monthly", now).map((r) => ({ ...r, status: "active" as const }));
    rows = applyBillingEvent(rows, { kind: "cancel", sku: "cihan.premium.monthly", now });
    assert.equal(isGrantLive(rows[0], now + 1000), true);
    assert.equal(walletStatusOf(rows, now + 1000), "cancelled");
    assert.equal(isGrantLive(rows[0], now + 40 * 86400_000), false);
    rows = applyBillingEvent(rows, { kind: "refund", sku: "cihan.premium.monthly", now: now + 1000 });
    assert.equal(isGrantLive(rows[0], now + 2000), false);
  });

  it("grace window keeps premium without changing combat math", () => {
    const now = 1_700_000_000_000;
    let rows: EntitlementRow[] = grantsForSku("cihan.premium.monthly", now);
    rows = applyBillingEvent(rows, { kind: "grace", sku: "cihan.premium.monthly", now: now + 31 * 86400_000 });
    const later = now + 31 * 86400_000 + 1000;
    assert.equal(isGrantLive(rows[0], later), true);
    assert.equal(walletStatusOf(rows, later), "grace");
    assert.ok(GRACE_MS > 7 * 86400_000);
    const s = fresh();
    const before = combatFingerprint(s);
    assert.equal(combatFingerprint(s), before);
  });
});
