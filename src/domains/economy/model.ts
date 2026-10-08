import { clamp } from "@/domains/ids";
import type {
  EconomyState,
  GameState,
  PeoplePulse,
  PortClass,
  Province,
} from "@/domains/types";

export const TARIFF_MIN = 0.02;
export const TARIFF_MAX = 0.18;
export const TAX_MIN = 0.04;
export const TAX_MAX = 0.24;
export const LOAN_MIN = 500;
export const LOAN_MAX = 8000;
export const DEBT_CAP = 24000;

const ARSENALS = new Set(["konstantiniyye", "iskenderiye"]);
const HARBORS = new Set([
  "selanik",
  "aydin",
  "antalya",
  "trabzon",
  "kibris",
  "rodos",
  "atina",
  "mora",
  "venedik",
  "kefe",
  "basra",
  "kahire",
]);

const AGRI_REGION: Record<string, number> = {
  rumeli: 12,
  anadolu: 10,
  misir: 16,
  sam: 8,
  irak: 6,
  dogu: 4,
  karadeniz: 6,
  orta_avrupa: 8,
  ada: -8,
  hicaz: -14,
  italya: 4,
  iran: 2,
};

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function portOf(id: string, current?: PortClass): PortClass {
  if (ARSENALS.has(id)) return "arsenal";
  if (HARBORS.has(id)) return "harbor";
  if (current === "harbor" || current === "arsenal" || current === "none") return current;
  return "none";
}

export function seedProvinceEconomy(p: Province): Omit<
  Province,
  | "id"
  | "nameKey"
  | "region"
  | "x"
  | "y"
  | "ownerId"
  | "development"
  | "manpower"
  | "taxBase"
  | "loyalty"
  | "religion"
  | "culture"
  | "fort"
  | "neighbors"
> {
  const port = portOf(p.id, p.port);
  const agriBonus = AGRI_REGION[p.region] ?? 0;
  const agriculture = clamp(28 + p.development * 2.1 + agriBonus, 8, 100);
  const production = clamp(16 + p.development * 2.3 + (p.taxBase > 220 ? 10 : 0), 8, 100);
  const trade = clamp(14 + p.taxBase / 8 + (port === "none" ? 0 : 16) + p.development * 0.6, 8, 100);
  const customs = port === "none" ? clamp(8 + p.development * 0.7, 5, 40) : clamp(26 + p.development * 1.6, 18, 92);
  const grain = clamp(42 + agriculture * 0.38, 18, 100);
  const prosperity = clamp(p.loyalty * 0.42 + p.development * 1.7 + agriculture * 0.18, 12, 96);
  const unrest = clamp(100 - p.loyalty - (prosperity - 50) / 5, 0, 92);
  return { agriculture, production, trade, customs, port, grain, prosperity, unrest };
}

export function fillProvince(raw: Province): Province {
  const seeded = seedProvinceEconomy(raw);
  const unseeded = !raw.agriculture && !raw.production && !raw.trade && !raw.grain;
  if (unseeded) return { ...raw, ...seeded };
  return {
    ...raw,
    agriculture: clamp(num(raw.agriculture, seeded.agriculture), 0, 100),
    production: clamp(num(raw.production, seeded.production), 0, 100),
    trade: clamp(num(raw.trade, seeded.trade), 0, 100),
    customs: clamp(num(raw.customs, seeded.customs), 0, 100),
    port: portOf(raw.id, raw.port),
    grain: clamp(num(raw.grain, seeded.grain), 0, 100),
    prosperity: clamp(num(raw.prosperity, seeded.prosperity), 0, 100),
    unrest: clamp(num(raw.unrest, seeded.unrest), 0, 100),
  };
}

export function emptyPeople(): PeoplePulse {
  return { prosperity: 58, peace: 62, taxPressure: 38, foodAccess: 64, allegiance: 72 };
}

export function emptyEconomy(): EconomyState {
  return {
    tariffRate: 0.08,
    grainReserve: 2400,
    loans: [],
    lastBudget: null,
    people: emptyPeople(),
    lastReliefYear: 0,
    famineStreak: 0,
    revoltRisk: 8,
    unpaidStreak: 0,
  };
}

export function fillEconomy(raw: Partial<EconomyState> | undefined): EconomyState {
  const base = emptyEconomy();
  if (!raw) return base;
  return {
    tariffRate: clamp(num(raw.tariffRate, base.tariffRate), TARIFF_MIN, TARIFF_MAX),
    grainReserve: Math.max(0, Math.round(num(raw.grainReserve, base.grainReserve))),
    loans: Array.isArray(raw.loans) ? raw.loans.filter((l) => l && typeof l.principal === "number") : [],
    lastBudget: raw.lastBudget ?? null,
    people: {
      prosperity: clamp(num(raw.people?.prosperity, base.people.prosperity), 0, 100),
      peace: clamp(num(raw.people?.peace, base.people.peace), 0, 100),
      taxPressure: clamp(num(raw.people?.taxPressure, base.people.taxPressure), 0, 100),
      foodAccess: clamp(num(raw.people?.foodAccess, base.people.foodAccess), 0, 100),
      allegiance: clamp(num(raw.people?.allegiance, base.people.allegiance), 0, 100),
    },
    lastReliefYear: num(raw.lastReliefYear, 0),
    famineStreak: Math.max(0, num(raw.famineStreak, 0)),
    revoltRisk: clamp(num(raw.revoltRisk, base.revoltRisk), 0, 100),
    unpaidStreak: Math.max(0, num(raw.unpaidStreak, 0)),
  };
}

export function ownedOf(s: GameState): Province[] {
  return s.provinces.filter((p) => p.ownerId === s.realm.id);
}

export function ensureEconomy(s: GameState): GameState {
  const provinces = (s.provinces ?? []).map(fillProvince);
  const economy = fillEconomy(s.economy);
  return { ...s, provinces, economy };
}
