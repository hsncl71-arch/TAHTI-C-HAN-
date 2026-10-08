import type { DeviceToken, PushPayload } from "./model.ts";

export type DeliveryAttempt =
  | { ok: true; channel: "apns" | "fcm" | "web" }
  | { ok: false; reason: string; retry: boolean };

/**
 * Provider-agnostic send. Credentials stay in env. Without them we refuse
 * honestly — queued rows stay queued, never marked sent.
 */
export function canSendIos(): boolean {
  return Boolean(process.env.APNS_KEY_ID?.trim() && process.env.APNS_TEAM_ID?.trim() && process.env.APNS_PRIVATE_KEY?.trim());
}

export function canSendAndroid(): boolean {
  return Boolean(process.env.FCM_SERVER_KEY?.trim() || process.env.FIREBASE_SERVICE_ACCOUNT?.trim());
}

export function attemptPush(device: DeviceToken, payload: PushPayload): DeliveryAttempt {
  if (!payload.route.startsWith("/")) return { ok: false, reason: "bad_route", retry: false };
  if (device.platform === "ios") {
    if (!canSendIos()) return { ok: false, reason: "apns_unconfigured", retry: true };
    return { ok: false, reason: "apns_transport_external", retry: true };
  }
  if (device.platform === "android") {
    if (!canSendAndroid()) return { ok: false, reason: "fcm_unconfigured", retry: true };
    return { ok: false, reason: "fcm_transport_external", retry: true };
  }
  return { ok: false, reason: "web_push_unconfigured", retry: true };
}

export function markOutboxStatus(attempt: DeliveryAttempt): "sent" | "queued" | "failed" {
  if (attempt.ok) return "sent";
  return attempt.retry ? "queued" : "failed";
}
