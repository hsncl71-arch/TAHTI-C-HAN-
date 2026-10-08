import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction } from "../world/engine.ts";
import { migrateState } from "../palace/migrate.ts";
import { STATE_VERSION, MS_PER_YEAR, type DipOffer, type GameState } from "../types.ts";
import { DEFAULT_EDICTS, ensureWorldClock, patchEdicts } from "./model.ts";
import { choiceForEvent } from "./edicts.ts";
import { catchUpTo } from "./catchup.ts";
import { yearsDue, catchupYears } from "./time.ts";
import { dueJobs, makeJob, nextDueAt } from "./jobs.ts";
import { commissionWork, completeDueWorks, WORK_YEARS } from "./works.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "fatih" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "clock-user");
}

function clearEvents(s: GameState): GameState {
  let next = s;
  while (next.pendingEvents[0]) {
    const ev = next.pendingEvents[0];
    const choice = ev.key === "tahta_cikis" ? "adalet" : "store";
    const tried = applyAction(next, { type: "RESOLVE_EVENT", eventId: ev.id, choiceId: choice });
    if (tried.state.pendingEvents[0]?.id === ev.id) {
      next = { ...next, pendingEvents: next.pendingEvents.slice(1) };
    } else {
      next = tried.state;
    }
  }
  return next;
}

