export type PushKind = "meydan" | "diplomacy" | "world" | "succession" | "siege";

export type PushPlatform = "ios" | "android" | "web";

export interface DeviceToken {
  id: string;
  userId: string;
  platform: PushPlatform;
  token: string;
  locale: string;
}

export interface PushPayload {
  kind: PushKind;
  titleKey: string;
  bodyKey: string;
  vars: Record<string, string | number>;
  route: string;
}

export const PUSH_ROUTE_MAX = 180;
export const TOKEN_MAX = 4096;

export function isPushKind(value: string): value is PushKind {
  return value === "meydan" || value === "diplomacy" || value === "world" || value === "succession" || value === "siege";
}

export function isPushPlatform(value: string): value is PushPlatform {
  return value === "ios" || value === "android" || value === "web";
}

export function sanitizeToken(raw: string): string | null {
  const token = raw.trim();
  if (token.length < 16 || token.length > TOKEN_MAX) return null;
  if (!/^[A-Za-z0-9_\-:.]+$/.test(token)) return null;
  return token;
}

export function meydanRoute(matchId: string): string {
  const id = matchId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return `/oyun?meydan=${id}`;
}

export function parseMeydanDeepLink(url: string): string | null {
  try {
    const parsed = new URL(url, "https://tahticihan.app");
    const fromQuery = parsed.searchParams.get("meydan");
    if (fromQuery && /^[a-zA-Z0-9_-]{6,64}$/.test(fromQuery)) return fromQuery;
    const host = parsed.hostname || parsed.host;
    if ((parsed.protocol === "tahticihan:" || host === "meydan") && parsed.pathname) {
      const id = (host === "meydan" ? parsed.pathname : parsed.pathname.replace(/^\/meydan/, "")).replace(/^\//, "");
      if (/^[a-zA-Z0-9_-]{6,64}$/.test(id)) return id;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] === "meydan" && parts[1] && /^[a-zA-Z0-9_-]{6,64}$/.test(parts[1])) return parts[1];
  } catch {
    const m = /meydan[=/]([a-zA-Z0-9_-]{6,64})/.exec(url);
    return m?.[1] ?? null;
  }
  const fallback = /meydan[=/]([a-zA-Z0-9_-]{6,64})/.exec(url);
  return fallback?.[1] ?? null;
}

export function meydanChallengePush(fromName: string, matchId: string): PushPayload {
  return {
    kind: "meydan",
    titleKey: "push.meydan.title",
    bodyKey: "push.meydan.body",
    vars: { name: fromName.slice(0, 40) },
    route: meydanRoute(matchId),
  };
}
