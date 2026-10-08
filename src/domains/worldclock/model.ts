import { nid } from "@/domains/ids";
import {
  MS_PER_YEAR,
  type CatchupBeat,
  type GameState,
  type StandingEdicts,
  type WorldClockState,
  type WorldNotice,
  type WorkProject,
} from "@/domains/types";

export const DEFAULT_EDICTS: StandingEdicts = {
  onAttack: "defend_walls",
  offensive: "never",
  peace: "ask",
  famine: "relief",
  ulufe: "pay",
  debt: "no_borrow",
  tax: "hold",
  trade: "accept_friends",
  warOffer: "refuse",
  works: "none",
};

export function emptyWorldClock(now: number, msPerYear = MS_PER_YEAR): WorldClockState {
  return {
    lastSimAt: now,
    msPerYear,
    paused: false,
    pauseReason: null,
    edicts: { ...DEFAULT_EDICTS },
    works: [],
    notices: [],
    digest: [],
    yearsSimulated: 0,
  };
}

function asEdicts(raw: Partial<StandingEdicts> | undefined): StandingEdicts {
  const d = DEFAULT_EDICTS;
  return {
    onAttack: raw?.onAttack === "sally" || raw?.onAttack === "ask" ? raw.onAttack : d.onAttack,
    offensive: raw?.offensive === "hold_campaign" ? raw.offensive : d.offensive,
    peace: raw?.peace === "accept_if_losing" || raw?.peace === "refuse" ? raw.peace : d.peace,
    famine: raw?.famine === "ask" || raw?.famine === "endure" ? raw.famine : d.famine,
    ulufe: raw?.ulufe === "ask" || raw?.ulufe === "refuse" ? raw.ulufe : d.ulufe,
    debt: raw?.debt === "borrow_if_empty" || raw?.debt === "ask" ? raw.debt : d.debt,
    tax: raw?.tax === "ease_if_unrest" ? raw.tax : d.tax,
    trade: raw?.trade === "ask" || raw?.trade === "refuse" ? raw.trade : d.trade,
    warOffer: raw?.warOffer === "ask" ? raw.warOffer : d.warOffer,
    works: raw?.works === "caravan" ? raw.works : d.works,
  };
}

export function fillWorldClock(raw: Partial<WorldClockState> | undefined, now: number): WorldClockState {
  const base = emptyWorldClock(now);
  if (!raw) return base;
  return {
    lastSimAt: typeof raw.lastSimAt === "number" && raw.lastSimAt > 0 ? raw.lastSimAt : now,
    msPerYear: typeof raw.msPerYear === "number" && raw.msPerYear >= 1_000 ? raw.msPerYear : MS_PER_YEAR,
    paused: Boolean(raw.paused),
    pauseReason: raw.pauseReason ?? null,
    edicts: asEdicts(raw.edicts),
    works: Array.isArray(raw.works) ? raw.works.filter((w): w is WorkProject => Boolean(w?.id && w.building)) : [],
    notices: Array.isArray(raw.notices) ? raw.notices.slice(0, 40) : [],
    digest: Array.isArray(raw.digest) ? raw.digest.slice(0, 24) : [],
    yearsSimulated: typeof raw.yearsSimulated === "number" ? raw.yearsSimulated : 0,
  };
}

export function ensureWorldClock(s: GameState, now = Date.now()): GameState {
  if (s.world?.edicts && typeof s.world.lastSimAt === "number") {
    return { ...s, world: fillWorldClock(s.world, s.world.lastSimAt) };
  }
  return { ...s, world: fillWorldClock(s.world, now) };
}

export function patchEdicts(s: GameState, patch: Partial<StandingEdicts>): GameState {
  const world = fillWorldClock(s.world, s.world?.lastSimAt ?? Date.now());
  return { ...s, world: { ...world, edicts: asEdicts({ ...world.edicts, ...patch }) } };
}

export function pushNotice(s: GameState, notice: Omit<WorldNotice, "id" | "at" | "read" | "year"> & { year?: number; at?: number }): GameState {
  const world = fillWorldClock(s.world, s.world?.lastSimAt ?? Date.now());
  const row: WorldNotice = {
    id: nid("note"),
    year: notice.year ?? s.year,
    kind: notice.kind,
    severity: notice.severity,
    titleKey: notice.titleKey,
    bodyKey: notice.bodyKey,
    vars: notice.vars ?? {},
    read: false,
    at: notice.at ?? Date.now(),
  };
  const digest: CatchupBeat = { year: row.year, kind: row.kind, titleKey: row.titleKey };
  return {
    ...s,
    world: {
      ...world,
      notices: [row, ...world.notices].slice(0, 40),
      digest: [digest, ...world.digest].slice(0, 24),
    },
  };
}

export function markNoticeRead(s: GameState, id: string): GameState {
  const world = fillWorldClock(s.world, s.world?.lastSimAt ?? Date.now());
  return {
    ...s,
    world: {
      ...world,
      notices: world.notices.map((n) => (n.id === id ? { ...n, read: true } : n)),
    },
  };
}

export function markAllNoticesRead(s: GameState): GameState {
  const world = fillWorldClock(s.world, s.world?.lastSimAt ?? Date.now());
  return {
    ...s,
    world: { ...world, notices: world.notices.map((n) => ({ ...n, read: true })) },
  };
}

export function unreadNotices(s: GameState): WorldNotice[] {
  return (s.world?.notices ?? []).filter((n) => !n.read);
}

export function bumpSim(s: GameState, years: number): GameState {
  const world = fillWorldClock(s.world, s.world?.lastSimAt ?? Date.now());
  return {
    ...s,
    world: {
      ...world,
      lastSimAt: world.lastSimAt + years * world.msPerYear,
      yearsSimulated: world.yearsSimulated + years,
    },
  };
}

export function setPaused(s: GameState, reason: WorldClockState["pauseReason"]): GameState {
  const world = fillWorldClock(s.world, s.world?.lastSimAt ?? Date.now());
  return { ...s, world: { ...world, paused: Boolean(reason), pauseReason: reason } };
}
