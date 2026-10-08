/**
 * Provider-agnostic ICE issuer.
 * Secrets stay on the server. The browser only receives a short-lived TURN lease
 * (coturn REST HMAC) or a static provider pair copied from env — never the secret.
 */
import { createHmac } from "node:crypto";
import { env } from "@/lib/env.server";
import { hostOfTurnUrl, parseTurnUrls, publicStunServers, stunFromEnv, type IcePayload } from "./ice.ts";

const DEFAULT_TTL = 3600;

export function turnTtlSec(): number {
  const n = Number(env("TURN_TTL_SECONDS") ?? DEFAULT_TTL);
  return Number.isFinite(n) && n >= 60 && n <= 86_400 ? Math.round(n) : DEFAULT_TTL;
}

export function turnRestLease(
  secret: string,
  userId: string,
  ttl: number,
  nowMs: number,
): { username: string; credential: string; expiresAt: number } {
  const expiry = Math.floor(nowMs / 1000) + ttl;
  const compact = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "peer";
  const username = `${expiry}:${compact}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential, expiresAt: expiry };
}

function stunServers(): RTCIceServer[] {
  const extra = stunFromEnv(env("STUN_URLS") ?? env("VITE_STUN_URLS"));
  if (extra.length) return [{ urls: extra }];
  return publicStunServers();
}

export function describeIce(nowMs = Date.now()): IcePayload {
  return issueIceServers("describe", nowMs);
}

export function issueIceServers(userId: string, nowMs = Date.now()): IcePayload {
  const turnUrls = parseTurnUrls(env("TURN_URLS"));
  const secret = env("TURN_SECRET");
  const staticUser = env("TURN_USERNAME");
  const staticCred = env("TURN_CREDENTIAL");
  const stun = stunServers();
  const ttl = turnTtlSec();
  const hosts = turnUrls.map(hostOfTurnUrl).filter(Boolean);

  if (turnUrls.length === 0) {
    return {
      iceServers: stun,
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

  if (secret) {
    const lease = turnRestLease(secret, userId, ttl, nowMs);
    return {
      iceServers: [
        ...stun,
        { urls: turnUrls, username: lease.username, credential: lease.credential },
      ],
      status: {
        stun: true,
        turn: true,
        turnHosts: hosts,
        mode: "stun_turn",
        ttlSec: ttl,
        noteKey: "ice.turnReady",
      },
    };
  }

  if (staticUser && staticCred) {
    return {
      iceServers: [...stun, { urls: turnUrls, username: staticUser, credential: staticCred }],
      status: {
        stun: true,
        turn: true,
        turnHosts: hosts,
        mode: "stun_turn",
        ttlSec: ttl,
        noteKey: "ice.turnStatic",
      },
    };
  }

  return {
    iceServers: stun,
    status: {
      stun: true,
      turn: false,
      turnHosts: hosts,
      mode: "stun_only",
      ttlSec: 0,
      noteKey: "ice.turnIncomplete",
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function handleIce(request: Request): Promise<Response> {
  try {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    if (!user?.id) return json({ error: "Unauthorized" }, 401);
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
    const payload = issueIceServers(user.id);
    return json(payload);
  } catch (error) {
    console.error("[ice] issue failed:", error);
    return json(
      {
        iceServers: publicStunServers(),
        status: {
          stun: true,
          turn: false,
          turnHosts: [],
          mode: "stun_only",
          ttlSec: 0,
          noteKey: "ice.unreachable",
        },
      },
      200,
    );
  }
}
