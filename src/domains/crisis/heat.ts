import { clamp } from "@/domains/ids";
import { CRISIS_KINDS, type CrisisKind, type GameState, type Province } from "@/domains/types";
import { holderOf } from "@/domains/divan/offices";
import { isAdult } from "@/domains/dynasty/age";
import { totalDebt } from "@/domains/economy/budget";
import { ownedOf } from "@/domains/economy/model";
import { crisisHits, decisionHits, emptyHeat, fillCrisis, seedPressure } from "@/domains/crisis/model";

function avg(nums: number[], fallback = 50): number {
  if (!nums.length) return fallback;
  return nums.reduce((a, n) => a + n, 0) / nums.length;
}

export function hottestOwned(s: GameState): Province | undefined {
  return ownedOf(s)
    .slice()
    .sort((a, b) => b.unrest - a.unrest || a.loyalty - b.loyalty || a.id.localeCompare(b.id))[0];
}

export function coldestFoe(s: GameState) {
  return [...s.relations].sort((a, b) => a.value - b.value || a.realmId.localeCompare(b.realmId))[0];
}

function cap(n: number): number {
  return clamp(Math.round(n), 0, 100);
}

export function computeHeat(s: GameState): Record<CrisisKind, number> {
  const crisis = fillCrisis(s.crisis);
  const world = { ...s, crisis };
  const owned = ownedOf(world);
  const people = world.economy?.people;
  const sad = holderOf(world, "sadrazam");
  const aga = holderOf(world, "yeniceri_agasi");
  const nis = holderOf(world, "nisanci");
  const wars = world.relations.filter((r) => r.treaty === "war").length;
  const debt = totalDebt(world);
  const princes = world.members.filter((m) => m.alive && m.role === "sehzade" && isAdult(m, world.year));
  const cmd =
    (world.army.commanderNpcId && world.npcs.find((n) => n.id === world.army.commanderNpcId && n.alive)) || aga;
  const retreats = world.chronicle.filter((c) => c.titleKey === "log.retreat.title" || c.titleKey === "log.defeat.title").length;

  const heat = emptyHeat();

  heat.revolt = cap(
    avg(owned.map((p) => p.unrest)) * 0.42 +
      (100 - avg(owned.map((p) => p.loyalty))) * 0.18 +
      (people?.taxPressure ?? 40) * 0.14 +
      (world.economy?.revoltRisk ?? 0) * 0.22 +
      (people && people.allegiance < 40 ? 10 : 0) +
      decisionHits(world, ["reaya_isyan", "crisis_revolt"], ["crush", "steel"]) * 14 -
      decisionHits(world, ["reaya_isyan", "crisis_revolt"], ["relieve", "mercy"]) * 6 +
      seedPressure(world, "revolt"),
  );

  heat.janissary = cap(
    (100 - (world.army.pay ?? 70)) * 0.35 +
      (100 - world.army.morale) * 0.2 +
      (world.economy?.unpaidStreak ?? 0) * 12 +
      (world.army.janissary > 7000 ? 8 : 0) +
      (aga ? (100 - aga.loyalty) * 0.15 : 12) +
      decisionHits(world, ["yeni_ceri_ulufe", "ocak_maas", "crisis_janissary"], ["refuse"]) * 16 -
      decisionHits(world, ["yeni_ceri_ulufe", "ocak_maas", "crisis_janissary"], ["pay"]) * 5 +
      crisisHits(world, "janissary", ["refuse"]) * 8 +
      seedPressure(world, "janissary"),
  );

  const valide = world.members.find((m) => m.alive && m.role === "valide");
  const favorite = world.members.find((m) => m.id === world.harem?.favoriteId);
  heat.palace = cap(
    (world.harem?.intrigue ?? 12) * 0.7 +
      Math.abs((valide?.influence ?? 50) - (favorite?.influence ?? 40)) * 0.25 +
      decisionHits(world, ["harem_rekabet", "valide_tercih", "crisis_palace"], ["haseki", "favor"]) * 8 +
      seedPressure(world, "palace"),
  );

  const rivalGap = Math.max(
    0,
    ...(world.npcs ?? []).flatMap((n) => n.rivals.map((id) => {
      const r = world.npcs.find((x) => x.id === id);
      return r ? Math.abs(n.influence - r.influence) : 0;
    })),
  );
  heat.rivalry = cap(
    (sad ? sad.influence * 0.35 + sad.ambition * 0.2 : 18) +
      rivalGap * 0.2 +
      (sad && sad.influence > 70 && world.ruler.stats.siyaset < 10 ? 14 : 0) +
      decisionHits(world, ["vezir_rusvet", "crisis_rivalry"], ["ignore", "dismiss"]) * 10 +
      seedPressure(world, "rivalry"),
  );

  heat.spy = cap(
    wars * 14 +
      (nis ? (100 - nis.competence) * 0.2 : 16) +
      (world.stability < 45 ? 10 : 0) +
      decisionHits(world, ["casus", "crisis_spy"], ["fund", "burn"]) * 6 +
      seedPressure(world, "spy"),
  );

  heat.agent = cap(
    wars * 12 +
      (100 - world.stability) * 0.2 +
      (people && people.peace < 40 ? 10 : 0) +
      decisionHits(world, ["casus", "crisis_agent"], ["execute"]) * 8 +
      seedPressure(world, "agent"),
  );

  const net = world.economy?.lastBudget?.net ?? 0;
  heat.economy = cap(
    (debt / 80) * 0.35 +
      (world.treasury < 2000 ? 18 : 0) +
      (net < -500 ? 12 : 0) +
      (world.economy?.famineStreak ?? 0) * 10 +
      (people?.taxPressure ?? 40) * 0.12 +
      decisionHits(world, ["galata_borc", "crisis_economy"], ["defer", "debase", "borrow"]) * 10 +
      seedPressure(world, "economy"),
  );

  const topPrince = princes.slice().sort((a, b) => b.influence - a.influence)[0];
  heat.claim = cap(
    princes.length * 8 +
      (topPrince ? topPrince.influence * 0.4 : 0) +
      (world.succession ? 20 : 0) +
      decisionHits(world, ["sehzade_ocak", "sehzade_ihtilaf", "crisis_claim"], ["favor", "confine"]) * 10 +
      seedPressure(world, "claim"),
  );

  heat.diplomatic = cap(
    wars * 16 +
      Math.max(0, -(coldestFoe(world)?.value ?? 0)) * 0.25 +
      decisionHits(world, ["treaty", "dip", "crisis_diplomatic"], ["war", "refuse"]) * 8 +
      (world.relations.filter((r) => r.treaty === "truce").length ? 6 : 0) +
      seedPressure(world, "diplomatic"),
  );

  heat.commander = cap(
    (cmd ? (100 - cmd.loyalty) * 0.4 : 10) +
      (100 - world.army.morale) * 0.2 +
      retreats * 5 +
      (world.army.pay < 40 ? 12 : 0) +
      decisionHits(world, ["crisis_commander"], ["overlook"]) * 12 +
      seedPressure(world, "commander"),
  );

  return heat;
}

