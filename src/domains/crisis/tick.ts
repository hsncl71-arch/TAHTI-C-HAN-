import { clamp, nid } from "@/domains/ids";
import { CRISIS_KINDS, type CrisisKind, type CrisisSeed, type GameState, type PendingEvent } from "@/domains/types";
import { pickCrisisEvent } from "@/domains/crisis/catalog";
import { computeHeat, crisisPayload, hottestKind } from "@/domains/crisis/heat";
import { fillCrisis, logCrisis } from "@/domains/crisis/model";
import { pushNotice } from "@/domains/worldclock/model";

export const CRISIS_COOLDOWN = 4;
export const CRISIS_SOFT = 42;
export const CRISIS_HARD = 68;

export function ensureCrisis(s: GameState): GameState {
  const filled = fillCrisis(s.crisis);
  const heat = computeHeat({ ...s, crisis: filled });
  return { ...s, crisis: { ...filled, heat } };
}

function applySeed(s: GameState, seed: CrisisSeed): GameState {
  const vars = { ...seed.payload, year: seed.plantedYear, ripe: s.year };
  let next = logCrisis(s, "kriz", seed.titleKey, seed.bodyKey, vars);
  switch (seed.fromKey) {
    case "crisis_revolt:steel":
      next = {
        ...next,
        provinces: next.provinces.map((p) =>
          p.ownerId === next.realm.id
            ? { ...p, unrest: clamp(p.unrest + 14, 0, 100), loyalty: clamp(p.loyalty - 6, 5, 100) }
            : p,
        ),
        stability: clamp(next.stability - 5, 0, 100),
      };
      break;
    case "crisis_revolt:mercy":
    case "crisis_revolt:bargain":
      next = {
        ...next,
        provinces: next.provinces.map((p) =>
          p.ownerId === next.realm.id ? { ...p, unrest: clamp(p.unrest + 6, 0, 100) } : p,
        ),
      };
      break;
    case "crisis_janissary:pay":
      next = { ...next, army: { ...next.army, pay: clamp(next.army.pay - 10, 0, 100) } };
      break;
    case "crisis_janissary:refuse":
      next = {
        ...next,
        army: { ...next.army, morale: clamp(next.army.morale - 10, 10, 100) },
        stability: clamp(next.stability - 6, 0, 100),
      };
      break;
    case "crisis_janissary:reform":
      next = { ...next, army: { ...next.army, morale: clamp(next.army.morale - 5, 10, 100) } };
      break;
    case "crisis_palace:haseki":
    case "crisis_palace_kalfa:exile": {
      const valide = next.members.find((m) => m.alive && m.role === "valide");
      next = {
        ...next,
        harem: { ...next.harem, intrigue: clamp((next.harem?.intrigue ?? 12) + 10, 0, 100) },
        members: next.members.map((m) => (valide && m.id === valide.id ? { ...m, influence: clamp(m.influence + 6, 0, 100) } : m)),
      };
      break;
    }
    case "crisis_palace_letter:confront":
      next = {
        ...next,
        harem: { ...next.harem, intrigue: clamp((next.harem?.intrigue ?? 12) + 8, 0, 100) },
        members: next.members.map((m) =>
          m.alive && m.role === "sehzade" ? { ...m, influence: clamp(m.influence + 5, 0, 100) } : m,
        ),
      };
      break;
    case "crisis_palace_kalfa:silence":
      next = {
        ...next,
        harem: { ...next.harem, intrigue: clamp((next.harem?.intrigue ?? 12) + 12, 0, 100) },
        prestige: clamp(next.prestige - 4, 0, 100),
      };
      break;
    case "crisis_rivalry:dismiss":
      next = {
        ...next,
        npcs: next.npcs.map((n) =>
          n.office === "sadrazam" || n.ambition > 70
            ? { ...n, loyalty: clamp(n.loyalty - 12, 0, 100), influence: clamp(n.influence + 4, 0, 100) }
            : n,
        ),
        stability: clamp(next.stability - 4, 0, 100),
      };
      break;
    case "crisis_spy:fund": {
      const foe = [...next.relations].sort((a, b) => a.value - b.value)[0];
      next = {
        ...next,
        relations: next.relations.map((r) => (foe && r.realmId === foe.realmId ? { ...r, value: clamp(r.value + 8, -100, 100) } : r)),
        prestige: clamp(next.prestige + 3, 0, 100),
      };
      break;
    }
    case "crisis_spy:burn":
    case "crisis_agent:execute":
      next = { ...next, stability: clamp(next.stability - 4, 0, 100) };
      break;
    case "crisis_agent:turn":
      next = { ...next, prestige: clamp(next.prestige + 4, 0, 100), stability: clamp(next.stability + 2, 0, 100) };
      break;
    case "crisis_agent:turn_fail":
    case "crisis_palace_kalfa:probe":
      next = { ...next, prestige: clamp(next.prestige - 5, 0, 100) };
      break;
    case "crisis_agent:exchange":
    case "crisis_diplomatic:refuse": {
      const foe = [...next.relations].sort((a, b) => a.value - b.value)[0];
      next = {
        ...next,
        relations: next.relations.map((r) =>
          foe && r.realmId === foe.realmId ? { ...r, value: clamp(r.value - 10, -100, 100), treaty: r.treaty === "peace" ? "truce" : r.treaty } : r,
        ),
      };
      break;
    }
    case "crisis_economy:borrow":
      next = { ...next, prestige: clamp(next.prestige - 4, 0, 100) };
      break;
    case "crisis_economy:debase":
      next = {
        ...next,
        provinces: next.provinces.map((p) =>
          p.ownerId === next.realm.id ? { ...p, prosperity: clamp(p.prosperity - 8, 8, 100), unrest: clamp(p.unrest + 6, 0, 100) } : p,
        ),
      };
      break;
    case "crisis_claim:confine":
    case "crisis_palace_letter:ignore":
      next = {
        ...next,
        members: next.members.map((m) =>
          m.alive && m.role === "sehzade" ? { ...m, influence: clamp(m.influence + 8, 0, 100) } : m,
        ),
        stability: clamp(next.stability - 5, 0, 100),
      };
      break;
    case "crisis_commander:overlook":
      next = {
        ...next,
        army: {
          ...next.army,
          morale: clamp(next.army.morale - 8, 10, 100),
          azab: Math.max(0, Math.round(next.army.azab * 0.94)),
        },
      };
      break;
    default:
      break;
  }
  return next;
}

