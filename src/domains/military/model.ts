import { holderOf } from "@/domains/divan/offices";
import { shortestPath } from "@/domains/military/path";
import { clamp } from "@/domains/ids";
import type { Army, CampaignOp, GameState, MilitaryState, SeasonWeather, TroopKind } from "@/domains/types";
import { TROOP_KINDS } from "@/domains/types";

export function emptyMilitary(): MilitaryState {
  return {
    doctrine: "hold",
    liveOrders: "center",
    lastDrillYear: 0,
    lastPayYear: 0,
    battles: [],
    pendingDuel: null,
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function fillArmy(raw: Partial<Army> | undefined, capitalId: string): Army {
  const a = raw ?? {};
  const status = a.status;
  return {
    janissary: Math.max(0, Math.round(num(a.janissary, 0))),
    sipahi: Math.max(0, Math.round(num(a.sipahi, 0))),
    azab: Math.max(0, Math.round(num(a.azab, 0))),
    akinji: Math.max(0, Math.round(num(a.akinji, 0))),
    topcu: Math.max(0, Math.round(num(a.topcu, 0))),
    navy: Math.max(0, Math.round(num(a.navy, 0))),
    levend: Math.max(0, Math.round(num(a.levend, 0))),
    morale: clamp(num(a.morale, 70), 10, 100),
    provinceId: typeof a.provinceId === "string" && a.provinceId ? a.provinceId : capitalId,
    status: status === "campaign" || status === "garrison" || status === "siege" || status === "retreat" ? status : "idle",
    drill: clamp(num(a.drill, 55), 0, 100),
    experience: clamp(num(a.experience, 40), 0, 100),
    supply: clamp(num(a.supply, 70), 0, 100),
    pay: clamp(num(a.pay, 72), 0, 100),
    commanderNpcId: a.commanderNpcId ?? null,
    commanderMemberId: a.commanderMemberId ?? null,
  };
}

export function fillCampaign(raw: CampaignOp | null | undefined): CampaignOp | null {
  if (!raw || !raw.targetProvinceId) return null;
  const route = Array.isArray(raw.route) && raw.route.length ? raw.route : [raw.targetProvinceId];
  const phase = raw.phase;
  const weather: SeasonWeather =
    raw.weather === "rain" || raw.weather === "snow" || raw.weather === "heat" || raw.weather === "storm" || raw.weather === "fair"
      ? raw.weather
      : "fair";
  return {
    targetProvinceId: raw.targetProvinceId,
    startYear: num(raw.startYear, 0),
    progress: clamp(num(raw.progress, 0), 0, 100),
    route,
    routeIndex: clamp(num(raw.routeIndex, 0), 0, Math.max(0, route.length - 1)),
    phase: phase === "siege" || phase === "field" || phase === "retreat" || phase === "naval" || phase === "march" ? phase : "march",
    siegeProgress: clamp(num(raw.siegeProgress, 0), 0, 100),
    weather,
    lastReportId: raw.lastReportId ?? null,
  };
}

export function fillMilitary(raw: Partial<MilitaryState> | undefined): MilitaryState {
  const base = emptyMilitary();
  if (!raw) return base;
  const doctrine = raw.doctrine;
  const live = raw.liveOrders;
  return {
    doctrine:
      doctrine === "sally" || doctrine === "scorch" || doctrine === "negotiate" || doctrine === "ambush" || doctrine === "hold"
        ? doctrine
        : "hold",
    liveOrders:
      live === "flank" ||
      live === "artillery" ||
      live === "cavalry_charge" ||
      live === "hold_line" ||
      live === "feint" ||
      live === "withdraw" ||
      live === "center"
        ? live
        : "center",
    lastDrillYear: num(raw.lastDrillYear, 0),
    lastPayYear: num(raw.lastPayYear, 0),
    battles: Array.isArray(raw.battles) ? raw.battles.slice(0, 24) : [],
    pendingDuel: raw.pendingDuel ?? null,
  };
}

export function troopCount(a: Army, kind: TroopKind): number {
  return a[kind] ?? 0;
}

export function hostSize(a: Army): number {
  return TROOP_KINDS.reduce((sum, k) => sum + troopCount(a, k), 0);
}

export function landHost(a: Army): number {
  return a.janissary + a.sipahi + a.azab + a.akinji;
}

export function ensureMilitary(s: GameState): GameState {
  const capital = s.realm?.capitalId ?? "konstantiniyye";
  const army = fillArmy(s.army, capital);
  if (!army.commanderNpcId && !army.commanderMemberId) {
    army.commanderNpcId = holderOf(s, "yeniceri_agasi")?.id ?? holderOf(s, "kaptan")?.id ?? null;
  }
  let campaign = fillCampaign(s.campaign);
  if (campaign && campaign.route.length < 2) {
    const path = shortestPath(s.provinces ?? [], army.provinceId || capital, campaign.targetProvinceId);
    if (path && path.length >= 2) campaign = { ...campaign, route: path };
  }
  return {
    ...s,
    army,
    campaign,
    military: fillMilitary(s.military),
  };
}
