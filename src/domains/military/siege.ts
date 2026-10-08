import { clamp, nid } from "@/domains/ids";
import type {
  Army,
  BattleReport,
  BattleResult,
  CinemaBeat,
  FortDefense,
  GameState,
  Province,
  SeasonWeather,
  SiegeActionId,
  SiegeCinema,
  SiegeHost,
  SiegeLogEntry,
  SiegeOutcome,
  SiegePhase,
  SiegeState,
  TroopKind,
} from "@/domains/types";
import { TROOP_KINDS } from "@/domains/types";
import { commanderScore } from "@/domains/military/combat";
import { terrainOf } from "@/domains/military/terrain";

export const SIEGE_STILL: Record<CinemaBeat, string> = {
  march: "/art/siege/march.jpg",
  guns: "/art/siege/guns.jpg",
  walls: "/art/siege/walls.jpg",
  cavalry: "/art/siege/cavalry.jpg",
  commander: "/art/siege/commander.jpg",
  victory: "/art/siege/victory.jpg",
  defeat: "/art/siege/defeat.jpg",
};

export const SIEGE_VIDEO: Partial<Record<CinemaBeat, string>> = {
  guns: "/art/siege/guns.mp4",
  victory: "/art/siege/victory.mp4",
};

const ACTIONS: SiegeActionId[] = ["bombard", "sap", "starve", "storm", "wait"];
const BEATS: CinemaBeat[] = ["march", "guns", "walls", "cavalry", "commander", "victory", "defeat"];
const OUTCOMES: SiegeOutcome[] = ["captured", "surrender", "starved", "repulsed", "abandoned"];
const PHASES: SiegePhase[] = ["invest", "breach", "assault", "resolved"];

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function siegeMen(army: Army): number {
  return Math.max(
    0,
    Math.round(army.janissary + army.azab + army.sipahi * 0.35 + army.akinji * 0.2 + army.levend * 0.15),
  );
}

export function defenseFromProvince(p: Province): FortDefense {
  return {
    walls: clamp(28 + p.fort * 16 + p.development * 1.1, 24, 100),
    gates: clamp(22 + p.fort * 14 + (p.port !== "none" ? 6 : 0), 18, 100),
    defense: clamp(20 + p.fort * 12 + p.loyalty * 0.25, 18, 100),
    garrison: Math.max(180, Math.round(p.manpower + p.fort * 420 + p.development * 40)),
    provisions: clamp(Math.round(p.grain * 0.55 + p.prosperity * 0.35 + p.fort * 4), 18, 100),
    morale: clamp(Math.round(28 + p.loyalty * 0.45 + p.fort * 4), 18, 96),
  };
}

export function hostFromState(s: GameState): SiegeHost {
  return {
    artillery: Math.max(0, Math.round(s.army.topcu)),
    preparation: 12,
    supply: s.army.supply,
    men: siegeMen(s.army),
    commanderScore: commanderScore(s),
  };
}

export function siegeProgressOf(siege: SiegeState): number {
  const d = siege.defense;
  const breach = (100 - d.walls) * 0.45 + (100 - d.gates) * 0.25 + (100 - d.morale) * 0.15 + (100 - d.provisions) * 0.15;
  return clamp(Math.round(breach), 0, 100);
}

export function isImportantSiege(s: GameState, provinceId: string): boolean {
  const p = s.provinces.find((x) => x.id === provinceId);
  if (!p) return false;
  const capital = s.foreign.some((f) => f.capitalId === p.id) || p.id === s.realm.capitalId;
  return p.fort >= 3 || p.development >= 14 || capital;
}

export function forecastSiegePowers(
  s: GameState,
  defense: FortDefense,
  host: SiegeHost,
): { atkPower: number; defPower: number } {
  const army = s.army;
  const breach = (100 - defense.walls) / 100;
  const gate = (100 - defense.gates) / 100;
  const atkPower = Math.max(
    40,
    host.men *
      (0.55 + host.commanderScore / 200) *
      (0.7 + army.morale / 250) *
      (0.75 + army.drill / 280) *
      (1 + host.artillery * 0.012) *
      (1 + host.preparation / 220) *
      (1 + breach * 0.7 + gate * 0.45),
  );
  const defPower = Math.max(
    40,
    defense.garrison *
      (0.7 + defense.defense / 250) *
      (0.65 + defense.morale / 220) *
      (1 + defense.walls * 0.011 + defense.gates * 0.007) *
      (0.85 + defense.provisions / 400),
  );
  return { atkPower: Math.round(atkPower), defPower: Math.round(defPower) };
}

