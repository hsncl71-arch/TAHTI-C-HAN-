import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState, rebaseCampaignSeat } from "../world/seed.ts";
import { applyAction } from "../world/engine.ts";
import { migrateState } from "../palace/migrate.ts";
import { STATE_VERSION, type GameState } from "../types.ts";
import { emptyTerms, ensureDiplomacy, fillRelation, isPlayerHeld } from "./model.ts";
import { tickAiDiplomacy, aiAcceptsOffer } from "./ai.ts";
import { applyOfferResult, localTreatyAllowed } from "./apply.ts";
import { canClaimSeat, catalogSeatRows, isAbandoned, toSeatClaim, ABANDON_MS } from "./seats.ts";
import { canIssueInvite, canRedeemInvite, issueInvite, INVITE_TTL_MS } from "./invite.ts";
import { moderateText, canRateLimit } from "./moderate.ts";
import { needsCounterpartyConsent, isUnilateral, aiMayActForSeat, validateOffer } from "./offers.ts";
import { hydrateWorldOntoState, pairKey, upsertWorldBond, type WorldBond } from "./world.ts";
import { defaultBond } from "./defaults.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "fatih" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(seatId = "osmanli"): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits], seatId }, "dip-user");
}

function withPlayerSeat(s: GameState, realmId: string): GameState {
  const next = ensureDiplomacy(s);
  return {
    ...next,
    diplomacy: {
      ...next.diplomacy,
      seats: [
        {
          realmId,
          kind: "player",
          userId: "other",
          campaignId: "c1",
          rulerName: "Istvan",
          realmName: "Macar Krallığı",
          live: true,
          claimable: false,
        },
      ],
    },
  };
}

