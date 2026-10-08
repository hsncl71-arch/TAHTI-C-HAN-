import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { landHost } from "../military/model.ts";
import { applyMatchEvent } from "./machine.ts";
import { MATCH_CHALLENGE_TTL_MS, MATCH_FORFEIT_MS, MATCH_LOCK_MS, type LiveMatch } from "./model.ts";
import { settleLiveMatch, settleForfeit, tacticsForSettle, winnerUserId } from "./settle.ts";
import { guardChallenge, publicMatchView, reuseActiveMatch } from "./rules.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "fatih" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function hostState() {
  return createInitialState({ ...INPUT, givenName: "Alparslan", traits: [...INPUT.traits] }, "user-host");
}
function guestState() {
  return createInitialState({ ...INPUT, givenName: "Karamanoglu", dynastyName: "Karaman", traits: [...INPUT.traits] }, "user-guest");
}

function blank(over: Partial<LiveMatch> = {}): LiveMatch {
  const now = 1_000_000;
  return {
    id: "match_test",
    hostUserId: "user-host",
    guestUserId: "user-guest",
    hostSeat: "osmanli",
    guestSeat: "karaman",
    hostName: "Alparslan",
    guestName: "Karamanoglu",
    provinceId: "konstantiniyye",
    status: "open",
    hostReady: false,
    guestReady: false,
    hostTactic: null,
    guestTactic: null,
    hostConnectedAt: now,
    guestConnectedAt: now,
    seed: 1453,
    lockAt: null,
    winnerUserId: null,
    result: null,
    report: null,
    forfeitUserId: null,
    settleKey: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe("live match FSM", () => {
  it("accepts only the guest, then both ready starts live with a lock", () => {
    const open = blank();
    const bad = applyMatchEvent(open, { type: "accept", userId: "user-host", now: open.createdAt + 10 });
    assert.equal(bad.error, "not_guest");
    const acc = applyMatchEvent(open, { type: "accept", userId: "user-guest", now: open.createdAt + 10 });
    assert.equal(acc.match.status, "lobby");
    const h = applyMatchEvent(acc.match, { type: "ready", userId: "user-host", now: open.createdAt + 20 });
    assert.equal(h.match.status, "lobby");
    const g = applyMatchEvent(h.match, { type: "ready", userId: "user-guest", now: open.createdAt + 30 });
    assert.equal(g.match.status, "live");
    assert.ok(g.match.lockAt && g.match.lockAt > open.createdAt);
  });

  it("first tactic write wins and duplicate same tactic is idempotent", () => {
    const live = blank({ status: "live", hostReady: true, guestReady: true, lockAt: 1_000_000 + MATCH_LOCK_MS });
    const a = applyMatchEvent(live, { type: "tactic", userId: "user-host", tactic: "flank", nonce: "n1", now: live.createdAt + 5 });
    assert.equal(a.match.hostTactic, "flank");
    const dup = applyMatchEvent(a.match, { type: "tactic", userId: "user-host", tactic: "flank", nonce: "n2", now: live.createdAt + 6 });
    assert.equal(dup.error, undefined);
    const change = applyMatchEvent(a.match, { type: "tactic", userId: "user-host", tactic: "center", nonce: "n3", now: live.createdAt + 7 });
    assert.equal(change.error, "tactic_locked");
  });

  it("both tactics trigger settle; outsider cannot act", () => {
    let m = blank({ status: "live", hostReady: true, guestReady: true, lockAt: 1_000_000 + MATCH_LOCK_MS });
    m = applyMatchEvent(m, { type: "tactic", userId: "spy", tactic: "flank", nonce: "x", now: m.createdAt }).match;
    assert.equal(m.hostTactic, null);
    const a = applyMatchEvent(m, { type: "tactic", userId: "user-host", tactic: "flank", nonce: "a", now: m.createdAt + 1 });
    const b = applyMatchEvent(a.match, { type: "tactic", userId: "user-guest", tactic: "hold_line", nonce: "b", now: m.createdAt + 2 });
    assert.equal(b.settle, true);
    assert.equal(b.match.status, "resolving");
  });

  it("lock timeout settles even with one missing tactic", () => {
    const live = blank({
      status: "live",
      hostReady: true,
      guestReady: true,
      hostTactic: "center",
      lockAt: 1_000_000 + 10,
    });
    const tick = applyMatchEvent(live, { type: "tick", now: live.lockAt! + 1 });
    assert.equal(tick.settle, true);
  });

  it("expired open challenge is abandoned, not a fake win", () => {
    const open = blank();
    const tick = applyMatchEvent(open, { type: "tick", now: open.createdAt + MATCH_CHALLENGE_TTL_MS + 1 });
    assert.equal(tick.match.status, "abandoned");
    assert.equal(tick.settle, false);
  });

  it("disconnect after forfeit window yields forfeit settle", () => {
    const live = blank({
      status: "live",
      hostReady: true,
      guestReady: true,
      hostConnectedAt: 1_000_000,
      guestConnectedAt: 1_000_000 + MATCH_FORFEIT_MS + 50_000,
      lockAt: 1_000_000 + 60_000,
    });
    const tick = applyMatchEvent(live, { type: "tick", now: 1_000_000 + MATCH_FORFEIT_MS + 1 });
    assert.equal(tick.settle, true);
    assert.equal(tick.match.forfeitUserId, "user-host");
  });

  it("accept after a long open window does not forfeit the host immediately", () => {
    const open = blank();
    const later = open.createdAt + MATCH_CHALLENGE_TTL_MS - 1_000;
    const acc = applyMatchEvent(open, { type: "accept", userId: "user-guest", now: later });
    assert.equal(acc.match.status, "lobby");
    assert.equal(acc.match.hostConnectedAt, later);
    assert.equal(acc.match.guestConnectedAt, later);
    const tick = applyMatchEvent(acc.match, { type: "tick", now: later + 1_000 });
    assert.notEqual(tick.match.status, "forfeit");
  });

  it("closed match rejects new tactics", () => {
    const done = blank({ status: "done" });
    const step = applyMatchEvent(done, { type: "tactic", userId: "user-host", tactic: "flank", nonce: "z", now: 2 });
    assert.equal(step.error, "match_closed");
  });
});

describe("two-campaign settle (simulated pair, not two live accounts)", () => {
  it("same seed yields mirrored win/loss and army losses on both", () => {
    const host = hostState();
    const guest = guestState();
    const beforeH = landHost(host.army);
    const beforeG = landHost(guest.army);
    const a = settleLiveMatch(host, guest, {
      hostTactic: "artillery",
      guestTactic: "hold_line",
      seed: 99,
      provinceId: host.army.provinceId,
    });
    const b = settleLiveMatch(host, guest, {
      hostTactic: "artillery",
      guestTactic: "hold_line",
      seed: 99,
      provinceId: host.army.provinceId,
    });
    assert.equal(a.report.result, b.report.result);
    assert.equal(a.report.atkPower, b.report.atkPower);
    assert.ok(landHost(a.host.army) <= beforeH);
    assert.ok(landHost(a.guest.army) <= beforeG);
    const guestMirror = a.guest.military.battles[0]?.result;
    if (a.report.result === "win") assert.equal(guestMirror, "loss");
    if (a.report.result === "loss") assert.equal(guestMirror, "win");
  });

  it("forfeit of host is not a host victory", () => {
    const host = hostState();
    const guest = guestState();
    const match = blank({ status: "forfeit", forfeitUserId: "user-host", hostTactic: "center", guestTactic: "hold_line" });
    const pair = settleForfeit(host, guest, match);
    assert.notEqual(winnerUserId(match, pair.report), "user-host");
  });

  it("client cannot pick foe tactic — settle uses match tactics", () => {
    const host = hostState();
    const guest = guestState();
    const match = blank({ hostTactic: "flank", guestTactic: "feint" });
    const tacs = tacticsForSettle(match, host, guest);
    assert.equal(tacs.host, "flank");
    assert.equal(tacs.guest, "feint");
  });
});

describe("challenge guard and public view (no SQL)", () => {
  it("rejects self, blocked, and busy opponents", () => {
    assert.equal(guardChallenge({ selfId: "a", opponentId: "a", blocked: false, selfBusy: false, opponentBusy: false }).ok, false);
    assert.equal(guardChallenge({ selfId: "a", opponentId: "b", blocked: true, selfBusy: false, opponentBusy: false }).ok, false);
    assert.equal(guardChallenge({ selfId: "a", opponentId: "b", blocked: false, selfBusy: true, opponentBusy: false }).ok, false);
    assert.equal(guardChallenge({ selfId: "a", opponentId: "b", blocked: false, selfBusy: false, opponentBusy: true }).ok, false);
    assert.equal(guardChallenge({ selfId: "a", opponentId: "b", blocked: false, selfBusy: false, opponentBusy: false }).ok, true);
  });

  it("reuses only the same pair, not a different opponent", () => {
    const open = blank();
    assert.equal(reuseActiveMatch(open, "user-host", "user-guest")?.id, "match_test");
    assert.equal(reuseActiveMatch(open, "user-host", "other"), null);
  });

  it("does not leak foe tactic or pre-lock seed", () => {
    const live = blank({ status: "open", hostTactic: null, guestTactic: "flank", seed: 999 });
    const view = publicMatchView(live, "user-host");
    assert.equal(view.selfTactic, null);
    assert.equal(view.foeLocked, true);
    assert.equal("guestTactic" in view, false);
    assert.equal(view.seed, null);
    const liveView = publicMatchView(blank({ status: "live", seed: 999 }), "user-host");
    assert.equal(liveView.seed, null);
    const doneView = publicMatchView(blank({ status: "done", seed: 999 }), "user-host");
    assert.equal(doneView.seed, 999);
    const outsider = () => publicMatchView(live, "spy");
    assert.throws(outsider);
  });
});
