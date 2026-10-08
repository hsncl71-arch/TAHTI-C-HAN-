import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hostOfTurnUrl, parseTurnUrls, stunFromEnv } from "./ice.ts";
import { turnRestLease } from "./ice.server.ts";

describe("ICE / TURN issuer", () => {
  it("parses only turn/turns URLs and never treats stun as turn", () => {
    const urls = parseTurnUrls("stun:stun.l.google.com:19302,turn:turn.example:3478?transport=udp,turns:turn.example:5349");
    assert.equal(urls.length, 2);
    assert.ok(urls.every((u) => u.startsWith("turn")));
    assert.equal(hostOfTurnUrl("turn:turn.example:3478?transport=udp"), "turn.example");
  });

  it("stun env ignores turn urls", () => {
    const stun = stunFromEnv("turn:evil.example,stun:stun.l.google.com:19302");
    assert.deepEqual(stun, ["stun:stun.l.google.com:19302"]);
  });

  it("coturn REST lease is time-bound HMAC, not the secret", () => {
    const lease = turnRestLease("super-secret-turn", "user_abc-1", 3600, 1_700_000_000_000);
    assert.ok(lease.username.startsWith(`${Math.floor(1_700_000_000_000 / 1000) + 3600}:`));
    assert.notEqual(lease.credential, "super-secret-turn");
    assert.ok(lease.credential.length > 8);
    const later = turnRestLease("super-secret-turn", "user_abc-1", 3600, 1_700_000_000_000 + 10_000);
    assert.notEqual(later.username, lease.username);
  });
});