export function hottestKind(s: GameState): { kind: CrisisKind; value: number } {
  const heat = s.crisis?.heat ?? computeHeat(s);
  let kind: CrisisKind = "revolt";
  let value = -1;
  for (const k of CRISIS_KINDS) {
    if (heat[k] > value || (heat[k] === value && k.localeCompare(kind) < 0)) {
      kind = k;
      value = heat[k];
    }
  }
  return { kind, value: Math.max(0, value) };
}

export function crisisPayload(s: GameState, kind: CrisisKind): Record<string, string> {
  const prov = hottestOwned(s);
  const foe = coldestFoe(s);
  const foeName = s.foreign.find((r) => r.id === foe?.realmId)?.name ?? foe?.realmId ?? "";
  const sad = holderOf(s, "sadrazam");
  const rival = sad ? s.npcs.find((n) => n.alive && sad.rivals.includes(n.id)) : undefined;
  const prince = s.members
    .filter((m) => m.alive && m.role === "sehzade" && isAdult(m, s.year))
    .sort((a, b) => b.influence - a.influence)[0];
  const valide = s.members.find((m) => m.alive && m.role === "valide");
  const favorite = s.members.find((m) => m.id === s.harem?.favoriteId);
  const cmd =
    (s.army.commanderNpcId && s.npcs.find((n) => n.id === s.army.commanderNpcId)) || holderOf(s, "yeniceri_agasi");
  const base: Record<string, string> = {
    name: s.ruler.givenName,
    prov: prov?.nameKey ?? "prov.edirne",
    foe: foeName,
    rival: rival?.name ?? sad?.name ?? "",
    vizier: sad?.name ?? "",
    prince: prince?.givenName ?? "",
    valide: valide?.givenName ?? "",
    hatun: favorite?.givenName ?? "",
    commander: cmd?.name ?? "",
  };
  void kind;
  return base;
}