function fillDefense(raw: Partial<FortDefense> | undefined, fallback: FortDefense): FortDefense {
  const d = raw ?? {};
  return {
    walls: clamp(num(d.walls, fallback.walls), 0, 100),
    gates: clamp(num(d.gates, fallback.gates), 0, 100),
    defense: clamp(num(d.defense, fallback.defense), 0, 100),
    garrison: Math.max(0, Math.round(num(d.garrison, fallback.garrison))),
    provisions: clamp(num(d.provisions, fallback.provisions), 0, 100),
    morale: clamp(num(d.morale, fallback.morale), 0, 100),
  };
}

function fillHost(raw: Partial<SiegeHost> | undefined, fallback: SiegeHost): SiegeHost {
  const h = raw ?? {};
  return {
    artillery: Math.max(0, Math.round(num(h.artillery, fallback.artillery))),
    preparation: clamp(num(h.preparation, fallback.preparation), 0, 100),
    supply: clamp(num(h.supply, fallback.supply), 0, 100),
    men: Math.max(0, Math.round(num(h.men, fallback.men))),
    commanderScore: clamp(num(h.commanderScore, fallback.commanderScore), 0, 100),
  };
}

function fillCinema(raw: SiegeCinema | null | undefined): SiegeCinema | null {
  if (!raw || !Array.isArray(raw.beats) || !raw.beats.length) return null;
  const outcome: SiegeOutcome = OUTCOMES.includes(raw.outcome) ? raw.outcome : "captured";
  const beats = raw.beats.filter((b): b is CinemaBeat => BEATS.includes(b as CinemaBeat));
  if (!beats.length) return null;
  return {
    outcome,
    beats,
    index: clamp(num(raw.index, 0), 0, Math.max(0, beats.length - 1)),
    provinceId: typeof raw.provinceId === "string" ? raw.provinceId : "",
    year: num(raw.year, 0),
    atkPower: Math.round(num(raw.atkPower, 0)),
    defPower: Math.round(num(raw.defPower, 0)),
  };
}

export function fillSiege(raw: SiegeState | null | undefined, s: GameState): SiegeState | null {
  if (!raw || !raw.provinceId) return null;
  const p = s.provinces.find((x) => x.id === raw.provinceId);
  const fallbackDef = p ? defenseFromProvince(p) : defenseFromProvince(s.provinces[0]);
  const fallbackHost = hostFromState(s);
  const action = raw.lastAction;
  const phase = raw.phase;
  const outcome = raw.outcome;
  const defense = fillDefense(raw.defense, fallbackDef);
  const host = fillHost(raw.host, fallbackHost);
  host.men = siegeMen(s.army);
  host.supply = s.army.supply;
  host.artillery = Math.max(0, Math.round(s.army.topcu));
  host.commanderScore = commanderScore(s);
  const powers = forecastSiegePowers(s, defense, host);
  return {
    provinceId: raw.provinceId,
    yearOpened: num(raw.yearOpened, s.year),
    ticks: Math.max(0, Math.round(num(raw.ticks, 0))),
    phase: PHASES.includes(phase as SiegePhase) ? (phase as SiegePhase) : "invest",
    defense,
    host,
    lastAction: ACTIONS.includes(action as SiegeActionId) ? (action as SiegeActionId) : null,
    outcome: OUTCOMES.includes(outcome as SiegeOutcome) ? (outcome as SiegeOutcome) : null,
    cinema: fillCinema(raw.cinema),
    log: Array.isArray(raw.log) ? raw.log.slice(0, 24) : [],
    atkPower: Math.round(num(raw.atkPower, powers.atkPower)),
    defPower: Math.round(num(raw.defPower, powers.defPower)),
  };
}

export function openSiegeState(s: GameState, provinceId?: string): SiegeState {
  const id = provinceId ?? s.campaign?.targetProvinceId ?? s.army.provinceId;
  const p = s.provinces.find((x) => x.id === id) ?? s.provinces[0];
  const defense = defenseFromProvince(p);
  const host = hostFromState(s);
  const powers = forecastSiegePowers(s, defense, host);
  return {
    provinceId: p.id,
    yearOpened: s.year,
    ticks: 0,
    phase: "invest",
    defense,
    host,
    lastAction: null,
    outcome: null,
    cinema: null,
    log: [],
    atkPower: powers.atkPower,
    defPower: powers.defPower,
  };
}

