import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction } from "../world/engine.ts";
import { yearsDue } from "../worldclock/time.ts";
import { parseGameAction, MAX_RAISE, MAX_GIFT } from "./actions.ts";
import {
  canGrantOwner,
  isOwnerEmail,
  OWNER_EMAIL,
  ownerFromClientClaim,
  roleForEmail,
} from "./owner.ts";
import { allowRate, nextCount, RATE_CAPS, windowStart } from "./rate.ts";
import { actionFingerprint, isNonceShape, replayTooSoon } from "./replay.ts";
import {
  armySpikeIllegal,
  authorizeAction,
  canAdvanceYear,
  hostHeadcount,
  serverDuelSeed,
  serverFoeTactic,
  treasuryDeltaIllegal,
} from "./authority.ts";
import { assertResourceOwner, mayMutatePeerField, scopedUserIds, stripForeignWallet } from "./isolation.ts";
import type { GameState } from "../types.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "fatih" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "sec-user");
}

describe("owner lock", () => {
  it("only the locked mailbox is OWNER", () => {
    assert.equal(isOwnerEmail(OWNER_EMAIL), true);
    assert.equal(isOwnerEmail("ZUNOZAOFFICIAL@GMAIL.COM"), true);
    assert.equal(isOwnerEmail("  zunozaofficial@gmail.com  "), true);
    assert.equal(roleForEmail(OWNER_EMAIL), "owner");
  });

  it("every other identity stays a player", () => {
    assert.equal(isOwnerEmail("player@example.com"), false);
    assert.equal(isOwnerEmail("dev@example.com"), false);
    assert.equal(isOwnerEmail(null), false);
    assert.equal(isOwnerEmail(""), false);
    assert.equal(roleForEmail("admin@taht.local"), "player");
  });

  it("OWNER cannot be granted to a different mailbox", () => {
    assert.equal(canGrantOwner(OWNER_EMAIL, "spy@example.com"), false);
    assert.equal(canGrantOwner("spy@example.com", OWNER_EMAIL), false);
    assert.equal(canGrantOwner(OWNER_EMAIL, OWNER_EMAIL), true);
    assert.throws(() => ownerFromClientClaim(true));
  });
});

describe("action parser", () => {
  it("rejects unknown and prototype-polluted types", () => {
    assert.throws(() => parseGameAction({ type: "SET_GOLD", amount: 999999 }));
    assert.throws(() => parseGameAction({ type: "GIVE_TROOPS" }));
    assert.throws(() => parseGameAction({ type: "__proto__" }));
    assert.throws(() => parseGameAction(null));
  });

  it("caps troop raises and gifts", () => {
    const raise = parseGameAction({ type: "RAISE_TROOPS", kind: "janissary", count: 9_999_999 });
    assert.equal(raise.type, "RAISE_TROOPS");
    if (raise.type === "RAISE_TROOPS") assert.equal(raise.count, MAX_RAISE);
    const gift = parseGameAction({ type: "GIFT", realmId: "venedik", amount: 1e12 });
    assert.equal(gift.type, "GIFT");
    if (gift.type === "GIFT") assert.equal(gift.amount, MAX_GIFT);
  });

  it("rejects NaN and empty ids", () => {
    assert.throws(() => parseGameAction({ type: "RAISE_TROOPS", kind: "janissary", count: Number.NaN }));
    assert.throws(() => parseGameAction({ type: "GIFT", realmId: "", amount: 200 }));
    assert.throws(() => parseGameAction({ type: "DIP_RESPOND", offerId: "", accept: true }));
  });

  it("strips client duel seed and foe tactic", () => {
    const start = parseGameAction({
      type: "START_DUEL",
      peerId: "ai",
      peerName: "X",
      provinceId: "edirne",
      seed: 42,
      host: true,
      duelId: "duel_abc12345",
    });
    assert.equal(start.type, "START_DUEL");
    if (start.type === "START_DUEL") assert.equal(start.seed, 0);
    const resolve = parseGameAction({ type: "RESOLVE_DUEL", tactic: "flank", foeTactic: "withdraw" });
    assert.equal(resolve.type, "RESOLVE_DUEL");
    if (resolve.type === "RESOLVE_DUEL") assert.equal(resolve.foeTactic, "hold_line");
  });
});

