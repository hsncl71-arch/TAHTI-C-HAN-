const BANNED =
  /\b(amk|aq|orospu|sikik|piç|pic|göt|gotune|salak|gerizekal[ıi]|fuck|shit|bitch|nigger|faggot)\b/i;
const REPEAT = /(.)\1{7,}/;
const URL = /https?:\/\/\S+/i;

export type ModerateResult = { ok: true; text: string } | { ok: false; reason: "empty" | "length" | "abuse" | "spam" | "link" };

export function moderateText(raw: string, max = 400): ModerateResult {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < 2) return { ok: false, reason: "empty" };
  if (text.length > max) return { ok: false, reason: "length" };
  if (URL.test(text)) return { ok: false, reason: "link" };
  if (BANNED.test(text)) return { ok: false, reason: "abuse" };
  if (REPEAT.test(text) || /(\b\w+\b)(?:\s+\1){4,}/i.test(text)) return { ok: false, reason: "spam" };
  return { ok: true, text };
}

export function canRateLimit(count: number, cap = 8): boolean {
  return count < cap;
}
