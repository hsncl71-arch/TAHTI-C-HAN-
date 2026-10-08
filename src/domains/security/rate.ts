export type RateWindow = {
  count: number;
  cap: number;
  windowMs: number;
};

export const RATE_CAPS = {
  dispatch: { cap: 48, windowMs: 60_000 },
  hot: { cap: 20, windowMs: 60_000 },
  letter: { cap: 8, windowMs: 3_600_000 },
  report: { cap: 10, windowMs: 3_600_000 },
  counsel: { cap: 6, windowMs: 60_000 },
  admin: { cap: 80, windowMs: 60_000 },
  checkout: { cap: 8, windowMs: 60_000 },
} as const;

export type RateBucket = keyof typeof RATE_CAPS;

export function windowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export function allowRate(count: number, cap: number): boolean {
  return count < cap;
}

export function nextCount(count: number): number {
  return Math.max(0, Math.round(count)) + 1;
}