describe("server-authoritative combat and clock", () => {
  it("rewrites duel seed and ignores client foe tactic for AI", () => {
    const s = fresh();
    const started = applyAction(s, {
      type: "START_DUEL",
      peerId: "ai",
      peerName: "Serdar",
      provinceId: s.army.provinceId,
      seed: 1,
      host: true,
      duelId: "duel_test01",
    }).state;
    const authed = authorizeAction(
      started,
      { type: "RESOLVE_DUEL", tactic: "flank", foeTactic: "withdraw" },
      { now: Date.now(), peerTactic: null },
    );
    assert.equal(authed.type, "RESOLVE_DUEL");
    if (authed.type === "RESOLVE_DUEL") {
      assert.notEqual(authed.foeTactic, "withdraw");
    }
    assert.ok(serverDuelSeed(s.seed, s.year, "duel_test01") > 0);
    assert.ok(serverFoeTactic("duel_test01", "peer"));
  });

  it("rewrites a player peer into an AI drill so PvP cannot bypass live_matches", () => {
    const s = fresh();
    const authed = authorizeAction(
      s,
      {
        type: "START_DUEL",
        peerId: "p-hacker",
        peerName: "Hile",
        provinceId: s.army.provinceId,
        seed: 99,
        host: true,
        duelId: "duel_pvp01",
      },
      { now: Date.now() },
    );
    assert.equal(authed.type, "START_DUEL");
    if (authed.type === "START_DUEL") {
      assert.equal(authed.peerId, "ai");
      assert.notEqual(authed.seed, 99);
    }
  });

  it("blocks speed-hack year advances when the clock is not due", () => {
    const s = fresh();
    const now = s.world.lastSimAt;
    assert.equal(yearsDue(s, now), 0);
    assert.equal(canAdvanceYear(s, now), false);
    assert.equal(canAdvanceYear({ ...s, pendingEvents: [] }, now + s.world.msPerYear + 10), true);
  });

  it("detects illegal treasury and army spikes", () => {
    const s = fresh();
    const heads = hostHeadcount(s);
    assert.equal(treasuryDeltaIllegal(s.treasury, s.treasury + 50_000, { type: "GIFT", realmId: "venedik", amount: 200 }), true);
    assert.equal(treasuryDeltaIllegal(s.treasury, s.treasury - 200, { type: "GIFT", realmId: "venedik", amount: 200 }), false);
    assert.equal(armySpikeIllegal(heads, heads + 400, { type: "SET_TAX", rate: 0.1 }), true);
    assert.equal(armySpikeIllegal(heads, heads + 10, { type: "RAISE_TROOPS", kind: "azab", count: 10 }), false);
    assert.equal(armySpikeIllegal(heads, heads + 12, { type: "ADVANCE_YEAR" }), false);
  });

  it("engine raise still spends gold and refuses unaffordable stacks", () => {
    const s = fresh();
    const broke = applyAction({ ...s, treasury: 0 }, { type: "RAISE_TROOPS", kind: "janissary", count: 400 }).state;
    assert.equal(broke.army.janissary, s.army.janissary);
    const paid = applyAction(s, { type: "RAISE_TROOPS", kind: "azab", count: 20 }).state;
    assert.ok(paid.treasury < s.treasury);
    assert.equal(paid.army.azab, s.army.azab + 20);
  });
});

describe("rate and replay", () => {
  it("caps a window", () => {
    assert.equal(allowRate(0, RATE_CAPS.dispatch.cap), true);
    assert.equal(allowRate(RATE_CAPS.dispatch.cap, RATE_CAPS.dispatch.cap), false);
    assert.equal(nextCount(3), 4);
    assert.equal(windowStart(90_000, 60_000), 60_000);
  });

  it("rejects reused nonces and tight replays", () => {
    assert.equal(isNonceShape("abc_def-12"), true);
    assert.equal(isNonceShape("short"), false);
    assert.equal(replayTooSoon(1000, 1100, 280), true);
    assert.equal(replayTooSoon(1000, 2000, 280), false);
    const a = actionFingerprint({ userId: "u1", type: "GIFT", year: 1453, tick: 2 });
    const b = actionFingerprint({ userId: "u1", type: "GIFT", year: 1453, tick: 3 });
    assert.notEqual(a, b);
  });
});

describe("IDOR isolation helpers", () => {
  it("refuses a foreign user id even when the client sends one", () => {
    assert.equal(scopedUserIds("a", null), "a");
    assert.equal(scopedUserIds("a", "a"), "a");
    assert.throws(() => scopedUserIds("a", "b"));
    assert.throws(() => assertResourceOwner("a", "b"));
    assert.equal(mayMutatePeerField({ actorId: "spy", hostUserId: "h", guestUserId: "g" }), false);
    assert.equal(mayMutatePeerField({ actorId: "h", hostUserId: "h", guestUserId: "g" }), true);
    assert.throws(() => stripForeignWallet("a", { userId: "b", sku: "x", status: "verified" }));
  });
});
