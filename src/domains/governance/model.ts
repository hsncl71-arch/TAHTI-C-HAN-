import { clamp } from "@/domains/ids";
import type {
  DifficultyId,
  GameSpeed,
  GameState,
  GovernanceState,
  InvestKind,
  PeaceDemand,
  ReformId,
  TaxBand,
} from "@/domains/types";

export const TAX_BAND_RATE: Record<TaxBand, number> = {
  dusuk: 0.08,
  normal: 0.12,
  yuksek: 0.18,
  harp: 0.22,
};

export const REFORM_IDS: ReformId[] = ["askeri", "mali", "idari", "diplomasi", "derya"];
export const INVEST_KINDS: InvestKind[] = ["pazar", "yol", "liman", "depo", "kislak", "tarim", "sur"];
export const TAX_BANDS: TaxBand[] = ["dusuk", "normal", "yuksek", "harp"];
export const DIFFICULTIES: DifficultyId[] = ["kolay", "nizam", "zor", "cihan"];
export const SPEEDS: GameSpeed[] = ["dur", "normal", "hizli"];
export const PEACE_DEMANDS: PeaceDemand[] = ["status", "gold", "province", "tribute"];

const REFORM_SET = new Set<string>(REFORM_IDS);
const INVEST_SET = new Set<string>(INVEST_KINDS);

export function populationOf(p: { manpower: number; development: number }): number {
  return Math.round(p.manpower * 18 + p.development * 400);
}

export function bandFromRate(rate: number): TaxBand {
  if (rate >= 0.2) return "harp";
  if (rate >= 0.155) return "yuksek";
  if (rate <= 0.095) return "dusuk";
  return "normal";
}

export function emptyGovernance(provinces: { id: string; manpower: number; development: number }[] = []): GovernanceState {
  const population: Record<string, number> = {};
  for (const p of provinces) population[p.id] = populationOf(p);
  return {
    taxBand: "normal",
    difficulty: "nizam",
    reforms: [],
    population,
    works: {},
    tutorialStep: 0,
    achievements: [],
    warsWon: 0,
    warsLost: 0,
    conquests: 0,
    peaces: 0,
    speed: "normal",
    ironman: false,
    spy: {},
    lastSpyYear: 0,
    warScore: {},
    tributes: {},
    outcome: "none",
    brokenPacts: 0,
  };
}

function isBand(v: unknown): v is TaxBand {
  return v === "dusuk" || v === "normal" || v === "yuksek" || v === "harp";
}
function isDiff(v: unknown): v is DifficultyId {
  return v === "kolay" || v === "nizam" || v === "zor" || v === "cihan";
}
function isSpeed(v: unknown): v is GameSpeed {
  return v === "dur" || v === "normal" || v === "hizli";
}

export function ensureGovernance(s: GameState): GameState {
  const base = emptyGovernance(s.provinces ?? []);
  const g = s.governance;
  if (!g) return { ...s, governance: base };
  const population = { ...base.population };
  const rawPop = g.population ?? {};
  for (const p of s.provinces ?? []) {
    const n = rawPop[p.id];
    population[p.id] = clamp(typeof n === "number" && Number.isFinite(n) ? Math.round(n) : populationOf(p), 800, 2_000_000);
  }
  const reforms = Array.isArray(g.reforms) ? g.reforms.filter((r): r is ReformId => REFORM_SET.has(r)) : [];
  const works: GovernanceState["works"] = {};
  if (g.works && typeof g.works === "object") {
    for (const [id, row] of Object.entries(g.works)) {
      if (!row || typeof row !== "object") continue;
      const next: Partial<Record<InvestKind, number>> = {};
      for (const [k, n] of Object.entries(row)) {
        if (!INVEST_SET.has(k) || typeof n !== "number") continue;
        next[k as InvestKind] = clamp(Math.round(n), 0, 4);
      }
      works[id] = next;
    }
  }
  return {
    ...s,
    governance: {
      ...base,
      taxBand: isBand(g.taxBand) ? g.taxBand : bandFromRate(s.taxRate),
      difficulty: isDiff(g.difficulty) ? g.difficulty : "nizam",
      reforms,
      population,
      works,
      tutorialStep: clamp(Math.round(g.tutorialStep ?? 0), 0, 12),
      achievements: Array.isArray(g.achievements) ? g.achievements.filter((a) => typeof a === "string").slice(0, 24) : [],
      warsWon: clamp(Math.round(g.warsWon ?? 0), 0, 9999),
      warsLost: clamp(Math.round(g.warsLost ?? 0), 0, 9999),
      conquests: clamp(Math.round(g.conquests ?? 0), 0, 9999),
      peaces: clamp(Math.round(g.peaces ?? 0), 0, 9999),
      speed: isSpeed(g.speed) ? g.speed : "normal",
      ironman: Boolean(g.ironman),
      spy: g.spy && typeof g.spy === "object" ? g.spy : {},
      lastSpyYear: Math.round(g.lastSpyYear ?? 0),
      warScore: g.warScore && typeof g.warScore === "object" ? g.warScore : {},
      tributes: g.tributes && typeof g.tributes === "object" ? g.tributes : {},
      outcome: g.outcome === "glory" || g.outcome === "strain" ? g.outcome : "none",
      brokenPacts: clamp(Math.round(g.brokenPacts ?? 0), 0, 999),
    },
  };
}

export function realmPopulation(s: GameState): number {
  const owned = s.provinces.filter((p) => p.ownerId === s.realm.id);
  const pop = s.governance?.population;
  return owned.reduce((a, p) => a + (pop?.[p.id] ?? populationOf(p)), 0);
}

export function difficultyFactor(s: GameState): number {
  const d = s.governance?.difficulty ?? "nizam";
  if (d === "kolay") return 0.88;
  if (d === "zor") return 1.1;
  if (d === "cihan") return 1.18;
  return 1;
}

export function incomeGovernanceFactor(s: GameState): number {
  let f = 1;
  if (s.governance?.reforms?.includes("mali")) f *= 1.03;
  if (s.governance?.difficulty === "kolay") f *= 1.04;
  if (s.governance?.difficulty === "cihan") f *= 0.96;
  return f;
}

export function populationFactor(s: GameState, provinceId: string, manpower: number, development: number): number {
  const pop = s.governance?.population?.[provinceId];
  if (typeof pop !== "number") return 1;
  const base = Math.max(1, populationOf({ manpower, development }));
  return clamp(pop / base, 0.85, 1.15);
}

export function noteConquest(s: GameState, realmId: string): GameState {
  const next = ensureGovernance(s);
  const g = next.governance;
  const score = clamp(Math.round((g.warScore[realmId] ?? 0) + 16), -80, 100);
  return {
    ...next,
    governance: {
      ...g,
      conquests: g.conquests + 1,
      warsWon: g.warsWon + 1,
      warScore: { ...g.warScore, [realmId]: score },
    },
  };
}

export function noteDefeat(s: GameState, realmId: string): GameState {
  const next = ensureGovernance(s);
  const g = next.governance;
  const score = clamp(Math.round((g.warScore[realmId] ?? 0) - 10), -80, 100);
  return {
    ...next,
    governance: {
      ...g,
      warsLost: g.warsLost + 1,
      warScore: { ...g.warScore, [realmId]: score },
    },
  };
}

export function hateThreshold(aiKey: string | undefined): number {
  if (aiKey === "venedik" || aiKey === "trabzon") return -60;
  if (aiKey === "macar" || aiKey === "akkoyunlu") return -30;
  if (aiKey === "kirim") return -33;
  return -35;
}