describe("hybrid diplomacy", () => {
  it("seeds a chosen seat, not always osmanli", () => {
    const s = fresh("karaman");
    assert.equal(s.diplomacy.seatId, "karaman");
    assert.equal(s.realm.capitalId, "karaman");
    assert.equal(s.version, STATE_VERSION);
    assert.ok(s.foreign.some((f) => f.id === "osmanli"));
    assert.ok(!s.foreign.some((f) => f.id === "karaman"));
    const owned = s.provinces.filter((p) => p.ownerId === s.realm.id);
    assert.ok(owned.some((p) => p.id === "karaman"));
    assert.equal(s.army.provinceId, "karaman");
  });

  it("fills relation defaults and kirim alliance for osmanli", () => {
    const s = fresh("osmanli");
    const kirim = s.relations.find((r) => r.realmId === "kirim");
    assert.equal(kirim?.treaty, "alliance");
    assert.equal(typeof kirim?.tradePact, "boolean");
    assert.equal(kirim?.coalitionAgainst, null);
    const bond = defaultBond("osmanli", "karaman");
    assert.equal(bond.value, -25);
  });

  it("blocks instant treaties against a live player throne", () => {
    const s = withPlayerSeat(fresh(), "macar");
    assert.equal(isPlayerHeld(s, "macar"), true);
    assert.equal(localTreatyAllowed(s, "macar", "alliance"), false);
    assert.equal(localTreatyAllowed(s, "macar", "war"), true);
    const blocked = applyAction(s, { type: "TREATY", realmId: "macar", treaty: "alliance" });
    assert.equal(blocked.state.relations.find((r) => r.realmId === "macar")?.treaty, s.relations.find((r) => r.realmId === "macar")?.treaty);
  });

  it("AI never accepts on behalf of a player-held seat", () => {
    const s = withPlayerSeat(fresh(), "venedik");
    assert.equal(aiAcceptsOffer(s, "venedik", "alliance", emptyTerms(), () => 0.99), false);
    assert.equal(aiMayActForSeat(s, s.diplomacy.seatId, "war"), false);
  });

  it("year tick does not auto-peace a war and does not rewrite player-held treaties", () => {
    let s = withPlayerSeat(fresh(), "macar");
    s = {
      ...s,
      relations: s.relations.map((r) =>
        r.realmId === "macar" ? fillRelation({ ...r, treaty: "war", value: -80 }, r.realmId) : r,
      ),
    };
    const ticked = tickAiDiplomacy(s, () => 0.99);
    assert.equal(ticked.relations.find((r) => r.realmId === "macar")?.treaty, "war");
  });

  it("AI counterpart may still declare war; peace still needs consent", () => {
    assert.equal(needsCounterpartyConsent("peace"), true);
    assert.equal(needsCounterpartyConsent("alliance"), true);
    assert.equal(isUnilateral("war"), true);
    assert.equal(isUnilateral("envoy"), true);
  });

  it("applies peace, trade, alliance, war, coalition", () => {
    const s = fresh();
    const peace = applyOfferResult(s, "peace", s.diplomacy.seatId, "karaman", { ...emptyTerms(), tribute: 800 }, true);
    assert.equal(peace.relations.find((r) => r.realmId === "karaman")?.treaty, "peace");
    assert.ok(peace.treasury < s.treasury);
    const trade = applyOfferResult(s, "trade", s.diplomacy.seatId, "venedik", emptyTerms(), true);
    assert.equal(trade.relations.find((r) => r.realmId === "venedik")?.tradePact, true);
    const ally = applyOfferResult(s, "alliance", s.diplomacy.seatId, "kirim", emptyTerms(), true);
    assert.equal(ally.relations.find((r) => r.realmId === "kirim")?.treaty, "alliance");
    const war = applyOfferResult(s, "war", s.diplomacy.seatId, "macar", emptyTerms(), true);
    assert.equal(war.relations.find((r) => r.realmId === "macar")?.treaty, "war");
    const coal = applyOfferResult(s, "coalition", s.diplomacy.seatId, "kirim", { ...emptyTerms(), againstRealmId: "macar" }, true);
    assert.equal(coal.relations.find((r) => r.realmId === "kirim")?.coalitionAgainst, "macar");
    assert.equal(coal.relations.find((r) => r.realmId === "macar")?.treaty, "war");
    const refused = applyOfferResult(s, "alliance", s.diplomacy.seatId, "memluk", emptyTerms(), false);
    assert.ok((refused.relations.find((r) => r.realmId === "memluk")?.value ?? 0) < (s.relations.find((r) => r.realmId === "memluk")?.value ?? 0));
  });

  it("queues offers to live players and resolves them", () => {
    const s = withPlayerSeat(fresh(), "macar");
    const queued = applyAction(s, {
      type: "DIP_OFFER",
      realmId: "macar",
      kind: "alliance",
      terms: emptyTerms(),
    });
    assert.equal(queued.state.relations.find((r) => r.realmId === "macar")?.treaty, "peace");
    assert.equal(queued.state.diplomacy.pending.length, 1);
    const id = queued.state.diplomacy.pending[0].id;
    const accepted = applyAction(queued.state, { type: "DIP_RESPOND", offerId: id, accept: true });
    assert.equal(accepted.state.relations.find((r) => r.realmId === "macar")?.treaty, "alliance");
    assert.equal(accepted.state.diplomacy.pending.length, 0);
  });

  it("war against a player throne applies at once", () => {
    const s = withPlayerSeat(fresh(), "macar");
    const res = applyAction(s, { type: "DIP_OFFER", realmId: "macar", kind: "war", terms: emptyTerms() });
    assert.equal(res.state.relations.find((r) => r.realmId === "macar")?.treaty, "war");
  });

  it("rejects coalition without a third throne", () => {
    const s = fresh();
    const bad = validateOffer(s, "kirim", "coalition", emptyTerms());
    assert.equal(bad.ok, false);
    const ok = validateOffer(s, "kirim", "coalition", { ...emptyTerms(), againstRealmId: "macar" });
    assert.equal(ok.ok, true);
  });

  it("takeover: live player blocks, abandoned and AI are claimable", () => {
    const now = Date.now();
    const live = canClaimSeat({ kind: "player", userId: "a", lastSeen: new Date(now).toISOString() }, "b", now);
    assert.equal(live.ok, false);
    if (!live.ok) assert.equal(live.reason, "occupied");
    const old = canClaimSeat({ kind: "player", userId: "a", lastSeen: new Date(now - ABANDON_MS - 1000).toISOString() }, "b", now);
    assert.equal(old.ok, true);
    const ai = canClaimSeat({ kind: "ai", userId: null, lastSeen: null }, "b", now);
    assert.equal(ai.ok, true);
    const self = canClaimSeat({ kind: "player", userId: "b", lastSeen: new Date(now).toISOString() }, "b", now);
    assert.equal(self.ok, true);
    assert.equal(isAbandoned(new Date(now - ABANDON_MS - 1).toISOString(), now), true);
    const claim = toSeatClaim(
      {
        seatId: "venedik",
        kind: "player",
        userId: "x",
        campaignId: "c",
        rulerName: "Foscari",
        realmName: "Venedik",
        lastSeen: new Date(now).toISOString(),
      },
      now,
    );
    assert.equal(claim.live, true);
    assert.equal(claim.claimable, false);
  });

  it("moderates letters: abuse, links, spam, empty", () => {
    assert.equal(moderateText("selam padişahım").ok, true);
    assert.equal(moderateText("sikik").ok, false);
    assert.equal(moderateText("http://evil.test").ok, false);
    assert.equal(moderateText("aaaaaaaaaa").ok, false);
    assert.equal(moderateText("x").ok, false);
    assert.equal(canRateLimit(7, 8), true);
    assert.equal(canRateLimit(8, 8), false);
  });

  it("hydrates world bonds onto the local seat", () => {
    const s = fresh("osmanli");
    const [a, b] = pairKey("osmanli", "venedik");
    const bonds: WorldBond[] = [{ a, b, value: 40, treaty: "alliance", tradePact: true, coalitionAgainst: null }];
    const seats = [
      {
        realmId: "venedik",
        kind: "player" as const,
        userId: "u2",
        campaignId: "c2",
        rulerName: "Foscari",
        realmName: "Venedik",
        live: true,
        claimable: false,
      },
    ];
    const h = hydrateWorldOntoState(s, seats, bonds, []);
    const rel = h.relations.find((r) => r.realmId === "venedik");
    assert.equal(rel?.treaty, "alliance");
    assert.equal(rel?.tradePact, true);
    assert.equal(h.foreign.find((f) => f.id === "venedik")?.isPlayer, true);
    assert.equal(isPlayerHeld(h, "venedik"), true);
  });

  it("rebases a usurped campaign onto a free throne", () => {
    const s = rebaseCampaignSeat(fresh("osmanli"), "kirim");
    assert.equal(s.diplomacy.seatId, "kirim");
    assert.equal(s.realm.capitalId, "kefe");
    assert.ok(s.foreign.some((f) => f.id === "osmanli"));
  });

  it("migrate fills diplomacy on old saves", () => {
    const s = fresh();
    const raw = { ...s, diplomacy: undefined as unknown as GameState["diplomacy"], version: 8 };
    const m = migrateState(raw as GameState);
    assert.ok(m.diplomacy.seatId);
    assert.equal(m.version, STATE_VERSION);
  });

  it("pair key is stable", () => {
    assert.deepEqual(pairKey("venedik", "osmanli"), ["osmanli", "venedik"]);
    const bonds = upsertWorldBond([], { a: "venedik", b: "osmanli", value: 1, treaty: "peace", tradePact: false, coalitionAgainst: null });
    assert.equal(bonds[0].a, "osmanli");
  });
});

