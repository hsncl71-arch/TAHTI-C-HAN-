import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attemptPush, canSendAndroid, canSendIos, markOutboxStatus } from "./dispatch.ts";
import { deliverPush } from "./transport.ts";
import {
  meydanChallengePush,
  meydanRoute,
  parseMeydanDeepLink,
  sanitizeToken,
} from "./model.ts";

describe("push payload and deep links", () => {
  it("builds a meydan route the client can parse back", () => {
    const route = meydanRoute("match_abc-123");
    assert.equal(route, "/oyun?meydan=match_abc-123");
    assert.equal(parseMeydanDeepLink(`https://tahticihan.app${route}`), "match_abc-123");
    assert.equal(parseMeydanDeepLink("tahticihan://meydan/match_abc-123"), "match_abc-123");
    assert.equal(parseMeydanDeepLink("/oyun?foo=1"), null);
    assert.equal(parseMeydanDeepLink("https://evil.example/oyun?meydan=match_abc-123"), "match_abc-123");
  });

  it("rejects short or dirty device tokens", () => {
    assert.equal(sanitizeToken("short"), null);
    assert.equal(sanitizeToken("token with spaces.............."), null);
    assert.ok(sanitizeToken("a".repeat(32)));
  });

  it("challenge push never carries army or treasury numbers", () => {
    const p = meydanChallengePush("Alparslan", "match_1");
    assert.equal(p.kind, "meydan");
    assert.equal(p.vars.name, "Alparslan");
    assert.equal("treasury" in p.vars, false);
    assert.match(p.route, /^\/oyun\?meydan=/);
  });
});

describe("push delivery honesty", () => {
  it("does not mark sent without APNs/FCM credentials", () => {
    assert.equal(canSendIos(), false);
    assert.equal(canSendAndroid(), false);
    const attempt = attemptPush(
      { id: "d1", userId: "u1", platform: "ios", token: "t".repeat(32), locale: "tr" },
      meydanChallengePush("A", "match_1"),
    );
    assert.equal(attempt.ok, false);
    if (!attempt.ok) assert.equal(attempt.reason, "apns_unconfigured");
    assert.equal(markOutboxStatus(attempt), "queued");
  });

  it("async transport also stays queued without credentials", async () => {
    const attempt = await deliverPush(
      { id: "d1", userId: "u1", platform: "android", token: "t".repeat(32), locale: "tr" },
      meydanChallengePush("A", "match_1"),
    );
    assert.equal(attempt.ok, false);
    if (!attempt.ok) assert.equal(attempt.reason, "fcm_unconfigured");
  });
});
