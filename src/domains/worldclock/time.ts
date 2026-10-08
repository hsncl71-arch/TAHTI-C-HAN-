import { MAX_CATCHUP_YEARS, MS_PER_YEAR, type GameState } from "@/domains/types";
import { fillWorldClock } from "@/domains/worldclock/model";

export function yearsDue(s: GameState, now: number, msPerYear?: number): number {
  const world = fillWorldClock(s.world, now);
  const ms = msPerYear && msPerYear >= 1_000 ? msPerYear : world.msPerYear || MS_PER_YEAR;
  if (now <= world.lastSimAt) return 0;
  return Math.floor((now - world.lastSimAt) / ms);
}

export function catchupYears(s: GameState, now: number, msPerYear?: number, cap = MAX_CATCHUP_YEARS): number {
  return Math.min(cap, Math.max(0, yearsDue(s, now, msPerYear)));
}

export function nextYearAt(s: GameState, msPerYear?: number): number {
  const world = fillWorldClock(s.world, s.world?.lastSimAt ?? 0);
  const ms = msPerYear && msPerYear >= 1_000 ? msPerYear : world.msPerYear || MS_PER_YEAR;
  return world.lastSimAt + ms;
}

export function secondsUntilYear(s: GameState, now: number, msPerYear?: number): number {
  return Math.max(0, Math.ceil((nextYearAt(s, msPerYear) - now) / 1000));
}

export function scheduleDueAt(lastSimAt: number, msPerYear: number): number {
  return lastSimAt + msPerYear;
}
