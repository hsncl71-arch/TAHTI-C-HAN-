import { clamp, nid } from "@/domains/ids";
import type { BattleReport, BattleResult, CampaignOp, ChronicleEntry, DoctrineId, GameState, SiegeOutcome, TacticId } from "@/domains/types";
import { holderOf } from "@/domains/divan/offices";
import { isAdult } from "@/domains/dynasty/age";
import { applyReport, doctrineTactic, hostPower, resolveBattle } from "@/domains/military/combat";
import { fillMilitary, landHost } from "@/domains/military/model";
import { reachableIds, shortestPath } from "@/domains/military/path";
import {
  applySiegeAction,
  attachSiegeCinema,
  ensureSiege,
  openSiegeState,
  siegeProgressOf,
} from "@/domains/military/siege";
import { terrainOf, weatherOf } from "@/domains/military/terrain";
import { noteConquest, noteDefeat } from "@/domains/governance/model";

function notice(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): ChronicleEntry {
  return { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
}

function pushLog(s: GameState, entry: ChronicleEntry): GameState {
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

export function eligibleCommanders(s: GameState): { id: string; kind: "npc" | "member"; name: string; score: number }[] {
  const out: { id: string; kind: "npc" | "member"; name: string; score: number }[] = [];
  for (const office of ["yeniceri_agasi", "kaptan", "beylerbeyi"] as const) {
    const n = holderOf(s, office);
    if (n) out.push({ id: n.id, kind: "npc", name: n.name, score: Math.round(n.competence * 0.6 + n.loyalty * 0.2) });
  }
  for (const m of s.members.filter((x) => x.alive && x.role === "sehzade" && isAdult(x, s.year))) {
    out.push({ id: m.id, kind: "member", name: m.givenName, score: Math.round(m.military * 0.7 + m.stats.cesaret * 2) });
  }
  const seen = new Set<string>();
  return out.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

export function setCommander(s: GameState, npcId?: string, memberId?: string): GameState {
  if (memberId) {
    const m = s.members.find((x) => x.id === memberId && x.alive && x.role === "sehzade" && isAdult(x, s.year));
    if (!m) return s;
    return { ...s, army: { ...s.army, commanderMemberId: m.id, commanderNpcId: null } };
  }
  if (npcId) {
    const n = s.npcs.find((x) => x.id === npcId && x.alive);
    if (!n) return s;
    return { ...s, army: { ...s.army, commanderNpcId: n.id, commanderMemberId: null } };
  }
  return s;
}

export function setDoctrine(s: GameState, doctrine: DoctrineId): GameState {
  return { ...s, military: { ...fillMilitary(s.military), doctrine } };
}

export function marchTargets(s: GameState) {
  const from = s.army.provinceId || s.realm.capitalId;
  const reach = reachableIds(s.provinces, from);
  return s.provinces.filter((p) => reach.has(p.id) && p.id !== from);
}

export function launchCampaign(s: GameState, targetId: string): GameState | null {
  if (s.army.status === "campaign" || s.army.status === "siege") return null;
  const from = s.army.provinceId || s.realm.capitalId;
  const route = shortestPath(s.provinces, from, targetId);
  if (!route || route.length < 2) return null;
  const target = s.provinces.find((p) => p.id === targetId);
  if (!target) return null;
  const weather = weatherOf(s.year, target);
  const campaign: CampaignOp = {
    targetProvinceId: targetId,
    startYear: s.year,
    progress: 0,
    route,
    routeIndex: 0,
    phase:
      (target.region === "ada" || target.port === "harbor" || target.port === "arsenal") &&
      (s.army.navy > 8 || s.army.levend > 400) &&
      route.length <= 3
        ? "naval"
        : "march",
    siegeProgress: 0,
    weather,
    lastReportId: null,
  };
  return {
    ...s,
    army: { ...s.army, status: "campaign", supply: clamp(s.army.supply - 4, 8, 100) },
    campaign,
  };
}

function occupy(s: GameState, targetId: string, winField: boolean, how?: SiegeOutcome): GameState {
  const target = s.provinces.find((p) => p.id === targetId);
  if (!target) return s;
  if (target.ownerId === s.realm.id) {
    return pushLog(
      {
        ...s,
        army: { ...s.army, status: "idle", provinceId: targetId },
        campaign: null,
        provinces: s.provinces.map((p) =>
          p.id === targetId ? { ...p, loyalty: clamp(p.loyalty + 10, 5, 100), unrest: clamp(p.unrest - 8, 0, 100) } : p,
        ),
      },
      notice(s, "sefer", "log.garrison.title", "log.garrison.body", { prov: target.nameKey }),
    );
  }
  if (!winField) {
    return pushLog(
      noteDefeat({ ...s, prestige: clamp(s.prestige - 8, 0, 100), army: { ...s.army, status: "idle" }, campaign: null }, target.ownerId),
      notice(s, "sefer", "log.defeat.title", "log.defeat.body", { prov: target.nameKey }),
    );
  }
  const unrestHit = how === "starved" ? 28 : how === "surrender" ? 8 : 18;
  const prosperHit = how === "starved" ? 14 : how === "surrender" ? 4 : 8;
  const loyalty = how === "surrender" ? 52 : how === "starved" ? 32 : 40;
  const prestigeHit = how === "surrender" ? 8 : how === "starved" ? 10 : 12;
  const titleKey =
    how === "surrender" ? "log.siege_surrender.title" : how === "starved" ? "log.siege_starved.title" : "log.conquest.title";
  const bodyKey =
    how === "surrender" ? "log.siege_surrender.body" : how === "starved" ? "log.siege_starved.body" : "log.conquest.body";
  let next: GameState = {
    ...s,
    prestige: clamp(s.prestige + prestigeHit, 0, 100),
    army: { ...s.army, status: "idle", provinceId: targetId },
    campaign: null,
    provinces: s.provinces.map((p) =>
      p.id === targetId
        ? {
            ...p,
            ownerId: s.realm.id,
            loyalty,
            unrest: clamp(p.unrest + unrestHit, 0, 100),
            prosperity: clamp(p.prosperity - prosperHit, 8, 100),
            fort: how === "captured" ? Math.max(1, p.fort - 1) : p.fort,
          }
        : p,
    ),
    relations: s.relations.map((r) =>
      r.realmId === target.ownerId ? { ...r, value: clamp(r.value - 25, -100, 100), treaty: "war" } : r,
    ),
  };
  next = noteConquest(next, target.ownerId);
  if (!how) {
    const loot = Math.round((target.taxBase ?? 80) * 4);
    next = {
      ...next,
      treasury: next.treasury + loot,
      ledger: [{ id: nid("led"), year: s.year, kind: "gelir", amount: loot, noteKey: "ledger.loot" }, ...next.ledger].slice(0, 80),
    };
  }
  return pushLog(next, notice(s, "sefer", titleKey, bodyKey, { prov: target.nameKey }));
}

export function settleSiege(s: GameState, rng: () => number): GameState {
  const siege = s.siege;
  if (!siege?.outcome || siege.cinema) return s;
  const outcome = siege.outcome;
  const win = outcome === "captured" || outcome === "surrender" || outcome === "starved";
  let next: GameState;
  if (win) {
    next = occupy(s, siege.provinceId, true, outcome);
    if (outcome !== "starved") {
      const prize = s.provinces.find((p) => p.id === siege.provinceId);
      const loot = Math.round((prize?.taxBase ?? 80) * (outcome === "surrender" ? 6 : 10));
      next = {
        ...next,
        treasury: next.treasury + loot,
        ledger: [{ id: nid("led"), year: s.year, kind: "gelir", amount: loot, noteKey: "ledger.loot" }, ...next.ledger].slice(0, 80),
      };
    }
  } else if (outcome === "repulsed") {
    const target = s.provinces.find((p) => p.id === siege.provinceId);
    next = pushLog(
      { ...s, prestige: clamp(s.prestige - 10, 0, 100), army: { ...s.army, status: "idle" }, campaign: null },
      notice(s, "sefer", "log.siege_repulsed.title", "log.siege_repulsed.body", { prov: target?.nameKey ?? "" }),
    );
  } else {
    const start = s.campaign?.route[0] ?? s.realm.capitalId;
    next = pushLog(
      {
        ...s,
        prestige: clamp(s.prestige - 3, 0, 100),
        army: {
          ...s.army,
          status: "idle",
          provinceId: start,
          morale: clamp(s.army.morale - 4, 10, 100),
          supply: clamp(s.army.supply + 6, 8, 100),
        },
        campaign: null,
      },
      notice(s, "sefer", "log.retreat.title", "log.retreat.body"),
    );
  }
  void rng;
  next = { ...next, siege: s.siege };
  return attachSiegeCinema(next);
}

export function beginSiege(s: GameState, target: { id: string; nameKey: string }): GameState {
  const opened = s.siege && s.siege.provinceId === target.id && !s.siege.outcome ? s.siege : openSiegeState(s, target.id);
  const progress = siegeProgressOf(opened);
  return pushLog(
    {
      ...s,
      army: { ...s.army, status: "siege" },
      campaign: s.campaign ? { ...s.campaign, phase: "siege", siegeProgress: progress } : s.campaign,
      siege: opened,
    },
    notice(s, "sefer", "log.siege_start.title", "log.siege_start.body", { prov: target.nameKey }),
  );
}

export function resolveSiegeAction(s: GameState, action: import("@/domains/types").SiegeActionId, rng: () => number): GameState {
  let next = applySiegeAction(ensureSiege(s), action, rng);
  if (next.siege?.outcome && !next.siege.cinema) next = settleSiege(next, rng);
  else if (next.campaign && next.siege) {
    const siegeProgress = siegeProgressOf(next.siege);
    const prov = next.provinces.find((p) => p.id === next.siege?.provinceId)?.nameKey ?? "";
    next = {
      ...next,
      campaign: { ...next.campaign, siegeProgress },
    };
    next = pushLog(next, notice(s, "sefer", "log.siege.title", "log.siege.body", { prov, n: Math.round(siegeProgress) }));
  }
  return next;
}

function fightAt(s: GameState, kind: "field" | "siege" | "naval", rng: () => number, tacticAtk?: TacticId): GameState {
  const camp = s.campaign;
  if (!camp) return s;
  const target = s.provinces.find((p) => p.id === camp.targetProvinceId);
  if (!target) return { ...s, campaign: null, army: { ...s.army, status: "idle" } };
  const tactic = tacticAtk ?? s.military.liveOrders ?? "center";
  const defTactic = doctrineTactic("hold", kind);
  const { report, nextArmy } = resolveBattle(s, {
    kind,
    provinceId: target.id,
    tacticAtk: tactic,
    tacticDef: defTactic,
    defenderFort: target.fort,
    defenderManpower: target.manpower,
    rng,
    doctrineDef: "hold",
  });
  let next = applyReport({ ...s, army: nextArmy, campaign: { ...camp, lastReportId: report.id } }, report, nextArmy);
  if (report.result === "retreat") return retreatHost(next, rng, true);
  if (report.result === "win") return occupy(next, target.id, true);
  if (report.result === "loss") {
    return pushLog(
      { ...next, prestige: clamp(next.prestige - 8, 0, 100), army: { ...next.army, status: "idle" }, campaign: null },
      notice(s, "sefer", "log.defeat.title", "log.defeat.body", { prov: target.nameKey }),
    );
  }
  return pushLog(
    { ...next, campaign: { ...camp, phase: kind === "siege" ? "siege" : "march", lastReportId: report.id } },
    notice(s, "sefer", "log.stalemate.title", "log.stalemate.body", { prov: target.nameKey }),
  );
}

export function tickCampaign(s: GameState, rng: () => number): GameState {
  const camp = s.campaign;
  if (!camp) {
    if (s.army.status === "idle") {
      return {
        ...s,
        army: {
          ...s.army,
          supply: clamp(s.army.supply + 4, 8, 100),
          drill: clamp(s.army.drill - 1, 8, 100),
          pay: clamp(s.army.pay - (s.economy?.unpaidStreak ?? 0) * 2, 8, 100),
        },
      };
    }
    return s;
  }
  const hereId = camp.route[camp.routeIndex] ?? s.army.provinceId;
  const here = s.provinces.find((p) => p.id === hereId) ?? s.provinces[0];
  const weather = weatherOf(s.year, here);
  const onOwnLand = here.ownerId === s.realm.id;
  let supplyDrain = (onOwnLand ? 2 : 7) + Math.floor(camp.routeIndex * (onOwnLand ? 0.4 : 1.4));
  if (!onOwnLand && (weather === "snow" || weather === "heat")) supplyDrain += 5;
  if (!onOwnLand && weather === "storm") supplyDrain += 4;
  let next: GameState = {
    ...s,
    army: {
      ...s.army,
      supply: clamp(s.army.supply - supplyDrain, 5, 100),
      morale: clamp(s.army.morale + (s.army.supply < 25 ? -6 : -1), 10, 100),
      provinceId: hereId,
    },
    campaign: { ...camp, weather, progress: clamp(Math.round((camp.routeIndex / Math.max(1, camp.route.length - 1)) * 100), 0, 100) },
  };
  if (next.army.supply < 12) {
    next = pushLog(next, notice(s, "sefer", "log.supply.title", "log.supply.body"));
    return retreatHost(next, rng, false);
  }
  if (camp.phase === "siege") {
    const guns = next.army.topcu >= 8;
    const walls = next.siege?.defense.walls ?? 100;
    const action = walls < 38 || next.army.morale > 72 && (next.siege?.defense.morale ?? 100) < 30 ? "storm" : guns ? "bombard" : "sap";
    return resolveSiegeAction(next, action, rng);
  }
  const stuck = (weather === "snow" || weather === "storm") && rng() > 0.55;
  if (stuck) {
    return pushLog(next, notice(s, "sefer", "log.weather.title", "log.weather.body"));
  }
  const nextIndex = Math.min(camp.route.length - 1, camp.routeIndex + 1);
  const arrived = nextIndex >= camp.route.length - 1;
  const arrivedId = camp.route[nextIndex];
  next = {
    ...next,
    army: { ...next.army, provinceId: arrivedId, status: "campaign" },
    campaign: { ...next.campaign!, routeIndex: nextIndex },
  };
  if (!arrived) return next;
  const target = s.provinces.find((p) => p.id === camp.targetProvinceId);
  if (!target) return { ...next, campaign: null, army: { ...next.army, status: "idle" } };
  if (target.fort >= 2 && target.ownerId !== s.realm.id) {
    return beginSiege(next, target);
  }
  const kind = camp.phase === "naval" ? "naval" : "field";
  return fightAt(next, kind, rng);
}

export function stormFort(s: GameState, rng: () => number): GameState {
  if (s.siege?.cinema) return s;
  if (!s.siege && (!s.campaign || s.campaign.phase !== "siege")) return s;
  return resolveSiegeAction(s, "storm", rng);
}

export function retreatHost(s: GameState, rng: () => number, fromBattle: boolean): GameState {
  const camp = s.campaign;
  const start = camp?.route[0] ?? s.realm.capitalId;
  let army = {
    ...s.army,
    status: "idle" as const,
    provinceId: start,
    morale: clamp(s.army.morale - (fromBattle ? 8 : 4), 10, 100),
    supply: clamp(s.army.supply + 6, 8, 100),
  };
  if (fromBattle && rng() > 0.4) {
    army = { ...army, azab: Math.max(0, Math.round(army.azab * 0.94)), akinji: Math.max(0, Math.round(army.akinji * 0.95)) };
  }
  let next: GameState = { ...s, army, campaign: null, prestige: clamp(s.prestige - 3, 0, 100) };
  if (s.siege && !s.siege.cinema) {
    const siege = { ...s.siege, outcome: s.siege.outcome ?? ("abandoned" as const), phase: "resolved" as const };
    next = attachSiegeCinema({ ...next, siege });
  } else if (!s.siege?.cinema) {
    next = { ...next, siege: null };
  }
  return pushLog(next, notice(s, "sefer", "log.retreat.title", "log.retreat.body"));
}

export function offerPeace(s: GameState, realmId: string): GameState {
  const rel = s.relations.find((r) => r.realmId === realmId);
  if (!rel) return s;
  const camp = s.campaign;
  const target = camp ? s.provinces.find((p) => p.id === camp.targetProvinceId) : undefined;
  const ends = target?.ownerId === realmId;
  let next: GameState = {
    ...s,
    relations: s.relations.map((r) =>
      r.realmId === realmId ? { ...r, treaty: "truce", value: clamp(r.value + 14, -100, 100) } : r,
    ),
    prestige: clamp(s.prestige + (rel.treaty === "war" ? 2 : -1), 0, 100),
  };
  if (ends) {
    next = {
      ...next,
      campaign: null,
      army: { ...next.army, status: "idle", provinceId: next.realm.capitalId },
      siege: next.siege?.cinema ? next.siege : null,
    };
  }
  return pushLog(next, notice(s, "diplomasi", "log.peace.title", "log.peace.body", { realm: realmId }));
}

export function drillHost(s: GameState): GameState {
  if (s.military.lastDrillYear === s.year) return s;
  if (s.treasury < 400 || s.army.status === "campaign" || s.army.status === "siege") return s;
  return {
    ...s,
    treasury: Math.round(s.treasury - 400),
    army: { ...s.army, drill: clamp(s.army.drill + 8, 0, 100), morale: clamp(s.army.morale + 2, 10, 100) },
    military: { ...s.military, lastDrillYear: s.year },
    ledger: [{ id: nid("led"), year: s.year, kind: "gider", amount: -400, noteKey: "ledger.drill" }, ...s.ledger].slice(0, 80),
  };
}

export function payUlufe(s: GameState): GameState {
  if (s.military.lastPayYear === s.year) return s;
  const cost = Math.round(s.army.janissary * 0.32 + s.army.sipahi * 0.12);
  if (s.treasury < cost || cost <= 0) return s;
  return {
    ...s,
    treasury: Math.round(s.treasury - cost),
    army: { ...s.army, pay: clamp(s.army.pay + 16, 0, 100), morale: clamp(s.army.morale + 8, 10, 100) },
    military: { ...s.military, lastPayYear: s.year },
    economy: s.economy ? { ...s.economy, unpaidStreak: 0 } : s.economy,
    ledger: [{ id: nid("led"), year: s.year, kind: "gider", amount: -cost, noteKey: "ledger.ulufe" }, ...s.ledger].slice(0, 80),
  };
}

export function defendProvince(s: GameState, provinceId: string, rng: () => number): { lost: boolean; state: GameState } {
  const p = s.provinces.find((x) => x.id === provinceId);
  if (!p) return { lost: false, state: s };
  const doctrine = s.military.doctrine;
  if (doctrine === "negotiate" && rng() > 0.45) {
    const logged = pushLog(s, notice(s, "sefer", "log.negotiate.title", "log.negotiate.body", { prov: p.nameKey }));
    return { lost: false, state: logged };
  }
  const armyHere =
    s.army.provinceId === provinceId ||
    ((s.army.status === "idle" || s.army.status === "garrison") && s.army.provinceId === s.realm.capitalId);
  const tactic = doctrineTactic(doctrine, "field");
  const terrain = terrainOf(p);
  const weather = weatherOf(s.year, p);
  const def = hostPower(s, s.army, {
    terrain,
    weather,
    tactic,
    defender: true,
    fort: p.fort,
    doctrine,
  });
  const garrison = p.manpower + p.fort * 900 + p.development * 80;
  const defPower = (armyHere ? def.power * 0.55 : def.power * 0.12) + garrison;
  const atkPower = (p.manpower * 0.85 + 4800) * (0.85 + rng() * 0.3);
  const ratio = defPower / Math.max(1, atkPower);
  let result: BattleResult = ratio >= 1.08 ? "win" : ratio <= 0.78 ? "loss" : "stalemate";
  let next: GameState = s;
  if (doctrine === "scorch") {
    next = {
      ...next,
      provinces: next.provinces.map((x) =>
        x.id === provinceId ? { ...x, prosperity: clamp(x.prosperity - 10, 8, 100), grain: clamp(x.grain - 12, 8, 100) } : x,
      ),
    };
    if (result === "loss") result = "stalemate";
  }
  const moraleDelta = result === "win" ? 4 : result === "loss" ? -8 : -2;
  const host = landHost(s.army);
  const lossRate = armyHere ? (result === "win" ? 0.03 : result === "loss" ? 0.08 : 0.04) : 0;
  next = {
    ...next,
    army: {
      ...next.army,
      morale: clamp(next.army.morale + moraleDelta, 10, 100),
      supply: clamp(next.army.supply - (armyHere ? 6 : 2), 8, 100),
      azab: Math.max(0, Math.round(next.army.azab - host * lossRate * 0.4)),
      akinji: Math.max(0, Math.round(next.army.akinji - host * lossRate * 0.15)),
    },
  };
  const report: BattleReport = {
    id: nid("btl"),
    year: s.year,
    kind: "field",
    provinceId,
    result,
    atkPower: Math.round(atkPower),
    defPower: Math.round(defPower),
    tacticAtk: "center",
    tacticDef: tactic,
    factors: def.factors.slice(0, 4),
    lossesAtk: {},
    lossesDef: Math.round(p.manpower * (result === "win" ? 0.12 : 0.06)),
  };
  next = applyReport(next, report, next.army);
  const lost = result === "loss" && rng() > 0.3;
  return { lost, state: next };
}

export function commanderLabel(s: GameState): string {
  if (s.army.commanderMemberId) {
    return s.members.find((m) => m.id === s.army.commanderMemberId)?.givenName ?? "—";
  }
  if (s.army.commanderNpcId) {
    return s.npcs.find((n) => n.id === s.army.commanderNpcId)?.name ?? "—";
  }
  return holderOf(s, "yeniceri_agasi")?.name ?? "—";
}
