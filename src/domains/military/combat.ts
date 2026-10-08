import { clamp, nid } from "@/domains/ids";
import type {
  Army,
  BattleKind,
  BattleReport,
  BattleResult,
  DoctrineId,
  GameState,
  SeasonWeather,
  TacticId,
  Terrain,
  TroopKind,
} from "@/domains/types";
import { TROOP_KINDS } from "@/domains/types";
import { holderOf } from "@/domains/divan/offices";
import { landHost } from "@/domains/military/model";
import { terrainOf } from "@/domains/military/terrain";

export const TROOP_WEIGHT: Record<TroopKind, number> = {
  janissary: 3.1,
  sipahi: 2.3,
  azab: 1.05,
  akinji: 1.7,
  topcu: 48,
  navy: 18,
  levend: 1.35,
};

const TACTIC_VS: Record<TacticId, Partial<Record<TacticId, number>>> = {
  center: { flank: -0.12, hold_line: 0.04, withdraw: 0.08, feint: -0.06 },
  flank: { center: 0.14, cavalry_charge: -0.08, hold_line: 0.06, feint: -0.12 },
  artillery: { hold_line: 0.16, cavalry_charge: 0.1, center: 0.06, withdraw: -0.04 },
  cavalry_charge: { withdraw: 0.18, center: 0.1, hold_line: -0.14, artillery: -0.08 },
  hold_line: { cavalry_charge: 0.16, flank: -0.06, artillery: -0.1, center: 0.02 },
  feint: { flank: 0.14, hold_line: 0.08, center: 0.06, cavalry_charge: -0.08 },
  withdraw: { cavalry_charge: -0.16, artillery: 0.04, center: -0.06, flank: 0.04 },
};

const TERRAIN_TROOP: Record<Terrain, Partial<Record<TroopKind, number>>> = {
  plain: { sipahi: 0.18, akinji: 0.16, janissary: 0.04 },
  hill: { janissary: 0.1, azab: 0.08, sipahi: -0.08, topcu: 0.06 },
  mountain: { azab: 0.12, sipahi: -0.16, akinji: -0.1, topcu: -0.12 },
  forest: { akinji: 0.12, azab: 0.08, topcu: -0.18, sipahi: -0.1 },
  coast: { navy: 0.22, levend: 0.16, akinji: 0.04 },
  island: { navy: 0.28, levend: 0.2, sipahi: -0.14, akinji: -0.08 },
  desert: { akinji: 0.1, sipahi: 0.04, janissary: -0.08, topcu: -0.06 },
  urban: { janissary: 0.14, azab: 0.08, topcu: 0.1, sipahi: -0.1 },
};

export function commanderScore(s: GameState): number {
  const army = s.army;
  if (army.commanderMemberId) {
    const m = s.members.find((x) => x.id === army.commanderMemberId && x.alive);
    if (m) return clamp(m.military * 0.7 + m.stats.cesaret * 2.2 + m.influence * 0.1, 20, 100);
  }
  if (army.commanderNpcId) {
    const n = s.npcs.find((x) => x.id === army.commanderNpcId && x.alive);
    if (n) return clamp(n.competence * 0.62 + n.loyalty * 0.22 + n.influence * 0.08, 20, 100);
  }
  const aga = holderOf(s, "yeniceri_agasi");
  const kap = holderOf(s, "kaptan");
  const pick = aga ?? kap;
  return pick ? clamp(pick.competence * 0.55 + pick.loyalty * 0.2, 18, 90) : 42;
}

export function hostPower(
  s: GameState,
  army: Army,
  opts: {
    terrain: Terrain;
    weather: SeasonWeather;
    tactic: TacticId;
    siege?: boolean;
    naval?: boolean;
    doctrine?: DoctrineId;
    defender?: boolean;
    fort?: number;
  },
): { power: number; factors: string[] } {
  const factors: string[] = [];
  let raw = 0;
  for (const kind of TROOP_KINDS) {
    let w = TROOP_WEIGHT[kind];
    const tBonus = TERRAIN_TROOP[opts.terrain]?.[kind] ?? 0;
    w *= 1 + tBonus;
    if (kind === "navy" && !opts.naval && opts.terrain !== "coast" && opts.terrain !== "island") w *= 0.15;
    if (kind === "topcu" && opts.siege) w *= 1.35;
    if (kind === "akinji" && opts.siege) w *= 0.55;
    if (kind === "sipahi" && opts.siege) w *= 0.7;
    raw += army[kind] * w;
  }
  const drill = 0.72 + army.drill / 280;
  const exp = 0.78 + army.experience / 260;
  const morale = army.morale / 100;
  const supply = 0.62 + army.supply / 220;
  const pay = 0.7 + army.pay / 280;
  const cmd = 0.82 + commanderScore(s) / 280;
  const cesaret = 0.86 + s.ruler.stats.cesaret / 90;
  let mod = drill * exp * morale * supply * pay * cmd * cesaret;
  factors.push("factor.drill", "factor.command", "factor.supply");

  if (opts.weather === "rain") {
    mod *= 0.92;
    if (army.topcu > 0) mod *= 0.9;
    factors.push("factor.rain");
  }
  if (opts.weather === "snow") {
    mod *= 0.86;
    factors.push("factor.snow");
  }
  if (opts.weather === "heat") {
    mod *= 0.9;
    factors.push("factor.heat");
  }
  if (opts.weather === "storm") {
    mod *= opts.naval ? 0.72 : 0.88;
    factors.push("factor.storm");
  }

  if (opts.defender && opts.fort) {
    mod *= 1 + opts.fort * (opts.siege ? 0.07 : 0.11);
    factors.push("factor.fort");
  }
  if (opts.doctrine === "hold" && opts.defender) mod *= 1.08;
  if (opts.doctrine === "sally" && opts.defender && !opts.siege) mod *= 1.12;
  if (opts.doctrine === "ambush" && opts.defender && (opts.terrain === "forest" || opts.terrain === "hill" || opts.terrain === "mountain")) {
    mod *= 1.16;
    factors.push("factor.ambush");
  }
  if (opts.doctrine === "scorch" && !opts.defender) {
    mod *= 0.84;
    factors.push("factor.scorch");
  }
  if (s.governance?.reforms?.includes("askeri")) {
    mod *= 1.04;
    factors.push("factor.reform");
  }

  const power = Math.max(40, raw * mod);
  return { power, factors };
}