export function ensureSiege(s: GameState): GameState {
  if (s.siege?.cinema) {
    return { ...s, siege: fillSiege(s.siege, s) };
  }
  if (s.campaign?.phase === "siege") {
    const target = s.campaign.targetProvinceId;
    if (s.siege && s.siege.provinceId === target && !s.siege.outcome) {
      return { ...s, siege: fillSiege(s.siege, s) };
    }
    const opened = openSiegeState(s, target);
    const progress = s.campaign.siegeProgress ?? 0;
    if (progress > 0) {
      opened.defense = {
        ...opened.defense,
        walls: clamp(opened.defense.walls - progress * 0.35, 8, 100),
        gates: clamp(opened.defense.gates - progress * 0.28, 8, 100),
        provisions: clamp(opened.defense.provisions - progress * 0.2, 8, 100),
        morale: clamp(opened.defense.morale - progress * 0.12, 8, 100),
      };
      opened.host = { ...opened.host, preparation: clamp(12 + progress * 0.4, 0, 100) };
      const powers = forecastSiegePowers(s, opened.defense, opened.host);
      opened.atkPower = powers.atkPower;
      opened.defPower = powers.defPower;
    }
    return { ...s, siege: opened };
  }
  if (s.siege && !s.siege.cinema) return { ...s, siege: null };
  return { ...s, siege: s.siege ? fillSiege(s.siege, s) : null };
}

function logEntry(s: GameState, action: SiegeActionId, noteKey: string, vars: SiegeLogEntry["vars"] = {}): SiegeLogEntry {
  return { id: nid("sg"), year: s.year, action, noteKey, vars };
}

function syncHost(siege: SiegeState, army: Army, s: GameState): SiegeState {
  return {
    ...siege,
    host: {
      ...siege.host,
      artillery: Math.max(0, Math.round(army.topcu)),
      supply: army.supply,
      men: siegeMen(army),
      commanderScore: commanderScore({ ...s, army }),
    },
  };
}

function phaseOf(defense: FortDefense, current: SiegePhase, storming: boolean): SiegePhase {
  if (current === "resolved") return "resolved";
  if (storming) return "assault";
  if (defense.walls < 45 || defense.gates < 40) return "breach";
  return "invest";
}

function applyMenLoss(army: Army, lost: number): { army: Army; losses: Partial<Record<TroopKind, number>> } {
  if (lost <= 0) return { army, losses: {} };
  const weights: Record<TroopKind, number> = {
    janissary: 0.32,
    sipahi: 0.14,
    azab: 0.36,
    akinji: 0.1,
    topcu: 0.02,
    navy: 0,
    levend: 0.06,
  };
  const losses: Partial<Record<TroopKind, number>> = {};
  let next = { ...army };
  let remaining = lost;
  for (const kind of TROOP_KINDS) {
    const take = Math.min(next[kind], Math.round(lost * weights[kind]));
    if (take > 0) {
      losses[kind] = take;
      next = { ...next, [kind]: next[kind] - take };
      remaining -= take;
    }
  }
  if (remaining > 0 && next.azab > 0) {
    const extra = Math.min(next.azab, remaining);
    losses.azab = (losses.azab ?? 0) + extra;
    next = { ...next, azab: next.azab - extra };
  }
  return { army: next, losses };
}

function weatherGunMod(weather: SeasonWeather): number {
  if (weather === "rain") return 0.62;
  if (weather === "storm") return 0.48;
  if (weather === "snow") return 0.78;
  return 1;
}

function maybeSally(
  siege: SiegeState,
  army: Army,
  rng: () => number,
): { siege: SiegeState; army: Army; sallied: boolean; hostLoss: number; garrisonLoss: number } {
  const d = siege.defense;
  const can = d.morale > 52 && d.garrison > 600 && d.walls > 32 && d.provisions > 18;
  if (!can || rng() > 0.42) return { siege, army, sallied: false, hostLoss: 0, garrisonLoss: 0 };
  const hostLoss = Math.round(70 + rng() * 240);
  const garrisonLoss = Math.round(50 + rng() * 160);
  const applied = applyMenLoss(army, hostLoss);
  const nextArmy: Army = {
    ...applied.army,
    morale: clamp(applied.army.morale - 4, 10, 100),
    supply: clamp(applied.army.supply - 3, 5, 100),
  };
  const defense: FortDefense = {
    ...d,
    garrison: Math.max(0, d.garrison - garrisonLoss),
    morale: clamp(d.morale - 3, 0, 100),
  };
  return {
    siege: { ...siege, defense },
    army: nextArmy,
    sallied: true,
    hostLoss,
    garrisonLoss,
  };
}