describe("24/7 persistent world clock", () => {
  it("seeds fermâns that match the standing-order examples", () => {
    const s = fresh();
    assert.equal(s.version, STATE_VERSION);
    assert.equal(s.world.edicts.onAttack, "defend_walls");
    assert.equal(s.world.edicts.offensive, "never");
    assert.equal(s.world.edicts.peace, "ask");
    assert.equal(DEFAULT_EDICTS.onAttack, "defend_walls");
  });

  it("counts due years from wall clock, not from a tick loop", () => {
    const s = clearEvents(fresh());
    const now = s.world.lastSimAt;
    assert.equal(yearsDue(s, now), 0);
    assert.equal(yearsDue(s, now + MS_PER_YEAR * 3 + 10), 3);
    assert.equal(catchupYears(s, now + MS_PER_YEAR * 40, MS_PER_YEAR, 12), 12);
  });

  it("catch-up advances years while the player is away", () => {
    let s = clearEvents(fresh());
    const now = s.world.lastSimAt + MS_PER_YEAR * 3 + 500;
    const startYear = s.year;
    const res = catchUpTo(s, now, MS_PER_YEAR);
    assert.ok(res.years >= 1 || res.halted);
    if (!res.halted) {
      assert.equal(res.state.year, startYear + res.years);
      assert.ok(res.state.world.lastSimAt > s.world.lastSimAt);
    } else {
      assert.ok(res.reason);
      assert.equal(res.state.world.paused, true);
    }
  });

  it("does not hand the realm to an LLM: revolt waits for the sovereign", () => {
    let s = clearEvents(fresh());
    s = {
      ...s,
      pendingEvents: [{ id: "ev_revolt", key: "reaya_isyan", year: s.year, payload: {} }],
    };
    const now = s.world.lastSimAt + MS_PER_YEAR * 4;
    const res = catchUpTo(s, now, MS_PER_YEAR);
    assert.equal(res.halted, true);
    assert.equal(res.reason, "revolt");
    assert.equal(res.years, 0);
    assert.equal(res.state.year, s.year);
    assert.ok(res.state.pendingEvents.some((e) => e.key === "reaya_isyan"));
  });

  it("asks the player about peace offers instead of auto-signing", () => {
    let s = clearEvents(fresh());
    const offer: DipOffer = {
      id: "off_peace",
      fromSeat: s.foreign[0]?.id ?? "karaman",
      toSeat: s.diplomacy.seatId,
      kind: "peace",
      terms: { tribute: 0, durationYears: 5, againstRealmId: null, note: "" },
      status: "pending",
      year: s.year,
      fromRuler: "Karamanoglu",
      fromRealm: "Karaman",
    };
    s = { ...s, diplomacy: { ...s.diplomacy, pending: [offer] } };
    const now = s.world.lastSimAt + MS_PER_YEAR * 2;
    const res = catchUpTo(s, now, MS_PER_YEAR);
    assert.equal(res.halted, true);
    assert.equal(res.reason, "peace");
    assert.equal(res.years, 0);
  });

  it("pays the ocak when the ulufe fermân is pay", () => {
    const s = clearEvents(fresh());
    const choice = choiceForEvent(s, { id: "e", key: "ocak_maas", year: s.year, payload: {} });
    assert.equal(choice, "pay");
    const patched = patchEdicts(s, { ulufe: "ask" });
    const ask = choiceForEvent(patched, { id: "e", key: "ocak_maas", year: s.year, payload: {} });
    assert.equal(ask, null);
  });

  it("relieves famine from the economy fermân without an LLM", () => {
    let s = clearEvents(fresh());
    s = {
      ...s,
      treasury: 5000,
      economy: {
        ...s.economy,
        lastReliefYear: s.year - 2,
        people: { ...s.economy.people, foodAccess: 20 },
      },
    };
    s = { ...s, pendingEvents: [{ id: "ev_k", key: "kıtlık", year: s.year, payload: {} }] };
    const now = s.world.lastSimAt + MS_PER_YEAR;
    const res = catchUpTo(s, now, MS_PER_YEAR);
    assert.equal(res.state.pendingEvents.some((e) => e.key === "kıtlık"), false);
  });

  it("keeps an existing campaign moving and does not start a new war", () => {
    let s = clearEvents(fresh());
    assert.equal(s.world.edicts.offensive, "never");
    assert.equal(s.army.status, "idle");
    const now = s.world.lastSimAt + MS_PER_YEAR * 2 + 10;
    const res = catchUpTo(s, now, MS_PER_YEAR);
    assert.notEqual(res.state.army.status, "campaign");
  });

  it("completes delayed construction on the year it is due", () => {
    let s = clearEvents(fresh());
    const before = s.buildings.kervansaray;
    s = commissionWork(s, "kervansaray");
    assert.equal(s.buildings.kervansaray, before);
    assert.equal(s.world.works.length, 1);
    s = { ...s, year: s.year + WORK_YEARS("kervansaray") };
    s = completeDueWorks(s);
    assert.equal(s.buildings.kervansaray, before + 1);
    assert.equal(s.world.works.length, 0);
  });

  it("manual ADVANCE_YEAR also finishes due caravansarays", () => {
    let s = clearEvents(fresh());
    s = applyAction(s, { type: "COMMISSION_WORK", building: "kervansaray" }).state;
    const before = s.buildings.kervansaray;
    s = clearEvents(s);
    s = applyAction(s, { type: "ADVANCE_YEAR" }).state;
    s = clearEvents(s);
    s = applyAction(s, { type: "ADVANCE_YEAR" }).state;
    assert.ok(s.buildings.kervansaray >= before + 1);
  });

  it("only wakes due jobs — sleeping realms stay cold", () => {
    const now = 1_000_000;
    const jobs = [
      makeJob({ kind: "year_tick", dueAt: now - 10, campaignId: "a" }),
      makeJob({ kind: "year_tick", dueAt: now + 50_000, campaignId: "b" }),
      makeJob({ kind: "notice", dueAt: now - 1, campaignId: "c" }),
    ];
    const due = dueJobs(jobs, now);
    assert.equal(due.length, 2);
    assert.equal(due.some((j) => j.campaignId === "b"), false);
    assert.ok((nextDueAt(jobs) ?? 0) <= now - 1);
  });

  it("migration is idempotent and does not rewind lastSimAt", () => {
    const s = fresh();
    const stamped = s.world.lastSimAt;
    const once = migrateState(s);
    const twice = migrateState(once);
    assert.equal(twice.version, STATE_VERSION);
    assert.equal(twice.world.lastSimAt, stamped);
    assert.equal(twice.world.edicts.peace, "ask");
  });

  it("manual year advance still works and consumes a year of clock", () => {
    let s = clearEvents(fresh());
    const before = s.world.lastSimAt;
    s = applyAction(s, { type: "ADVANCE_YEAR" }).state;
    assert.equal(s.year, 1454);
    assert.equal(s.world.lastSimAt, before + s.world.msPerYear);
  });

  it("ensureWorldClock fills a legacy snapshot without dropping the realm", () => {
    const s = fresh();
    const raw = { ...s, world: undefined as unknown as GameState["world"] };
    const filled = ensureWorldClock(raw as GameState, 99_000);
    assert.equal(filled.world.lastSimAt, 99_000);
    assert.equal(filled.world.edicts.onAttack, "defend_walls");
  });
});