export function tacticEdge(atk: TacticId, def: TacticId): number {
  return TACTIC_VS[atk]?.[def] ?? 0;
}

export function doctrineTactic(doctrine: DoctrineId, kind: BattleKind): TacticId {
  if (kind === "siege") return doctrine === "sally" ? "center" : "hold_line";
  if (kind === "naval") return "artillery";
  switch (doctrine) {
    case "sally":
      return "cavalry_charge";
    case "ambush":
      return "flank";
    case "scorch":
      return "feint";
    case "negotiate":
      return "withdraw";
    default:
      return "hold_line";
  }
}

export function resolveBattle(
  s: GameState,
  opts: {
    kind: BattleKind;
    provinceId: string;
    tacticAtk: TacticId;
    tacticDef: TacticId;
    defenderFort: number;
    defenderManpower: number;
    rng: () => number;
    doctrineDef?: DoctrineId;
  },
): { report: BattleReport; nextArmy: Army } {
  const p = s.provinces.find((x) => x.id === opts.provinceId);
  const terrain = p ? terrainOf(p) : "plain";
  const weather = s.campaign?.weather ?? "fair";
  const naval = opts.kind === "naval" || terrain === "island" || terrain === "coast";
  const siege = opts.kind === "siege";
  const atk = hostPower(s, s.army, {
    terrain,
    weather,
    tactic: opts.tacticAtk,
    siege,
    naval,
  });
  const defBase =
    opts.defenderManpower * 0.95 +
    opts.defenderFort * 1600 +
    (p?.development ?? 8) * 110;
  const defMod =
    0.82 +
    tacticEdge(opts.tacticDef, opts.tacticAtk) * 0.5 +
    (opts.doctrineDef === "hold" ? 0.08 : 0) +
    (opts.doctrineDef === "ambush" && (terrain === "forest" || terrain === "hill") ? 0.12 : 0);
  const atkMod = 1 + tacticEdge(opts.tacticAtk, opts.tacticDef);
  const swing = 0.88 + opts.rng() * 0.24;
  const atkPower = atk.power * atkMod * swing;
  const defPower = Math.max(80, defBase * defMod * (0.88 + opts.rng() * 0.24));
  const ratio = atkPower / Math.max(1, defPower);
  let result: BattleResult = "stalemate";
  if (opts.tacticAtk === "withdraw" && ratio < 1.15) result = "retreat";
  else if (ratio >= 1.12) result = "win";
  else if (ratio <= 0.82) result = "loss";
  else result = "stalemate";

  const host = landHost(s.army);
  const lossRate = result === "win" ? 0.06 : result === "stalemate" ? 0.1 : result === "retreat" ? 0.08 : 0.16;
  const lossesAtk: Partial<Record<TroopKind, number>> = {};
  let nextArmy: Army = { ...s.army };
  for (const kind of TROOP_KINDS) {
    const share =
      kind === "azab" ? 0.38 : kind === "janissary" ? 0.22 : kind === "sipahi" ? 0.18 : kind === "akinji" ? 0.14 : kind === "levend" ? 0.08 : 0.04;
    const lost = Math.round(host * lossRate * share * (kind === "topcu" || kind === "navy" ? 0.15 : 1));
    const take = Math.min(nextArmy[kind], Math.max(0, lost));
    if (take > 0) {
      lossesAtk[kind] = take;
      nextArmy = { ...nextArmy, [kind]: nextArmy[kind] - take };
    }
  }
  const moraleDelta = result === "win" ? 8 : result === "stalemate" ? -2 : result === "retreat" ? -6 : -14;
  const expDelta = result === "win" ? 6 : 3;
  nextArmy = {
    ...nextArmy,
    morale: clamp(nextArmy.morale + moraleDelta, 10, 100),
    experience: clamp(nextArmy.experience + expDelta, 0, 100),
    supply: clamp(nextArmy.supply - (result === "win" ? 6 : 12), 8, 100),
  };

  const report: BattleReport = {
    id: nid("btl"),
    year: s.year,
    kind: opts.kind,
    provinceId: opts.provinceId,
    result,
    atkPower: Math.round(atkPower),
    defPower: Math.round(defPower),
    tacticAtk: opts.tacticAtk,
    tacticDef: opts.tacticDef,
    factors: atk.factors.slice(0, 4),
    lossesAtk,
    lossesDef: Math.round(opts.defenderManpower * (result === "win" ? 0.18 : 0.08)),
  };
  return { report, nextArmy };
}

export function applyReport(s: GameState, report: BattleReport, army: Army): GameState {
  const mil = s.military;
  return {
    ...s,
    army,
    military: { ...mil, battles: [report, ...mil.battles].slice(0, 24) },
  };
}
