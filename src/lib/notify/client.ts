import { parseMeydanDeepLink } from "@/domains/notify/model";
import { registerDevice, unregisterDevice } from "@/server/api/notify";

type NativePush = {
  TahtNative?: {
    platform?: "ios" | "android";
    getPushToken?: () => Promise<string | null>;
    requestPush?: () => Promise<string | null>;
  };
};

export function nativePlatform(): "ios" | "android" | null {
  if (typeof globalThis === "undefined") return null;
  const p = (globalThis as NativePush).TahtNative?.platform;
  return p === "ios" || p === "android" ? p : null;
}

export function meydanFromLocation(href = typeof window === "undefined" ? "" : window.location.href): string | null {
  return href ? parseMeydanDeepLink(href) : null;
}

export async function registerPushIfPossible(locale: string): Promise<void> {
  const shell = nativePlatform();
  if (!shell) return;
  const native = (globalThis as NativePush).TahtNative;
  try {
    const token = (await native?.requestPush?.()) ?? (await native?.getPushToken?.()) ?? null;
    if (!token) return;
    await registerDevice({ data: { token, platform: shell, locale } });
  } catch {
    /* credentials / permission missing — not a game failure */
  }
}

export async function clearPushOnSignOut(): Promise<void> {
  try {
    await unregisterDevice({ data: { token: "" } });
  } catch {
    /* ignore */
  }
}