function collapseOutcome(siege: SiegeState): SiegeOutcome | null {
  const d = siege.defense;
  const h = siege.host;
  if (h.supply <= 8 || h.men < 280) return "abandoned";
  if (d.provisions <= 8 && d.morale <= 32) return "starved";
  if (d.morale <= 10 && d.garrison < 480) return "surrender";
  if (d.garrison <= 80 || (d.walls <= 8 && d.gates <= 10 && d.morale < 40)) return "captured";
  return null;
}

function assaultOutcome(ratio: number, defense: FortDefense): SiegeOutcome | null {
  if (ratio >= 1.1) return "captured";
  if (ratio >= 0.94 && (defense.walls < 42 || defense.gates < 38)) return "captured";
  if (ratio <= 0.74) return "repulsed";
  return null;
}

export function cinemaBeatsFor(outcome: SiegeOutcome, important: boolean, cavalry: boolean): CinemaBeat[] {
  const win = outcome === "captured" || outcome === "surrender" || outcome === "starved";
  if (win) {
    if (important) {
      const beats: CinemaBeat[] = ["march", "guns", "walls"];
      if (cavalry) beats.push("cavalry");
      beats.push("commander", "victory");
      return beats;
    }
    return ["guns", "walls", "victory"];
  }
  if (important) return ["march", "guns", "walls", "commander", "defeat"];
  return ["walls", "defeat"];
}

export function makeSiegeCinema(s: GameState, siege: SiegeState): SiegeCinema | null {
  if (!siege.outcome) return null;
  const important = isImportantSiege(s, siege.provinceId);
  const cavalry = s.army.sipahi >= 2000;
  return {
    outcome: siege.outcome,
    beats: cinemaBeatsFor(siege.outcome, important, cavalry),
    index: 0,
    provinceId: siege.provinceId,
    year: s.year,
    atkPower: siege.atkPower,
    defPower: siege.defPower,
  };
}

function finishTick(
  s: GameState,
  siege: SiegeState,
  army: Army,
  action: SiegeActionId,
  noteKey: string,
  vars: SiegeLogEntry["vars"],
  forced?: SiegeOutcome | null,
): { siege: SiegeState; army: Army; report: BattleReport | null } {
  let nextSiege = syncHost(siege, army, s);
  nextSiege = {
    ...nextSiege,
    ticks: nextSiege.ticks + 1,
    lastAction: action,
    phase: phaseOf(nextSiege.defense, nextSiege.phase, action === "storm"),
    log: [logEntry(s, action, noteKey, vars), ...nextSiege.log].slice(0, 24),
  };
  const powers = forecastSiegePowers({ ...s, army }, nextSiege.defense, nextSiege.host);
  nextSiege = { ...nextSiege, atkPower: powers.atkPower, defPower: powers.defPower };
  const outcome = forced ?? collapseOutcome(nextSiege);
  if (outcome) nextSiege = { ...nextSiege, outcome, phase: "resolved" };
  return { siege: nextSiege, army, report: null };
}

