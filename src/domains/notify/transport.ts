/**
 * Real APNs / FCM HTTP. Without credentials we refuse honestly.
 * Never marks a row sent unless the provider returned 2xx.
 */
import { createSign, createPrivateKey } from "node:crypto";
import { connect } from "node:http2";
import { SignJWT, importPKCS8 } from "jose";
import type { DeviceToken, PushPayload } from "./model.ts";
import { canSendAndroid, canSendIos, type DeliveryAttempt } from "./dispatch.ts";

const COPY: Record<string, string> = {
  "push.meydan.title": "Meydan okundu",
  "push.meydan.body": "{name} sizi meydana çağırıyor.",
};

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

function titleOf(payload: PushPayload): string {
  return interpolate(COPY[payload.titleKey] ?? payload.titleKey, payload.vars);
}

function bodyOf(payload: PushPayload): string {
  return interpolate(COPY[payload.bodyKey] ?? payload.bodyKey, payload.vars);
}

export async function deliverPush(device: DeviceToken, payload: PushPayload): Promise<DeliveryAttempt> {
  if (!payload.route.startsWith("/")) return { ok: false, reason: "bad_route", retry: false };
  if (device.platform === "ios") {
    if (!canSendIos()) return { ok: false, reason: "apns_unconfigured", retry: true };
    return sendApns(device, payload);
  }
  if (device.platform === "android") {
    if (!canSendAndroid()) return { ok: false, reason: "fcm_unconfigured", retry: true };
    return sendFcm(device, payload);
  }
  return { ok: false, reason: "web_push_unconfigured", retry: true };
}

function apnsJwt(): string | null {
  const kid = process.env.APNS_KEY_ID?.trim();
  const team = process.env.APNS_TEAM_ID?.trim();
  const pem = (process.env.APNS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  if (!kid || !team || !pem) return null;
  try {
    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid }), "utf8").toString("base64url");
    const claims = Buffer.from(JSON.stringify({ iss: team, iat: Math.floor(Date.now() / 1000) }), "utf8").toString("base64url");
    const key = createPrivateKey({ key: pem, format: "pem" });
    const sig = createSign("SHA256").update(`${header}.${claims}`).sign(key);
    return `${header}.${claims}.${sig.toString("base64url")}`;
  } catch {
    return null;
  }
}

function sendApns(device: DeviceToken, payload: PushPayload): Promise<DeliveryAttempt> {
  const jwt = apnsJwt();
  if (!jwt) return Promise.resolve({ ok: false, reason: "apns_unconfigured", retry: true });
  const topic = process.env.APNS_BUNDLE_ID?.trim() || "com.tahticihan.app";
  const host = process.env.APNS_HOST?.trim() || "api.push.apple.com";
  const body = JSON.stringify({
    aps: {
      alert: { title: titleOf(payload), body: bodyOf(payload) },
      sound: "default",
    },
    route: payload.route,
    kind: payload.kind,
  });
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: DeliveryAttempt) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const client = connect(`https://${host}`);
      client.on("error", () => done({ ok: false, reason: "apns_unreachable", retry: true }));
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${device.token}`,
        authorization: `bearer ${jwt}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
      req.setEncoding("utf8");
      let status = 0;
      req.on("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
      });
      req.on("end", () => {
        client.close();
        if (status >= 200 && status < 300) done({ ok: true, channel: "apns" });
        else if (status === 410) done({ ok: false, reason: "apns_gone", retry: false });
        else done({ ok: false, reason: `apns_${status || "error"}`, retry: status >= 500 || status === 0 });
      });
      req.on("error", () => {
        client.close();
        done({ ok: false, reason: "apns_unreachable", retry: true });
      });
      req.end(body);
    } catch {
      done({ ok: false, reason: "apns_unreachable", retry: true });
    }
  });
}

type GoogleSa = { client_email?: string; private_key?: string; token_uri?: string; project_id?: string };

async function fcmAccess(sa: GoogleSa): Promise<{ token: string; projectId: string } | null> {
  if (!sa.client_email || !sa.private_key || !sa.project_id) return null;
  try {
    const key = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");
    const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(sa.client_email)
      .setAudience(sa.token_uri || "https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) return null;
    return { token: body.access_token, projectId: sa.project_id };
  } catch {
    return null;
  }
}

async function sendFcm(device: DeviceToken, payload: PushPayload): Promise<DeliveryAttempt> {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (saRaw) {
    try {
      const sa = JSON.parse(saRaw) as GoogleSa;
      const auth = await fcmAccess(sa);
      if (!auth) return { ok: false, reason: "fcm_auth_failed", retry: true };
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: { title: titleOf(payload), body: bodyOf(payload) },
            data: { route: payload.route, kind: payload.kind },
            android: { priority: "HIGH" },
          },
        }),
      });
      if (res.ok) return { ok: true, channel: "fcm" };
      if (res.status === 404) return { ok: false, reason: "fcm_gone", retry: false };
      return { ok: false, reason: `fcm_${res.status}`, retry: res.status >= 500 };
    } catch {
      return { ok: false, reason: "fcm_unreachable", retry: true };
    }
  }
  const legacy = process.env.FCM_SERVER_KEY?.trim();
  if (!legacy) return { ok: false, reason: "fcm_unconfigured", retry: true };
  try {
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: { authorization: `key=${legacy}`, "content-type": "application/json" },
      body: JSON.stringify({
        to: device.token,
        notification: { title: titleOf(payload), body: bodyOf(payload) },
        data: { route: payload.route, kind: payload.kind },
        priority: "high",
      }),
    });
    if (res.ok) return { ok: true, channel: "fcm" };
    return { ok: false, reason: `fcm_${res.status}`, retry: res.status >= 500 };
  } catch {
    return { ok: false, reason: "fcm_unreachable", retry: true };
  }
}
