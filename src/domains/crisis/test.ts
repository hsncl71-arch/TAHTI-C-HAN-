import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction } from "../world/engine.ts";
import { migrateState } from "../palace/migrate.ts";
import { mulberry32 } from "../ids.ts";
import { CRISIS_KINDS, STATE_VERSION, type GameState } from "../types.ts";
import { computeHeat } from "./heat.ts";
import { crisisByKey, CRISIS_EVENTS, pickCrisisEvent } from "./catalog.ts";
import { CRISIS_HARD, ensureCrisis, pickCrisisKind, tickCrisisYear } from "./tick.ts";
import { eventByKey, spawnYearEvents } from "../events/catalog.ts";
import { plantSeed, recordCrisis } from "./model.ts";
import { tr } from "../../lib/i18n/tr.ts";
import { en } from "../../lib/i18n/en.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "fatih" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "crisis-user");
}

function keysOf(ev: (typeof CRISIS_EVENTS)[number]): string[] {
  return [ev.titleKey, ev.bodyKey, ...ev.choices.flatMap((c) => [c.labelKey, ...(c.hintKey ? [c.hintKey] : [])])];
}

describe("state crises and palace intrigue", () => {
  it("seeds a crisis layer and ten sourced kinds", () => {
    const s = fresh();
    assert.equal(s.version, STATE_VERSION);
    assert.ok(s.crisis);
    assert.ok(CRISIS_EVENTS.length >= 10);
    const kinds = new Set(CRISIS_EVENTS.map((e) => e.kind));
    assert.equal(kinds.size, CRISIS_KINDS.length);
    for (const ev of CRISIS_EVENTS) {
      assert.ok(ev.choices.length >= 3, ev.key);
      assert.ok(crisisByKey(ev.key));
      assert.ok(eventByKey(ev.key), `lookup ${ev.key}`);
    }
  });

  it("has Turkish and English copy for every crisis string", () => {
    const extra = [
      "crisis.kicker",
      "crisis.title",
      "crisis.lead",
      "crisis.memory",
      "crisis.notice.body",
      ...CRISIS_KINDS.map((k) => `crisis.kind.${k}`),
    ];
    for (const ev of CRISIS_EVENTS) {
      for (const key of [...keysOf(ev), ...extra]) {
        assert.ok(tr[key] && tr[key] !== key, `tr ${key}`);
        assert.ok(en[key] && en[key] !== key, `en ${key}`);
      }
    }
    for (const ev of CRISIS_EVENTS) {
      for (const c of ev.choices) {
        const next = c.apply(fresh(), () => 0);
        for (const seed of next.crisis.seeds) {
          assert.ok(tr[seed.titleKey], `tr ${seed.titleKey}`);
          assert.ok(en[seed.titleKey], `en ${seed.titleKey}`);
          assert.ok(tr[seed.bodyKey], `tr ${seed.bodyKey}`);
          assert.ok(en[seed.bodyKey], `en ${seed.bodyKey}`);
        }
      }
    }
  });

  it("computes heat from state, not from a die", () => {
    const a = computeHeat(fresh());
    const b = computeHeat(fresh());
    assert.deepEqual(a, b);
    assert.ok(a.janissary >= 0);
  });

  it("past crush decisions raise revolt heat", () => {
    const base = fresh();
    const crushed: GameState = {
      ...base,
      taxRate: 0.22,
      economy: { ...base.economy, revoltRisk: 70, people: { ...base.economy.people, taxPressure: 80, allegiance: 32 } },
      provinces: base.provinces.map((p) =>
        p.ownerId === base.realm.id ? { ...p, unrest: 72, loyalty: 28 } : p,
      ),
      decisions: [
        ...(base.decisions ?? []),
        { id: "d1", year: base.year, kind: "reaya_isyan", titleKey: "ev.reaya_isyan.title", choiceId: "crush" },
        { id: "d2", year: base.year, kind: "crisis_revolt", titleKey: "crisis.revolt.title", choiceId: "steel" },
      ],
    };
    const calm = computeHeat(fresh());
    const hot = computeHeat(crushed);
    assert.ok(hot.revolt > calm.revolt + 15, `${hot.revolt} vs ${calm.revolt}`);
  });

  it("does not fire a crisis when heat is low", () => {
    let s = ensureCrisis(fresh());
    s = { ...s, crisis: { ...s.crisis, heat: { ...s.crisis.heat, revolt: 8, janissary: 8, palace: 5, rivalry: 5, spy: 5, agent: 5, economy: 5, claim: 5, diplomatic: 5, commander: 5 } } };
    const kind = pickCrisisKind(s, () => 0.99);
    assert.equal(kind, null);
  });

  it("fires the hottest eligible crisis when heat is hard", () => {
    let s = ensureCrisis(fresh());
    s = {
      ...s,
      taxRate: 0.22,
      economy: { ...s.economy, revoltRisk: 82, people: { ...s.economy.people, taxPressure: 84, allegiance: 28 } },
      provinces: s.provinces.map((p) => (p.ownerId === s.realm.id ? { ...p, unrest: 80, loyalty: 24 } : p)),
      crisis: { ...s.crisis, lastFired: {} },
    };
    s = ensureCrisis(s);
    assert.ok(s.crisis.heat.revolt >= CRISIS_HARD, `heat ${s.crisis.heat.revolt}`);
    const kind = pickCrisisKind(s, () => 0.99);
    assert.equal(kind, "revolt");
    const fired = tickCrisisYear(s, () => 0.99);
    assert.ok(fired.pendingEvents.some((e) => e.key === "crisis_revolt"));
    assert.ok(fired.world.notices.some((n) => n.titleKey === "crisis.revolt.title"));
  });

  it("each crisis has three real state-changing paths", () => {
    const s = fresh();
    for (const ev of CRISIS_EVENTS) {
      const seen = new Set<string>();
      for (const c of ev.choices) {
        const next = c.apply(s, () => 0.1);
        assert.notEqual(next, s);
        const sig = JSON.stringify({
          t: next.treasury,
          st: next.stability,
          seeds: next.crisis.seeds.map((x) => x.fromKey),
          army: next.army.morale,
          intrigue: next.harem?.intrigue,
        });
        seen.add(sig);
      }
      assert.equal(seen.size, ev.choices.length, ev.key);
    }
  });

  it("a steel revolt plants a seed that ripens years later into a new ruling", () => {
    let s = fresh();
    const def = crisisByKey("crisis_revolt")!;
    s = def.choices.find((c) => c.id === "steel")!.apply(s, () => 0);
    s = recordCrisis(s, "revolt", "crisis_revolt", "steel");
    const seed = s.crisis.seeds.find((x) => x.fromKey === "crisis_revolt:steel");
    assert.ok(seed);
    assert.equal(seed!.ripeYear, s.year + 4);
    assert.equal(seed!.sequel, true);
    const unrestBefore = s.provinces.filter((p) => p.ownerId === s.realm.id).reduce((a, p) => a + p.unrest, 0);
    const later = tickCrisisYear({ ...s, year: seed!.ripeYear, pendingEvents: [] }, () => 0);
    const unrestAfter = later.provinces.filter((p) => p.ownerId === later.realm.id).reduce((a, p) => a + p.unrest, 0);
    assert.ok(unrestAfter > unrestBefore, "blood memory should sour the land");
    assert.ok(later.chronicle.some((c) => c.titleKey === "crisis.seed.blood.title"));
    assert.equal(later.crisis.seeds.filter((x) => x.id === seed!.id).length, 0);
    assert.ok(later.pendingEvents.some((e) => e.key.startsWith("crisis_")), "the old ruling returns as a new crisis");
  });

  it("a funded spy net harvests without forcing a new crisis", () => {
    let s = fresh();
    s = crisisByKey("crisis_spy")!.choices.find((c) => c.id === "fund")!.apply(s, () => 0);
    const seed = s.crisis.seeds.find((x) => x.fromKey === "crisis_spy:fund");
    assert.ok(seed);
    assert.equal(seed!.sequel, false);
    const lastFired = Object.fromEntries(CRISIS_KINDS.map((k) => [k, seed!.ripeYear])) as GameState["crisis"]["lastFired"];
    const later = tickCrisisYear(
      { ...s, year: seed!.ripeYear, pendingEvents: [], crisis: { ...s.crisis, lastFired } },
      () => 0,
    );
    assert.ok(later.chronicle.some((c) => c.titleKey === "crisis.seed.intel.title"));
    assert.equal(later.pendingEvents.filter((e) => e.key.startsWith("crisis_")).length, 0);
  });

  it("turning an agent depends on the nişancı, not a storyteller", () => {
    const s = fresh();
    const nis = s.npcs.find((n) => n.office === "nisanci");
    const skilled: GameState = {
      ...s,
      npcs: s.npcs.map((n) => (nis && n.id === nis.id ? { ...n, competence: 80 } : n)),
    };
    const weak: GameState = {
      ...s,
      npcs: s.npcs.map((n) => (nis && n.id === nis.id ? { ...n, competence: 30 } : n)),
    };
    const turn = crisisByKey("crisis_agent")!.choices.find((c) => c.id === "turn")!;
    const a = turn.apply(skilled, () => 0);
    const b = turn.apply(weak, () => 0);
    assert.ok(a.crisis.seeds.some((x) => x.fromKey === "crisis_agent:turn" && x.sequel === false));
    assert.ok(b.crisis.seeds.some((x) => x.fromKey === "crisis_agent:turn_fail" && x.sequel === true));
  });

  it("palace letter variant is gated on an adult prince", () => {
    const s = fresh();
    const letter = crisisByKey("crisis_palace_letter")!;
    const adult: GameState = {
      ...s,
      members: s.members.map((m) => (m.role === "sehzade" ? { ...m, birthYear: s.year - 18 } : m)),
    };
    assert.equal(letter.when?.(s), false);
    assert.ok(letter.when?.(adult));
    const picked = pickCrisisEvent(
      { ...s, members: s.members.map((m) => (m.role === "sehzade" ? { ...m, alive: false } : m)), harem: { ...s.harem, intrigue: 10 } },
      "palace",
      () => 0,
    );
    assert.equal(picked.key, "crisis_palace");
  });

  it("migrate fills crisis on a v12 snapshot", () => {
    const raw = { ...fresh(), version: 12, crisis: undefined as unknown as GameState["crisis"] };
    const next = migrateState(raw);
    assert.equal(next.version, STATE_VERSION);
    assert.ok(next.crisis);
    assert.equal(typeof next.crisis.heat.revolt, "number");
  });

  it("tick is deterministic for the same seed", () => {
    const s = fresh();
    const a = tickCrisisYear(s, mulberry32(99));
    const b = tickCrisisYear(s, mulberry32(99));
    assert.deepEqual(a.crisis.heat, b.crisis.heat);
    assert.deepEqual(
      a.pendingEvents.map((e) => e.key),
      b.pendingEvents.map((e) => e.key),
    );
  });

  it("RESOLVE_EVENT records the crisis choice into the log", () => {
    let s = fresh();
    s = {
      ...s,
      pendingEvents: [{ id: "ev_test", key: "crisis_janissary", year: s.year, payload: {} }, ...s.pendingEvents],
    };
    const next = applyAction(s, { type: "RESOLVE_EVENT", eventId: "ev_test", choiceId: "refuse" }).state;
    assert.ok(next.crisis.log.some((r) => r.kind === "janissary" && r.choiceId === "refuse"));
    assert.ok(next.crisis.seeds.some((x) => x.fromKey === "crisis_janissary:refuse"));
  });

  it("plantSeed is idempotent for the same year and choice", () => {
    const s = fresh();
    const once = plantSeed(s, {
      kind: "spy",
      plantedYear: s.year,
      ripeYear: s.year + 2,
      fromKey: "crisis_spy:fund",
      payload: {},
      titleKey: "crisis.seed.intel.title",
      bodyKey: "crisis.seed.intel.body",
    });
    const twice = plantSeed(once, {
      kind: "spy",
      plantedYear: s.year,
      ripeYear: s.year + 2,
      fromKey: "crisis_spy:fund",
      payload: {},
      titleKey: "crisis.seed.intel.title",
      bodyKey: "crisis.seed.intel.body",
    });
    assert.equal(twice.crisis.seeds.filter((x) => x.fromKey === "crisis_spy:fund").length, 1);
  });

  it("does not stack a flavor rising on top of a revolt crisis", () => {
    const s = {
      ...fresh(),
      pendingEvents: [{ id: "ev_cr", key: "crisis_revolt", year: 1453, payload: {} }],
      economy: { ...fresh().economy, revoltRisk: 80 },
    };
    const spawned = spawnYearEvents(s, () => 0.01);
    assert.equal(spawned.some((e) => e.key === "reaya_isyan"), false);
  });
});