export function simulateSiegeAction(
  s: GameState,
  action: SiegeActionId,
  rng: () => number,
): { siege: SiegeState; army: Army; report: BattleReport | null } {
  const base = s.siege ?? openSiegeState(s);
  if (base.outcome) return { siege: base, army: s.army, report: null };
  const weather: SeasonWeather = s.campaign?.weather ?? "fair";
  const p = s.provinces.find((x) => x.id === base.provinceId);
  const coastal = p ? terrainOf(p) === "coast" || terrainOf(p) === "island" : false;
  let siege = { ...base, defense: { ...base.defense }, host: { ...base.host } };
  let army: Army = { ...s.army };

  if (action === "bombard") {
    const prep = 0.55 + siege.host.preparation / 180;
    const gun = weatherGunMod(weather);
    const swing = 0.86 + rng() * 0.28;
    const wallHit = (7 + siege.host.artillery * 0.42) * gun * prep * swing;
    const gateHit = (5 + siege.host.artillery * 0.28) * gun * prep * swing;
    siege.defense = {
      ...siege.defense,
      walls: clamp(siege.defense.walls - wallHit, 0, 100),
      gates: clamp(siege.defense.gates - gateHit, 0, 100),
      defense: clamp(siege.defense.defense - 2, 0, 100),
      garrison: Math.max(0, Math.round(siege.defense.garrison - (18 + siege.host.artillery * 0.9))),
      morale: clamp(siege.defense.morale - 2, 0, 100),
    };
    siege.host = { ...siege.host, preparation: clamp(siege.host.preparation + 10, 0, 100) };
    army = { ...army, supply: clamp(army.supply - 6, 5, 100), morale: clamp(army.morale + 1, 10, 100) };
    const sally = maybeSally(siege, army, rng);
    siege = sally.siege;
    army = sally.army;
    return finishTick(
      s,
      siege,
      army,
      action,
      sally.sallied ? "siege.log.sally" : "siege.log.bombard",
      sally.sallied
        ? { n: Math.round(siegeProgressOf(siege)), lost: sally.hostLoss }
        : { n: Math.round(wallHit), g: Math.round(gateHit) },
    );
  }

  if (action === "sap") {
    const hit = (4.5 + army.drill * 0.06) * (0.88 + rng() * 0.24);
    siege.defense = {
      ...siege.defense,
      walls: clamp(siege.defense.walls - hit, 0, 100),
      gates: clamp(siege.defense.gates - 1.2, 0, 100),
      defense: clamp(siege.defense.defense - 1, 0, 100),
    };
    siege.host = { ...siege.host, preparation: clamp(siege.host.preparation + 14, 0, 100) };
    let cave = 0;
    if (rng() > 0.78) {
      cave = Math.round(40 + rng() * 120);
      const applied = applyMenLoss(army, cave);
      army = { ...applied.army, morale: clamp(applied.army.morale - 2, 10, 100) };
    }
    army = { ...army, supply: clamp(army.supply - 4, 5, 100) };
    return finishTick(s, siege, army, action, cave ? "siege.log.sap_cave" : "siege.log.sap", {
      n: Math.round(hit),
      lost: cave,
    });
  }

  if (action === "starve") {
    const sea = coastal && army.navy > 8 ? 5 : 0;
    const pressure = 8 + sea + siege.host.men / 14000 + siege.host.preparation / 40;
    siege.defense = {
      ...siege.defense,
      provisions: clamp(siege.defense.provisions - pressure, 0, 100),
      morale: clamp(siege.defense.morale - (siege.defense.provisions < 40 ? 6 : 3), 0, 100),
      garrison: Math.max(
        0,
        Math.round(siege.defense.garrison - (siege.defense.provisions < 25 ? 90 : 22)),
      ),
    };
    army = { ...army, supply: clamp(army.supply - 5, 5, 100) };
    const sally = maybeSally(siege, army, rng);
    siege = sally.siege;
    army = sally.army;
    return finishTick(s, siege, army, action, sally.sallied ? "siege.log.sally" : "siege.log.starve", {
      n: Math.round(pressure),
      lost: sally.hostLoss,
    });
  }

  if (action === "wait") {
    const harass = siege.host.artillery > 0 ? (1.6 + siege.host.artillery * 0.04) * weatherGunMod(weather) : 0;
    siege.defense = {
      ...siege.defense,
      walls: clamp(siege.defense.walls - harass, 0, 100),
      provisions: clamp(siege.defense.provisions - 5.5, 0, 100),
      morale: clamp(siege.defense.morale - 2, 0, 100),
    };
    siege.host = { ...siege.host, preparation: clamp(siege.host.preparation + 8, 0, 100) };
    army = {
      ...army,
      supply: clamp(army.supply - 4, 5, 100),
      drill: clamp(army.drill + 1, 0, 100),
      morale: clamp(army.morale + (army.supply > 40 ? 1 : -2), 10, 100),
    };
    const sally = maybeSally(siege, army, rng);
    siege = sally.siege;
    army = sally.army;
    return finishTick(s, siege, army, action, sally.sallied ? "siege.log.sally" : "siege.log.wait", {
      n: Math.round(siegeProgressOf(siege)),
      lost: sally.hostLoss,
    });
  }

  const powers = forecastSiegePowers({ ...s, army }, siege.defense, syncHost(siege, army, s).host);
  const unbreached = siege.defense.walls > 55 && siege.defense.gates > 50 ? 0.72 : 1;
  const swingAtk = 0.88 + rng() * 0.24;
  const swingDef = 0.88 + rng() * 0.24;
  const atkPower = Math.max(40, powers.atkPower * unbreached * swingAtk);
  const defPower = Math.max(40, powers.defPower * swingDef);
  const ratio = atkPower / Math.max(1, defPower);
  const outcome = assaultOutcome(ratio, siege.defense);
  const result: BattleResult =
    outcome === "captured" ? "win" : outcome === "repulsed" ? "loss" : ratio >= 1 ? "stalemate" : "stalemate";
  const lossRate =
    result === "win" ? 0.08 + ((100 - (100 - siege.defense.walls)) / 100) * 0.04 : result === "loss" ? 0.18 : 0.12;
  const lostMen = Math.round(siegeMen(army) * lossRate);
  const applied = applyMenLoss(army, lostMen);
  const defLoss = Math.round(siege.defense.garrison * (result === "win" ? 0.42 : 0.16));
  army = {
    ...applied.army,
    morale: clamp(applied.army.morale + (result === "win" ? 8 : result === "loss" ? -14 : -3), 10, 100),
    experience: clamp(applied.army.experience + (result === "win" ? 7 : 3), 0, 100),
    supply: clamp(applied.army.supply - (result === "win" ? 8 : 12), 5, 100),
  };
  siege.defense = {
    ...siege.defense,
    garrison: Math.max(0, siege.defense.garrison - defLoss),
    walls: clamp(siege.defense.walls - (result === "win" ? 18 : 6), 0, 100),
    gates: clamp(siege.defense.gates - (result === "win" ? 22 : 5), 0, 100),
    morale: clamp(siege.defense.morale - (result === "win" ? 24 : 6), 0, 100),
    defense: clamp(siege.defense.defense - (result === "win" ? 14 : 3), 0, 100),
  };
  siege.host = { ...siege.host, preparation: clamp(siege.host.preparation + 6, 0, 100) };
  const report: BattleReport = {
    id: nid("btl"),
    year: s.year,
    kind: "siege",
    provinceId: siege.provinceId,
    result,
    atkPower: Math.round(atkPower),
    defPower: Math.round(defPower),
    tacticAtk: "artillery",
    tacticDef: "hold_line",
    factors: ["factor.fort", "factor.command", "factor.supply"],
    lossesAtk: applied.losses,
    lossesDef: defLoss,
  };
  const finished = finishTick(
    s,
    { ...siege, atkPower: Math.round(atkPower), defPower: Math.round(defPower) },
    army,
    action,
    result === "win" ? "siege.log.storm_win" : result === "loss" ? "siege.log.storm_loss" : "siege.log.storm_hold",
    { n: Math.round(ratio * 100) },
    outcome,
  );
  return { ...finished, report };
}

