import { clamp, nid } from "@/domains/ids";
import type { ChronicleEntry, GameState, PeoplePulse } from "@/domains/types";
import { computeBudget, totalDebt } from "@/domains/economy/budget";
import { absorbDeficit } from "@/domains/economy/credit";
import { fillEconomy, ownedOf } from "@/domains/economy/model";

function notice(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): ChronicleEntry {
  return { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
}

function pushLog(s: GameState, entry: ChronicleEntry): GameState {
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

function avg(nums: number[], fallback = 50): number {
  if (!nums.length) return fallback;
  return nums.reduce((a, n) => a + n, 0) / nums.length;
}

export function computePeople(s: GameState, grainReserve: number): PeoplePulse {
  const owned = ownedOf(s);
  const eco = fillEconomy(s.economy);
  const taxPressure = clamp(
    (s.taxRate / 0.24) * 62 + (eco.tariffRate / 0.18) * 22 + (s.treasury < 0 ? 8 : 0) + Math.min(12, totalDebt(s) / 2000),
    0,
    100,
  );
  const foodAccess = clamp(38 + grainReserve / 90 + avg(owned.map((p) => p.grain)) * 0.42 - taxPressure * 0.12, 0, 100);
  const prosperity = clamp(avg(owned.map((p) => p.prosperity)), 0, 100);
  const unrest = avg(owned.map((p) => p.unrest));
  const peace = clamp(s.stability * 0.42 + (100 - unrest) * 0.32 + foodAccess * 0.18 - taxPressure * 0.12, 0, 100);
  const allegiance = clamp(avg(owned.map((p) => p.loyalty)) * 0.7 + s.piety * 0.12 + foodAccess * 0.1 - taxPressure * 0.08, 0, 100);
  return {
    prosperity: Math.round(prosperity),
    peace: Math.round(peace),
    taxPressure: Math.round(taxPressure),
    foodAccess: Math.round(foodAccess),
    allegiance: Math.round(allegiance),
  };
}

export function tickEconomyYear(s: GameState, rng: () => number): GameState {
  const budget = computeBudget(s);
  const eco = fillEconomy(s.economy);
  const owned = ownedOf(s);
  const grainGrown = owned.reduce((a, p) => a + p.agriculture * 7.4, 0);
  const grainNeed = owned.length * 52 + (s.army.janissary + s.army.sipahi + s.army.azab) / 220;
  let grainReserve = Math.max(0, Math.round(eco.grainReserve + grainGrown - grainNeed));

  let ledger = [
    { id: nid("led"), year: s.year, kind: "gelir", amount: budget.totalIncome, noteKey: "ledger.tax" },
    { id: nid("led"), year: s.year, kind: "gider", amount: -budget.totalExpense, noteKey: "ledger.upkeep" },
    ...s.ledger,
  ];

  let next: GameState = {
    ...s,
    treasury: Math.round(s.treasury + budget.net),
    ledger: ledger.slice(0, 80),
  };

  const peoplePreview = computePeople({ ...next, economy: { ...eco, grainReserve } }, grainReserve);
  const famine = peoplePreview.foodAccess < 36;
  const heavyTax = peoplePreview.taxPressure > 68;
  const unpaid = budget.net < -800 && next.treasury < 1200;

  next.provinces = next.provinces.map((p) => {
    if (p.ownerId !== next.realm.id) return p;
    const taxDrift = s.taxRate > 0.16 ? -3 : s.taxRate < 0.1 ? 2 : 0;
    const foodDrift = famine ? -6 : peoplePreview.foodAccess > 70 ? 1 : 0;
    const unrestDrift = (heavyTax ? 5 : -1) + (famine ? 7 : 0) + (p.loyalty < 40 ? 3 : 0) - s.buildings.hisar * 0.4;
    const agriDrift = famine ? -3 : rng() > 0.82 ? 1 : 0;
    const tradeDrift = s.relations.some((r) => r.treaty === "war") ? -2 : rng() > 0.88 ? 1 : 0;
    const prosperityDrift = (peoplePreview.peace - 50) / 25 + (heavyTax ? -2 : 0.4);
    return {
      ...p,
      loyalty: clamp(p.loyalty + taxDrift + foodDrift + (next.stability > 60 ? 1 : -1), 5, 100),
      development: clamp(p.development + (rng() > 0.88 && peoplePreview.prosperity > 55 ? 1 : famine ? (rng() > 0.7 ? -1 : 0) : 0), 1, 30),
      grain: clamp(p.grain + (famine ? -8 : 2) + agriDrift, 8, 100),
      agriculture: clamp(p.agriculture + agriDrift, 8, 100),
      production: clamp(p.production + (heavyTax ? -1 : rng() > 0.9 ? 1 : 0), 8, 100),
      trade: clamp(p.trade + tradeDrift, 8, 100),
      prosperity: clamp(p.prosperity + prosperityDrift, 8, 100),
      unrest: clamp(p.unrest + unrestDrift, 0, 100),
    };
  });

  const people = computePeople({ ...next, economy: { ...eco, grainReserve } }, grainReserve);
  let revoltRisk = clamp(
    people.taxPressure * 0.25 + (100 - people.peace) * 0.3 + (100 - people.foodAccess) * 0.2 + (100 - people.allegiance) * 0.15,
    0,
    100,
  );
  let famineStreak = famine ? eco.famineStreak + 1 : 0;
  let unpaidStreak = unpaid ? eco.unpaidStreak + 1 : 0;
  let stability = next.stability + (next.treasury < 0 ? -6 : 1) + (people.peace > 70 ? 1 : 0) + (famine ? -5 : 0);
  let prestige = next.prestige;
  let army = next.army;
  let harem = next.harem;

  if (next.treasury < 0) {
    prestige = clamp(prestige - 4, 0, 100);
    army = { ...army, morale: clamp(army.morale - 5, 10, 100) };
  }
  if (unpaid) {
    army = { ...army, morale: clamp(army.morale - 7 - unpaidStreak, 10, 100) };
    revoltRisk = clamp(revoltRisk + 8, 0, 100);
  }
  if (people.peace < 36) {
    harem = { ...harem, intrigue: clamp((harem?.intrigue ?? 12) + 7, 0, 100) };
    stability -= 3;
  }
  if (people.prosperity < 32) {
    next = {
      ...next,
      provinces: next.provinces.map((p) =>
        p.ownerId === next.realm.id ? { ...p, trade: clamp(p.trade - 4, 8, 100) } : p,
      ),
    };
  }

  const hottest = ownedOf(next).slice().sort((a, b) => b.unrest - a.unrest + (a.loyalty - b.loyalty) / 4)[0];
  if (hottest && hottest.unrest > 72 && hottest.loyalty < 38 && rng() > 0.55) {
    next = {
      ...next,
      provinces: next.provinces.map((p) =>
        p.id === hottest.id
          ? { ...p, loyalty: clamp(p.loyalty - 14, 5, 100), unrest: clamp(p.unrest + 8, 0, 100), development: clamp(p.development - 1, 1, 30) }
          : p,
      ),
    };
    next = pushLog(next, notice(s, "isyan", "log.revolt.title", "log.revolt.body", { prov: hottest.nameKey }));
    revoltRisk = clamp(revoltRisk + 12, 0, 100);
    stability -= 6;
  }

  next = {
    ...next,
    prestige: clamp(prestige, 0, 100),
    stability: clamp(stability, 0, 100),
    army,
    harem,
    economy: {
      ...eco,
      grainReserve,
      lastBudget: budget,
      people,
      famineStreak,
      unpaidStreak,
      revoltRisk: Math.round(revoltRisk),
    },
  };

  if (next.treasury < -200) next = absorbDeficit(next);
  if (next.treasury > 80_000) next = { ...next, treasury: 80_000 };
  if (next.treasury < -30_000) next = { ...next, treasury: -30_000 };

  return next;
}

export function applyGrainRelief(s: GameState, amount: number): GameState {
  const pay = Math.round(clamp(amount, 200, 4000));
  if (s.treasury < pay) return s;
  const eco = fillEconomy(s.economy);
  const grain = Math.round(pay / 7);
  const next: GameState = {
    ...s,
    treasury: Math.round(s.treasury - pay),
    economy: {
      ...eco,
      grainReserve: eco.grainReserve + grain,
      lastReliefYear: s.year,
      famineStreak: Math.max(0, eco.famineStreak - 1),
      people: {
        ...eco.people,
        foodAccess: clamp(eco.people.foodAccess + 6, 0, 100),
        peace: clamp(eco.people.peace + 3, 0, 100),
      },
    },
    piety: clamp(s.piety + 2, 0, 100),
    provinces: s.provinces.map((p) =>
      p.ownerId === s.realm.id ? { ...p, grain: clamp(p.grain + 4, 8, 100), loyalty: clamp(p.loyalty + 2, 5, 100), unrest: clamp(p.unrest - 4, 0, 100) } : p,
    ),
    ledger: [{ id: nid("led"), year: s.year, kind: "gider", amount: -pay, noteKey: "ledger.relief" }, ...s.ledger].slice(0, 80),
  };
  return next;
}

export function setTariff(s: GameState, rate: number): GameState {
  const eco = fillEconomy(s.economy);
  return { ...s, economy: { ...eco, tariffRate: clamp(rate, 0.02, 0.18) } };
}
