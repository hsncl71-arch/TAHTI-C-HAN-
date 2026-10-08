import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction } from "../world/engine.ts";
import { START_YEAR, type GameState } from "../types.ts";
import { drainModals, playYears, playYear } from "../integration/play.ts";
import {
  difficultyFactor,
  ensureGovernance,
  incomeGovernanceFactor,
  populationFactor,
  realmPopulation,
} from "./model.ts";
import { investKind, proposePeace, setTaxBand, spyRealm, suppressRevolt, enactReform } from "./actions.ts";
import { slotAcceptable } from "./slot.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "fatih" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "gov-user");
}

function opened(): GameState {
  return drainModals(fresh());
}

function atWar(s: GameState, realmId: string, score: number): GameState {
  const next = ensureGovernance(s);
  return {
    ...next,
    relations: next.relations.map((r) => (r.realmId === realmId ? { ...r, treaty: "war" } : r)),
    governance: { ...next.governance, warScore: { ...next.governance.warScore, [realmId]: score } },
  };
}

function borderLand(s: GameState): { realmId: string; provinceId: string } | null {
  for (const p of s.provinces) {
    if (p.ownerId === s.realm.id) continue;
    const touches = p.neighbors.some((id) => s.provinces.find((x) => x.id === id)?.ownerId === s.realm.id);
    if (touches) return { realmId: p.ownerId, provinceId: p.id };
  }
  return null;
}

function finiteState(s: GameState) {
  assert.ok(Number.isFinite(s.treasury), "treasury");
  assert.ok(Number.isFinite(s.prestige), "prestige");
  assert.ok(Number.isFinite(s.stability), "stability");
  assert.ok(Number.isFinite(realmPopulation(s)), "population");
  for (const p of s.provinces) {
    assert.ok(Number.isFinite(p.loyalty) && Number.isFinite(p.unrest) && Number.isFinite(p.manpower));
    const pop = s.governance.population[p.id];
    assert.ok(typeof pop === "number" && Number.isFinite(pop) && pop >= 800 && pop <= 2_000_000);
  }
}