export function applySiegeAction(s: GameState, action: SiegeActionId, rng: () => number): GameState {
  const live = ensureSiege(s);
  if (!live.siege || live.siege.outcome) return live;
  const sim = simulateSiegeAction(live, action, rng);
  const progress = siegeProgressOf(sim.siege);
  let next: GameState = {
    ...live,
    army: { ...sim.army, status: "siege" },
    siege: sim.siege,
    campaign: live.campaign
      ? { ...live.campaign, phase: "siege", siegeProgress: progress, lastReportId: sim.report?.id ?? live.campaign.lastReportId }
      : live.campaign,
  };
  if (sim.report) {
    next = {
      ...next,
      military: { ...next.military, battles: [sim.report, ...next.military.battles].slice(0, 24) },
    };
  }
  return next;
}

export function attachSiegeCinema(s: GameState): GameState {
  if (!s.siege?.outcome || s.siege.cinema) return s;
  const cinema = makeSiegeCinema(s, s.siege);
  return { ...s, siege: { ...s.siege, cinema, phase: "resolved" } };
}

export function advanceSiegeCinema(s: GameState): GameState {
  const cinema = s.siege?.cinema;
  if (!cinema) return s;
  if (cinema.index >= cinema.beats.length - 1) return dismissSiegeCinema(s);
  return { ...s, siege: { ...s.siege!, cinema: { ...cinema, index: cinema.index + 1 } } };
}

export function dismissSiegeCinema(s: GameState): GameState {
  if (!s.siege) return s;
  return { ...s, siege: null };
}

export function beatStill(beat: CinemaBeat): string {
  return SIEGE_STILL[beat];
}

export function beatVideo(beat: CinemaBeat, important: boolean): string | null {
  if (!important) return null;
  return SIEGE_VIDEO[beat] ?? null;
}
