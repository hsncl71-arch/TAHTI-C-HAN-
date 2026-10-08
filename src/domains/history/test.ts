import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction } from "../world/engine.ts";
import { migrateState } from "../palace/migrate.ts";
import { STATE_VERSION, type GameState } from "../types.ts";
import { CANON_FACTS, canonOwnersAt, everyCanonFactIsSourced, startingOwners } from "./canon.ts";
import { CANON_SOURCES } from "./sources.ts";
import { ensureHistory, holderSeat, playerSeatId } from "./model.ts";
import { historyCounselNote, syncHistory } from "./engine.ts";
import { counselSystemPrompt } from "../npc/counsel.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "fatih" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "history-user");
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

describe("alternative history engine", () => {
  it("every canon fact cites a known source", () => {
    assert.equal(everyCanonFactIsSourced(), true);
    for (const f of CANON_FACTS) {
      assert.ok(f.sources.length >= 1, f.id);
      for (const id of f.sources) assert.ok(CANON_SOURCES[id], `${f.id} → ${id}`);
    }
  });

  it("seeds two lanes and does not copy canon into the living world", () => {
    const s = fresh();
    assert.equal(s.version, STATE_VERSION);
    assert.ok(s.history);
    assert.ok(s.history.playerEvents.some((e) => e.kind === "coronation"));
    const trab = s.provinces.find((p) => p.id === "trabzon")!;
    assert.notEqual(trab.ownerId, s.realm.id);
    assert.equal(holderSeat(s, "trabzon"), "trabzon");
    assert.equal(startingOwners().trabzon, "trabzon");
    assert.equal(canonOwnersAt(1461).trabzon, "osmanli");
    assert.equal(canonOwnersAt(1460).trabzon, "trabzon");
  });

  it("year ticks never apply a canon conquest", () => {
    let s = clearEvents(fresh());
    const before = s.provinces.find((p) => p.id === "belgrad")!.ownerId;
    s = applyAction(s, { type: "ADVANCE_YEAR" }).state;
    s = clearEvents(s);
    assert.equal(s.provinces.find((p) => p.id === "belgrad")!.ownerId, before);
    assert.notEqual(before, s.realm.id);
  });

  it("marks a missed historical siege when the year passes and the player did nothing", () => {
    let s = fresh();
    s = { ...s, year: 1457 };
    s = syncHistory(s, "test");
    const d = s.history.divergences.find((x) => x.canonId === "siege_1456_belgrad");
    assert.ok(d, "expected missed 1456 Belgrade");
    assert.equal(d!.kind, "missed");
    assert.notEqual(s.provinces.find((p) => p.id === "belgrad")!.ownerId, s.realm.id);
  });

  it("taking Trabzon before 1461 is early alternative history", () => {
    let s = fresh();
    s = {
      ...s,
      provinces: s.provinces.map((p) => (p.id === "trabzon" ? { ...p, ownerId: s.realm.id } : p)),
    };
    s = syncHistory(s, "test");
    s = syncHistory(s, "test");
    const d = s.history.divergences.find((x) => x.canonId === "conquest_1461_trabzon");
    assert.equal(d?.kind, "early");
    assert.ok(s.history.playerEvents.some((e) => e.kind === "conquest" && e.provinceId === "trabzon"));
  });

  it("taking a city after the canon year is late, not forced", () => {
    let s = fresh();
    s = { ...s, year: 1470 };
    s = syncHistory(s, "test");
    assert.equal(s.history.divergences.find((x) => x.canonId === "conquest_1461_trabzon")?.kind, "missed");
    s = {
      ...s,
      provinces: s.provinces.map((p) => (p.id === "trabzon" ? { ...p, ownerId: s.realm.id } : p)),
    };
    s = syncHistory(s, "test");
    assert.equal(s.history.divergences.find((x) => x.canonId === "conquest_1461_trabzon")?.kind, "late");
  });

  it("a successful 1456 Belgrade is contrary to the sourced failed siege", () => {
    let s = fresh();
    s = { ...s, year: 1456 };
    s = syncHistory(s, "hydrate");
    s = {
      ...s,
      provinces: s.provinces.map((p) => (p.id === "belgrad" ? { ...p, ownerId: s.realm.id } : p)),
    };
    s = syncHistory(s, "test");
    const d = s.history.divergences.find((x) => x.canonId === "siege_1456_belgrad");
    assert.equal(d?.kind, "contrary");
  });

  it("a different treaty than 1479 Venice peace is contrary", () => {
    let s = fresh();
    s = {
      ...s,
      year: 1480,
      relations: s.relations.map((r) => (r.realmId === "venedik" ? { ...r, treaty: "war" as const } : r)),
    };
    s = syncHistory(s, "test");
    const d = s.history.divergences.find((x) => x.canonId === "treaty_1479_venice");
    assert.equal(d?.kind, "contrary");
  });

  it("succession in a custom house diverges from sourced Ottoman names", () => {
    let s = fresh();
    s = { ...s, year: 1481 };
    s = syncHistory(s, "test");
    const d = s.history.divergences.find((x) => x.canonId === "succession_1481_bayezid");
    assert.equal(d?.kind, "contrary");
    assert.equal(s.ruler.givenName, "Alparslan");
  });

  it("sync is deterministic and does not rewrite ownership", () => {
    let s = fresh();
    s = { ...s, year: 1462 };
    const a = syncHistory(s, "test");
    const b = syncHistory(s, "test");
    assert.deepEqual(a.history.divergences, b.history.divergences);
    assert.deepEqual(
      a.provinces.map((p) => p.ownerId),
      s.provinces.map((p) => p.ownerId),
    );
  });

  it("migrates v11 saves into a history lane without inventing conquests", () => {
    const raw = fresh();
    const stripped = { ...raw, version: 11, history: undefined as unknown as GameState["history"] };
    const next = migrateState(stripped);
    assert.equal(next.version, STATE_VERSION);
    assert.ok(next.history.playerEvents.some((e) => e.kind === "coronation"));
    assert.equal(holderSeat(next, "kahire"), "memluk");
    assert.equal(playerSeatId(next), "osmanli");
  });

  it("NPC counsel is forbidden from inventing canon", () => {
    const s = fresh();
    const note = historyCounselNote(s);
    assert.match(note, /Do not invent/);
    assert.match(note, /PLAYER TIMELINE/);
    assert.match(note, /NOT the player's fate/);
    const prompt = counselSystemPrompt(s, "nisanci", "tr");
    assert.match(prompt, /Do not invent/);
    assert.match(prompt, /alternative history/);
  });

  it("ensureHistory is idempotent", () => {
    const s = ensureHistory(ensureHistory(fresh()));
    assert.equal(s.history.lastSyncYear, s.year);
  });
});
