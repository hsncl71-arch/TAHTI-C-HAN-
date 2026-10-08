export type IceMode = "stun_turn" | "stun_only" | "missing";

export type IceStatus = {
  stun: boolean;
  turn: boolean;
  turnHosts: string[];
  mode: IceMode;
  ttlSec: number;
  noteKey: string;
};

export type IcePayload = {
  iceServers: RTCIceServer[];
  status: IceStatus;
};

const PUBLIC_STUN: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
];

export function publicStunServers(): RTCIceServer[] {
  return PUBLIC_STUN;
}

export function stunFromEnv(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.startsWith("stun:"));
}

export function parseTurnUrls(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.startsWith("turn:") || u.startsWith("turns:"));
}

export function hostOfTurnUrl(url: string): string {
  return url.replace(/^turns?:/i, "").split("?")[0]?.split(":")[0] ?? "";
}

/** Client ice fetch. Never contains a long-lived secret — only a leased credential. */
export async function fetchIceServers(): Promise<IcePayload> {
  try {
    const res = await fetch("/api/ice", { credentials: "include", cache: "no-store" });
    if (!res.ok) {
      return {
        iceServers: publicStunServers(),
        status: {
          stun: true,
          turn: false,
          turnHosts: [],
          mode: "stun_only",
          ttlSec: 0,
          noteKey: res.status === 401 ? "ice.auth" : "ice.stunOnly",
        },
      };
    }
    const body = (await res.json()) as IcePayload;
    if (!Array.isArray(body.iceServers) || body.iceServers.length === 0) {
      return {
        iceServers: publicStunServers(),
        status: {
          stun: true,
          turn: false,
          turnHosts: [],
          mode: "stun_only",
          ttlSec: 0,
          noteKey: "ice.stunOnly",
        },
      };
    }
    return body;
  } catch {
    return {
      iceServers: publicStunServers(),
      status: {
        stun: true,
        turn: false,
        turnHosts: [],
        mode: "missing",
        ttlSec: 0,
        noteKey: "ice.unreachable",
      },
    };
  }
}