function hasPendingCrisis(s: GameState): boolean {
  return s.pendingEvents.some((e) => e.key.startsWith("crisis_"));
}

function fireCrisis(s: GameState, kind: CrisisKind, rng: () => number): GameState {
  const def = pickCrisisEvent(s, kind, rng);
  const ev: PendingEvent = {
    id: nid("ev"),
    key: def.key,
    year: s.year,
    payload: crisisPayload(s, kind),
  };
  let next: GameState = {
    ...s,
    pendingEvents: [ev, ...s.pendingEvents.filter((e) => e.key !== def.key)],
    crisis: {
      ...fillCrisis(s.crisis),
      lastFired: { ...fillCrisis(s.crisis).lastFired, [kind]: s.year },
    },
  };
  next = pushNotice(next, {
    kind: "kriz",
    severity: "critical",
    titleKey: def.titleKey,
    bodyKey: "crisis.notice.body",
    vars: ev.payload,
  });
  return next;
}

function ripenSeeds(s: GameState, rng: () => number): GameState {
  const crisis = fillCrisis(s.crisis);
  const ripe = crisis.seeds.filter((x) => x.ripeYear <= s.year);
  const kept = crisis.seeds.filter((x) => x.ripeYear > s.year);
  let next: GameState = { ...s, crisis: { ...crisis, seeds: kept } };
  for (const seed of ripe) {
    next = applySeed(next, seed);
    next = pushNotice(next, {
      kind: "kriz",
      severity: seed.sequel ? "critical" : "info",
      titleKey: seed.titleKey,
      bodyKey: seed.bodyKey,
      vars: { ...seed.payload, year: seed.plantedYear, ripe: next.year },
    });
    if (seed.sequel && !hasPendingCrisis(next) && !next.succession) {
      next = fireCrisis(next, seed.kind, rng);
    }
  }
  return next;
}

export function pickCrisisKind(s: GameState, rng: () => number): CrisisKind | null {
  const heat = s.crisis?.heat ?? computeHeat(s);
  const last = s.crisis?.lastFired ?? {};
  const eligible = CRISIS_KINDS.filter((k) => heat[k] >= CRISIS_SOFT && s.year - (last[k] ?? 0) >= CRISIS_COOLDOWN);
  if (!eligible.length) return null;
  const hard = eligible
    .filter((k) => heat[k] >= CRISIS_HARD)
    .sort((a, b) => heat[b] - heat[a] || a.localeCompare(b));
  if (hard.length) return hard[0];
  const total = eligible.reduce((sum, k) => sum + Math.max(1, heat[k]), 0);
  let roll = rng() * total;
  let chosen = eligible[0];
  for (const k of eligible) {
    roll -= Math.max(1, heat[k]);
    if (roll <= 0) {
      chosen = k;
      break;
    }
  }
  const h = heat[chosen];
  return rng() < (h - 32) / 90 ? chosen : null;
}

export function tickCrisisYear(s: GameState, rng: () => number): GameState {
  let next = ensureCrisis(s);
  next = ripenSeeds(next, rng);
  next = ensureCrisis(next);
  if (next.succession || hasPendingCrisis(next)) return next;
  const kind = pickCrisisKind(next, rng);
  if (!kind) return next;
  return fireCrisis(next, kind, rng);
}

export function maxCrisisHeat(s: GameState): number {
  return hottestKind(s).value;
}