describe("throne invites", () => {
  it("lets a holder invite onto a free AI seat and blocks occupied ones", () => {
    const now = Date.now();
    const seats = catalogSeatRows().map((r) =>
      r.seatId === "osmanli" ? { ...r, kind: "player" as const, userId: "u1", lastSeen: new Date(now).toISOString() } : r,
    );
    assert.equal(canIssueInvite(seats, "u1", "karaman", now).ok, true);
    const occupied = seats.map((r) =>
      r.seatId === "karaman" ? { ...r, kind: "player" as const, userId: "u2", lastSeen: new Date(now).toISOString() } : r,
    );
    assert.equal(canIssueInvite(occupied, "u1", "karaman", now).ok, false);
    const invite = issueInvite({ fromUserId: "u1", fromSeat: "osmanli", targetSeat: "karaman", now });
    assert.equal(canRedeemInvite(invite, "u1", seats, now).ok, false);
    assert.equal(canRedeemInvite(invite, "u3", seats, now).ok, true);
    assert.equal(canRedeemInvite(invite, "u3", seats, now + INVITE_TTL_MS + 10).ok, false);
  });

  it("abandoned player thrones become AI and claimable", () => {
    const now = Date.now();
    assert.equal(isAbandoned(new Date(now - ABANDON_MS - 1000), now), true);
    const row = {
      seatId: "macar",
      kind: "player" as const,
      userId: "gone",
      campaignId: "c",
      rulerName: "Istvan",
      realmName: "Macar",
      lastSeen: new Date(now - ABANDON_MS - 1000).toISOString(),
    };
    const claim = toSeatClaim(row, now);
    assert.equal(claim.kind, "ai");
    assert.equal(claim.claimable, true);
    assert.equal(canClaimSeat(row, "u9", now).ok, true);
  });
});
