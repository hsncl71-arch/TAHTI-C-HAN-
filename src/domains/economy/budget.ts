import { clamp } from "@/domains/ids";
import type { GameState, ProvinceYield, YearBudget } from "@/domains/types";
import { TROOP_KINDS, TROOP_UPKEEP } from "@/domains/types";
import { courtStipendTotal } from "@/domains/divan/offices";
import { incomeModifier } from "@/domains/divan/politics";
import { fillEconomy, ownedOf } from "@/domains/economy/model";
import { incomeGovernanceFactor, populationFactor } from "@/domains/governance/model";

function warCount(s: GameState): number {
  return s.relations.filter((r) => r.treaty === "war").length;
}

function tradePenalty(s: GameState): number {
  const wars = warCount(s);
  const venice = s.relations.some((r) => r.realmId === "venedik" && r.treaty === "war") ? 0.15 : 0;
  const blockade = wars > 0 && (s.army.navy ?? 0) >= 24 ? 0.06 : 0;
  return clamp(1 - wars * 0.07 - venice - blockade, 0.4, 1);
}

export function totalDebt(s: GameState): number {
  const eco = fillEconomy(s.economy);
  const loans = eco.loans.reduce((a, l) => a + l.principal, 0);
  const deficit = s.treasury < 0 ? Math.round(-s.treasury) : 0;
  return Math.round(loans + deficit);
}

export function militaryUpkeep(s: GameState): number {
  return TROOP_KINDS.filter((k) => k !== "navy" && k !== "levend").reduce(
    (sum, k) => sum + (s.army[k] ?? 0) * TROOP_UPKEEP[k],
    0,
  );
}

export function navyUpkeep(s: GameState): number {
  return (s.army.navy ?? 0) * TROOP_UPKEEP.navy + (s.army.levend ?? 0) * TROOP_UPKEEP.levend + s.buildings.tersane * 80;
}

export function palaceUpkeep(s: GameState): number {
  const bonds = s.harem?.bonds?.length ?? 0;
  const harem = 80 + bonds * 40 + (s.harem?.favoriteId ? 60 : 0);
  const pious = s.buildings.cami * 50 + s.buildings.medrese * 40;
  return 180 + courtStipendTotal(s) + harem + pious;
}

export function constructionUpkeep(s: GameState): number {
  return s.buildings.kervansaray * 28 + s.buildings.hisar * 36 + s.buildings.tersane * 24;
}

export function interestDue(s: GameState): number {
  const eco = fillEconomy(s.economy);
  return Math.round(eco.loans.reduce((a, l) => a + l.principal * l.rate, 0));
}

export function campaignCost(s: GameState): number {
  const troops = s.army.janissary + s.army.sipahi + s.army.azab + (s.army.akinji ?? 0) + (s.army.levend ?? 0);
  return Math.round(troops * 0.08 + s.army.topcu * 12 + s.army.navy * 18 + 450);
}

export function campaignUpkeep(s: GameState): number {
  if (!s.campaign && s.army.status !== "campaign" && s.army.status !== "siege" && s.army.status !== "retreat") return 0;
  return Math.round(militaryUpkeep(s) * 0.22 + 400);
}

function provinceYield(s: GameState, p: GameState["provinces"][number], tariff: number, taxRate: number, penalty: number): ProvinceYield {
  const loyal = p.loyalty / 100;
  const umran = p.development / 10;
  const tax = p.taxBase * 5.2 * umran * (taxRate / 0.12) * loyal * (p.prosperity / 82) * populationFactor(s, p.id, p.manpower, p.development);
  const agriculture = p.agriculture * 3.1 * (p.grain / 62);
  const production = p.production * 2.6 * loyal;
  const trade = p.trade * 3.8 * penalty * (0.85 + p.prosperity / 400);
  const customsBase = p.port === "none" ? p.customs * 1.4 : p.customs * 6.2 * (tariff / 0.08);
  const customs = customsBase * penalty;
  const port = p.port === "arsenal" ? 320 : p.port === "harbor" ? 165 : 0;
  const total = tax + agriculture + production + trade + customs + port;
  return {
    id: p.id,
    tax: Math.round(tax),
    agriculture: Math.round(agriculture),
    production: Math.round(production),
    trade: Math.round(trade),
    customs: Math.round(customs),
    port: Math.round(port),
    total: Math.round(total),
  };
}

export function computeBudget(s: GameState): YearBudget {
  const eco = fillEconomy(s.economy);
  const owned = ownedOf(s);
  const penalty = tradePenalty(s);
  const yields = owned.map((p) => provinceYield(s, p, eco.tariffRate, s.taxRate, penalty));
  const sum = (key: keyof Omit<ProvinceYield, "id">) => yields.reduce((a, y) => a + y[key], 0);

  const tax = sum("tax");
  const agriculture = sum("agriculture");
  const production = sum("production");
  const trade = sum("trade") + s.buildings.kervansaray * 380;
  const customs = sum("customs");
  const ports = sum("port") + s.buildings.tersane * 220;
  const modifier = incomeModifier(s) * incomeGovernanceFactor(s);

  const income = [
    { key: "budget.in.tax", amount: Math.round(tax * modifier) },
    { key: "budget.in.agriculture", amount: Math.round(agriculture * modifier) },
    { key: "budget.in.production", amount: Math.round(production * modifier) },
    { key: "budget.in.trade", amount: Math.round(trade * modifier) },
    { key: "budget.in.customs", amount: Math.round(customs * modifier) },
    { key: "budget.in.ports", amount: Math.round(ports * modifier) },
  ];

  const military = Math.round(militaryUpkeep(s));
  const navy = Math.round(navyUpkeep(s));
  const palace = Math.round(palaceUpkeep(s));
  const construction = Math.round(constructionUpkeep(s));
  const interest = interestDue(s);
  const campaign = campaignUpkeep(s);
  const hoard = Math.round(Math.max(0, s.treasury - 12_000) * 0.16);

  const expense = [
    { key: "budget.out.military", amount: -military },
    { key: "budget.out.navy", amount: -navy },
    { key: "budget.out.palace", amount: -palace },
    { key: "budget.out.construction", amount: -construction },
    { key: "budget.out.interest", amount: -interest },
    { key: "budget.out.campaign", amount: -campaign },
    { key: "budget.out.hoard", amount: -hoard },
  ].filter((l) => l.amount !== 0);

  const totalIncome = income.reduce((a, l) => a + l.amount, 0);
  const totalExpense = -expense.reduce((a, l) => a + l.amount, 0);
  return {
    year: s.year,
    income,
    expense,
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    interest,
    campaign,
    provinces: yields,
  };
}