describe("governance", () => {
  it("keeps the seeded tax, difficulty and population identity", () => {
    const s = fresh();
    assert.equal(s.taxRate, 0.12);
    assert.equal(s.governance.taxBand, "normal");
    assert.equal(s.governance.difficulty, "nizam");
    assert.equal(difficultyFactor(s), 1);
    assert.equal(incomeGovernanceFactor(s), 1);
    const home = s.provinces.find((p) => p.ownerId === s.realm.id)!;
    assert.equal(populationFactor(s, home.id, home.manpower, home.development), 1);
    assert.ok(s.provinces.length >= 30);
    assert.equal(new Set(s.provinces.map((p) => p.id)).size, s.provinces.length);
  });

  it("sets tax bands and makes a war levy heavier than a light levy", () => {
    const base = opened();
    const low = setTaxBand(base, "dusuk");
    const high = setTaxBand(base, "harp");
    assert.equal(low.taxRate, 0.08);
    assert.equal(low.governance.taxBand, "dusuk");
    assert.equal(high.taxRate, 0.22);
    assert.equal(high.governance.taxBand, "harp");
    assert.equal(low.chronicle[0]?.titleKey, "log.taxband.title");
    const lowYear = playYear(low);
    const highYear = playYear(high);
    assert.ok(highYear.economy.people.taxPressure > lowYear.economy.people.taxPressure);
  });

  it("raises trade with a market and spends gold only once", () => {
    const s = opened();
    const home = s.provinces.find((p) => p.ownerId === s.realm.id)!;
    const next = investKind(s, home.id, "pazar");
    assert.ok(next);
    const after = next.provinces.find((p) => p.id === home.id)!;
    assert.equal(after.trade, Math.min(100, Math.max(4, home.trade + 5)));
    assert.equal(next.treasury, s.treasury - 540);
    assert.equal(next.governance.works[home.id]?.pazar, 1);
  });

  it("suppresses a brewing revolt and refuses a quiet province", () => {
    let s = opened();
    const home = s.provinces.find((p) => p.ownerId === s.realm.id)!;
    s = {
      ...s,
      provinces: s.provinces.map((p) => (p.id === home.id ? { ...p, unrest: 50, loyalty: 40 } : p)),
    };
    assert.equal(suppressRevolt(s, home.id) === null, false);
    const quiet = suppressRevolt(opened(), home.id);
    assert.equal(quiet, null);
    const cut = suppressRevolt(s, home.id)!;
    const after = cut.provinces.find((p) => p.id === home.id)!;
    assert.ok(after.unrest < 50);
    assert.ok(after.loyalty > 40);
    assert.ok(cut.treasury < s.treasury);
  });

  it("spends on a spy once a year and records a noisy report or a failure", () => {
    const s = opened();
    const foe = s.foreign[0];
    const fail = spyRealm(s, foe.id, () => 0.1);
    assert.ok(fail);
    assert.equal(fail.treasury, s.treasury - 420);
    assert.equal(fail.governance.lastSpyYear, s.year);
    assert.equal(fail.governance.spy[foe.id], undefined);
    assert.equal(fail.chronicle[0]?.titleKey, "log.spy_fail.title");
    assert.equal(spyRealm(fail, foe.id, () => 0.9), null);
    const ok = spyRealm(s, foe.id, () => 0.9);
    assert.ok(ok);
    assert.ok((ok.governance.spy[foe.id]?.men ?? 0) > 0);
    assert.equal(ok.chronicle[0]?.titleKey, "log.spy.title");
  });

  it("enacts a reform once", () => {
    const s = opened();
    const once = enactReform(s, "askeri");
    assert.ok(once);
    assert.ok(once.governance.reforms.includes("askeri"));
    assert.equal(once.treasury, s.treasury - 1600);
    assert.ok(once.army.drill >= s.army.drill);
    assert.equal(enactReform(once, "askeri"), null);
  });

  it("refuses indemnity without a war score and accepts it when the score is earned", () => {
    const s = opened();
    const foe = s.foreign[0].id;
    const refused = proposePeace(atWar(s, foe, 0), foe, "gold");
    assert.ok(refused);
    assert.equal(refused.relations.find((r) => r.realmId === foe)?.treaty, "war");
    assert.equal(refused.chronicle[0]?.titleKey, "log.peace_refuse.title");
    assert.equal(refused.treasury, s.treasury);
    const dealt = proposePeace(atWar(s, foe, 20), foe, "gold");
    assert.ok(dealt);
    assert.equal(dealt.relations.find((r) => r.realmId === foe)?.treaty, "truce");
    assert.ok(dealt.treasury > s.treasury);
    assert.equal(dealt.governance.peaces, 1);
  });

  it("will not cede a province below the war-score gate", () => {
    const s = opened();
    const edge = borderLand(s);
    assert.ok(edge);
    const refused = proposePeace(atWar(s, edge.realmId, 20), edge.realmId, "province", edge.provinceId);
    assert.ok(refused);
    assert.equal(refused.provinces.find((p) => p.id === edge.provinceId)?.ownerId, edge.realmId);
    const taken = proposePeace(atWar(s, edge.realmId, 30), edge.realmId, "province", edge.provinceId);
    assert.ok(taken);
    assert.equal(taken.provinces.find((p) => p.id === edge.provinceId)?.ownerId, s.realm.id);
    assert.equal(taken.relations.find((r) => r.realmId === edge.realmId)?.treaty, "truce");
  });

  it("pauses on hold, keeps ironman once it is sworn, and rejects a forged slot", () => {
    const s = opened();
    const held = applyAction(s, { type: "SET_SPEED", speed: "dur" }).state;
    assert.equal(held.governance.speed, "dur");
    assert.equal(held.world.paused, true);
    assert.equal(held.world.pauseReason, "speed");
    const sworn = applyAction(s, { type: "SET_IRONMAN", on: true }).state;
    assert.equal(sworn.year, START_YEAR);
    assert.equal(sworn.governance.ironman, true);
    assert.equal(applyAction(sworn, { type: "SET_IRONMAN", on: false }).state.governance.ironman, true);
    const late = applyAction({ ...s, year: START_YEAR + 2 }, { type: "SET_IRONMAN", on: true }).state;
    assert.equal(late.governance.ironman, false);
    assert.equal(slotAcceptable(s, s), true);
    assert.equal(slotAcceptable(s, { ...s, realm: { ...s.realm, id: "forged" } }), false);
    assert.equal(slotAcceptable(s, { ...s, treasury: 200_000 }), false);
    assert.equal(slotAcceptable(s, { ...s, provinces: s.provinces.slice(1) }), false);
  });

  it("stays finite across a long reign", () => {
    const start = opened();
    const at50 = playYears(start, 50);
    const at100 = playYears(at50, 50);
    const at200 = playYears(at100, 100);
    for (const end of [at50, at100, at200]) {
      assert.equal(end.provinces.length, start.provinces.length);
      finiteState(end);
      assert.ok(end.treasury > -40_000 && end.treasury < 90_000, `treasury ${end.treasury} @${end.year}`);
      const owners = new Set(end.provinces.map((p) => p.ownerId));
      assert.ok(owners.size >= 2, `owners ${owners.size} @${end.year}`);
      assert.ok(JSON.stringify(end).length < 1_500_000);
    }
    assert.equal(at200.year, start.year + 200);
    const broke = playYear({ ...opened(), treasury: 0 });
    finiteState(broke);
  });
});
