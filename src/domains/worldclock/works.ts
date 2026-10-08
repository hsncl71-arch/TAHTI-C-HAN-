import { clamp, nid } from "@/domains/ids";
import { BUILDING_COST, type Building, type GameState, type WorkProject } from "@/domains/types";
import { fillWorldClock } from "@/domains/worldclock/model";

export function WORK_YEARS(building: Building): number {
  if (building === "hisar" || building === "tersane") return 2;
  return 1;
}

export function commissionWork(s: GameState, building: Building): GameState {
  const cost = BUILDING_COST[building];
  if (s.treasury < cost) return s;
  const world = fillWorldClock(s.world, s.world?.lastSimAt ?? Date.now());
  const work: WorkProject = {
    id: nid("work"),
    building,
    startedYear: s.year,
    etaYear: s.year + WORK_YEARS(building),
    costPaid: cost,
  };
  return {
    ...s,
    treasury: Math.round(s.treasury - cost),
    ledger: [{ id: nid("led"), year: s.year, kind: "gider", amount: -cost, noteKey: "ledger.work" }, ...s.ledger].slice(0, 80),
    world: { ...world, works: [...world.works, work] },
  };
}

export function completeDueWorks(s: GameState): GameState {
  const world = fillWorldClock(s.world, s.world?.lastSimAt ?? Date.now());
  const due = world.works.filter((w) => w.etaYear <= s.year);
  if (!due.length) return s;
  let buildings = { ...s.buildings };
  let piety = s.piety;
  let prestige = s.prestige;
  let provinces = s.provinces;
  for (const w of due) {
    buildings = { ...buildings, [w.building]: buildings[w.building] + 1 };
    if (w.building === "cami" || w.building === "medrese") piety = clamp(piety + 8, 0, 100);
    if (w.building === "hisar" || w.building === "tersane") prestige = clamp(prestige + 4, 0, 100);
    if (w.building === "kervansaray") {
      provinces = provinces.map((p) => (p.ownerId === s.realm.id ? { ...p, trade: clamp(p.trade + 4, 8, 100) } : p));
    }
    if (w.building === "hisar") {
      provinces = provinces.map((p) => (p.ownerId === s.realm.id ? { ...p, unrest: clamp(p.unrest - 3, 0, 100) } : p));
    }
  }
  const remaining = world.works.filter((w) => w.etaYear > s.year);
  const logged = due.map((w) => ({
    id: nid("ch"),
    year: s.year,
    kind: "imar",
    titleKey: "log.work.done.title",
    bodyKey: "log.work.done.body",
    vars: { building: w.building },
  }));
  return {
    ...s,
    buildings,
    piety,
    prestige,
    provinces,
    chronicle: [...logged, ...s.chronicle].slice(0, 200),
    world: { ...world, works: remaining },
  };
}

export function maybeAutoCaravan(s: GameState): GameState {
  const world = fillWorldClock(s.world, s.world?.lastSimAt ?? Date.now());
  if (world.edicts.works !== "caravan") return s;
  if (s.treasury < BUILDING_COST.kervansaray + 4000) return s;
  if (s.buildings.kervansaray >= 6) return s;
  if (world.works.some((w) => w.building === "kervansaray")) return s;
  return commissionWork(s, "kervansaray");
}
