import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction } from "../world/engine.ts";
import { migrateState } from "../palace/migrate.ts";
import { STATE_VERSION, type GameState, type SiegeOutcome } from "../types.ts";
import { beginSiege, resolveSiegeAction, stormFort } from "./campaign.ts";
import {
  applySiegeAction,
  attachSiegeCinema,
  cinemaBeatsFor,
  defenseFromProvince,
  dismissSiegeCinema,
  ensureSiege,
  makeSiegeCinema,
  openSiegeState,
  siegeProgressOf,
  simulateSiegeAction,
} from "./siege.ts";
import { mulberry32 } from "../ids.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "fatih" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "siege-user");
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

function atKonya(s: GameState): GameState {
  const konya = s.provinces.find((p) => p.id === "konya")!;
  const opened = beginSiege(
    {
      ...s,
      army: { ...s.army, provinceId: "ankara", status: "siege" },
      campaign: {
        targetProvinceId: "konya",
        startYear: s.year,
        progress: 100,
        route: ["ankara", "konya"],
        routeIndex: 1,
        phase: "siege",
        siegeProgress: 8,
        weather: "fair",
        lastReportId: null,
      },
    },
    konya,
  );
  return opened;
}

describe("fetih and siege engine", () => {
  it("seeds version 8 with an empty siege slot", () => {
    const s = fresh();
    assert.equal(s.version, STATE_VERSION);
    assert.equal(s.siege, null);
  });

  it("builds city defence from walls, gates, garrison, grain and morale", () => {
    const s = fresh();
    const konya = s.provinces.find((p) => p.id === "konya")!;
    const d = defenseFromProvince(konya);
    assert.ok(d.walls > 40);
    assert.ok(d.gates > 30);
    assert.ok(d.garrison >= konya.manpower);
    assert.ok(d.provisions > 20);
    assert.ok(d.morale > 20);
    assert.ok(d.defense > 20);
  });

  it("opens a living siege instead of a progress bar", () => {
    const s = atKonya(clearEvents(fresh()));
    assert.ok(s.siege);
    assert.equal(s.siege?.provinceId, "konya");
    assert.equal(s.siege?.phase, "invest");
    assert.equal(s.siege?.outcome, null);
    assert.equal(s.siege?.cinema, null);
    assert.ok(s.siege!.host.artillery >= 0);
    assert.ok(s.siege!.host.men > 1000);
    assert.ok(s.campaign?.siegeProgress === siegeProgressOf(s.siege!));
  });

  it("bombard lowers walls and costs supply, deterministically", () => {
    const s = atKonya(clearEvents(fresh()));
    const a = simulateSiegeAction(s, "bombard", mulberry32(11));
    const b = simulateSiegeAction(s, "bombard", mulberry32(11));
    assert.equal(a.siege.defense.walls, b.siege.defense.walls);
    assert.ok(a.siege.defense.walls < s.siege!.defense.walls);
    assert.ok(a.army.supply < s.army.supply);
    assert.ok(a.siege.host.preparation > s.siege!.host.preparation);
  });

  it("starve drains provisions without touching cinema", () => {
    const s = atKonya(clearEvents(fresh()));
    const next = applySiegeAction(s, "starve", mulberry32(3));
    assert.ok(next.siege);
    assert.ok(next.siege!.defense.provisions < s.siege!.defense.provisions);
    assert.equal(next.siege!.cinema, null);
  });

  it("storm writes a battle report from the simulation", () => {
    const s = atKonya(clearEvents(fresh()));
    const stormed = stormFort(s, mulberry32(99));
    assert.ok(stormed.military.battles.length >= 1);
    assert.equal(stormed.military.battles[0]?.kind, "siege");
    assert.ok(stormed.siege);
  });

  it("attaches cinema only after an outcome exists", () => {
    const s = atKonya(clearEvents(fresh()));
    assert.equal(makeSiegeCinema(s, s.siege!), null);
    const withOutcome: GameState = {
      ...s,
      siege: { ...s.siege!, outcome: "captured", phase: "resolved" },
    };
    const filmed = attachSiegeCinema(withOutcome);
    assert.equal(filmed.siege?.outcome, "captured");
    assert.ok(filmed.siege?.cinema);
    assert.equal(filmed.siege?.cinema?.outcome, "captured");
    assert.ok(filmed.siege!.cinema!.beats.includes("victory"));
    assert.ok(!filmed.siege!.cinema!.beats.includes("defeat"));
  });

  it("never puts a victory beat on a lost siege", () => {
    const loss: SiegeOutcome[] = ["repulsed", "abandoned"];
    for (const o of loss) {
      const beats = cinemaBeatsFor(o, true, true);
      assert.ok(!beats.includes("victory"));
      assert.ok(beats.includes("defeat"));
    }
    const win = cinemaBeatsFor("captured", true, true);
    assert.ok(win.includes("victory"));
    assert.ok(!win.includes("defeat"));
  });

  it("does not let cinema rewrite the counted result", () => {
    let s = atKonya(clearEvents(fresh()));
    s = {
      ...s,
      siege: { ...s.siege!, outcome: "repulsed", phase: "resolved", atkPower: 1200, defPower: 4000 },
    };
    const filmed = attachSiegeCinema(s);
    assert.equal(filmed.siege?.outcome, "repulsed");
    assert.equal(filmed.siege?.cinema?.atkPower, 1200);
    assert.equal(filmed.siege?.cinema?.defPower, 4000);
    const skipped = applyAction(filmed, { type: "SKIP_SIEGE_CINEMA" }).state;
    assert.equal(skipped.siege, null);
    assert.equal(skipped.provinces.find((p) => p.id === "konya")?.ownerId, "karaman");
  });

  it("collapses a starved fort without a cinematic deciding it", () => {
    let s = atKonya(clearEvents(fresh()));
    s = {
      ...s,
      siege: {
        ...s.siege!,
        defense: { ...s.siege!.defense, provisions: 9, morale: 22, garrison: 300 },
      },
    };
    const next = resolveSiegeAction(s, "starve", mulberry32(2));
    assert.ok(next.siege?.outcome === "starved" || next.siege?.outcome === "surrender" || next.siege?.outcome === "captured");
    assert.ok(next.siege?.cinema);
    assert.equal(next.siege?.cinema?.outcome, next.siege?.outcome);
    assert.equal(next.provinces.find((p) => p.id === "konya")?.ownerId, s.realm.id);
  });

  it("inherits treasury, army remnant and wars when the city falls", () => {
    let s = atKonya(clearEvents(fresh()));
    const treasury = s.treasury;
    s = {
      ...s,
      siege: {
        ...s.siege!,
        defense: { ...s.siege!.defense, walls: 6, gates: 6, garrison: 40, morale: 12, provisions: 10 },
      },
    };
    const next = resolveSiegeAction(s, "storm", mulberry32(4));
    assert.ok(next.siege?.outcome === "captured" || next.siege?.outcome === "surrender" || next.siege?.outcome === "starved");
    assert.ok(next.treasury >= treasury);
    assert.ok(next.ledger.some((l) => l.noteKey === "ledger.loot") || next.siege?.outcome === "starved");
    assert.ok(next.army.janissary >= 0);
    const rel = next.relations.find((r) => r.realmId === "karaman");
    assert.equal(rel?.treaty, "war");
    assert.equal(next.provinces.find((p) => p.id === "konya")?.ownerId, s.realm.id);
  });

  it("keeps the player blocked until the representative scene is dismissed", () => {
    let s = atKonya(clearEvents(fresh()));
    s = {
      ...s,
      siege: { ...s.siege!, outcome: "captured", phase: "resolved" },
    };
    s = attachSiegeCinema(s);
    const year = s.year;
    const blocked = applyAction(s, { type: "ADVANCE_YEAR" }).state;
    assert.equal(blocked.year, year);
    const stepped = applyAction(s, { type: "ADVANCE_SIEGE_CINEMA" }).state;
    assert.ok(stepped.siege?.cinema);
    assert.ok((stepped.siege?.cinema?.index ?? 0) >= 1 || stepped.siege === null);
  });

  it("hydrates a v7 siege campaign onto walls and gates", () => {
    const s = fresh();
    const raw = JSON.parse(JSON.stringify(s)) as GameState;
    raw.version = 7;
    delete (raw as { siege?: unknown }).siege;
    raw.army = { ...raw.army, status: "siege", provinceId: "konya" };
    raw.campaign = {
      targetProvinceId: "konya",
      startYear: raw.year,
      progress: 100,
      route: ["ankara", "konya"],
      routeIndex: 1,
      phase: "siege",
      siegeProgress: 40,
      weather: "fair",
      lastReportId: null,
    };
    const migrated = migrateState(raw);
    assert.equal(migrated.version, STATE_VERSION);
    assert.ok(migrated.siege);
    assert.equal(migrated.siege?.provinceId, "konya");
    assert.ok(migrated.siege!.defense.walls < 100);
    const twice = migrateState(migrated);
    assert.equal(twice.siege?.provinceId, migrated.siege?.provinceId);
    assert.equal(Math.round(twice.siege!.defense.walls), Math.round(migrated.siege!.defense.walls));
  });

  it("is the same siege for the same seed", () => {
    const s = atKonya(clearEvents(fresh()));
    const a = applySiegeAction(s, "bombard", mulberry32(21));
    const b = applySiegeAction(s, "bombard", mulberry32(21));
    assert.equal(a.siege?.defense.walls, b.siege?.defense.walls);
    assert.equal(a.army.supply, b.army.supply);
  });

  it("dismisses the scene without changing who holds the city", () => {
    let s = atKonya(clearEvents(fresh()));
    s = {
      ...s,
      provinces: s.provinces.map((p) => (p.id === "konya" ? { ...p, ownerId: s.realm.id } : p)),
      siege: { ...s.siege!, outcome: "captured", phase: "resolved" },
    };
    s = attachSiegeCinema(s);
    const next = dismissSiegeCinema(s);
    assert.equal(next.siege, null);
    assert.equal(next.provinces.find((p) => p.id === "konya")?.ownerId, s.realm.id);
  });

  it("ensureSiege is idempotent on an open investment", () => {
    const s = atKonya(clearEvents(fresh()));
    const once = ensureSiege(s);
    const twice = ensureSiege(once);
    assert.equal(once.siege?.provinceId, twice.siege?.provinceId);
    assert.equal(Math.round(once.siege!.defense.walls), Math.round(twice.siege!.defense.walls));
  });
});
