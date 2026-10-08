export function isNonceShape(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(raw);
}

export function actionFingerprint(input: {
  userId: string;
  type: string;
  year: number;
  tick: number;
}): string {
  return `${input.userId}|${input.type}|${input.year}|${input.tick}`;
}

export function replayTooSoon(prevAt: number | null | undefined, now: number, gapMs = 280): boolean {
  if (!prevAt) return false;
  return now - prevAt < gapMs;
}
