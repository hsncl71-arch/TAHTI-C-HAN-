import type { StorePlatform } from "@/domains/commerce/model";

type NativeShell = {
  TahtNative?: { platform?: string };
  StoreKit?: {
    purchase: (id: string) => Promise<string>;
    restore?: () => Promise<{ productId: string; receipt: string }[] | string>;
    manageSubscriptions?: () => Promise<void>;
  };
  PlayBilling?: {
    purchase: (id: string) => Promise<string>;
    restore?: () => Promise<{ productId: string; receipt: string }[] | string>;
    manageSubscriptions?: () => Promise<void>;
  };
};

function nativeShell(): "ios" | "android" | null {
  if (typeof globalThis === "undefined") return null;
  const w = globalThis as NativeShell;
  if (w.TahtNative?.platform === "ios") return "ios";
  if (w.TahtNative?.platform === "android") return "android";
  return null;
}

/** Store billing only in the native shells. Browser / PWA stays sandbox. */
export function detectStorePlatform(): StorePlatform {
  return nativeShell() ?? "sandbox";
}

function bridge(): NativeShell {
  return globalThis as NativeShell;
}

function asReceipts(raw: unknown): { productId: string; receipt: string }[] {
  if (typeof raw === "string") {
    try {
      return asReceipts(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const r = row as { productId?: string; receipt?: string };
      return { productId: String(r?.productId ?? ""), receipt: String(r?.receipt ?? "") };
    })
    .filter((r) => r.receipt.length > 8);
}

export async function nativePurchase(storeId: string): Promise<{ platform: StorePlatform; receipt: string }> {
  const w = bridge();
  const shell = nativeShell();
  try {
    if (shell === "ios" && typeof w.StoreKit?.purchase === "function") {
      const receipt = await w.StoreKit.purchase(storeId);
      if (!receipt) throw new Error("store_unavailable");
      return { platform: "ios", receipt };
    }
    if (shell === "android" && typeof w.PlayBilling?.purchase === "function") {
      const receipt = await w.PlayBilling.purchase(storeId);
      if (!receipt) throw new Error("store_unavailable");
      return { platform: "android", receipt };
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw === "cancelled" || raw === "pending" || raw === "product_missing" || raw === "unverified") throw new Error(raw);
    throw new Error(raw || "store_unavailable");
  }
  throw new Error("store_unavailable");
}

export async function nativeRestore(): Promise<{ platform: StorePlatform; receipts: { productId: string; receipt: string }[] } | null> {
  const w = bridge();
  const shell = nativeShell();
  try {
    if (shell === "ios" && typeof w.StoreKit?.restore === "function") {
      const receipts = await w.StoreKit.restore();
      return { platform: "ios", receipts: asReceipts(receipts) };
    }
    if (shell === "android" && typeof w.PlayBilling?.restore === "function") {
      const receipts = await w.PlayBilling.restore();
      return { platform: "android", receipts: asReceipts(receipts) };
    }
  } catch {
    return null;
  }
  return null;
}

export async function nativeManageSubscriptions(): Promise<boolean> {
  const w = bridge();
  try {
    if (typeof w.StoreKit?.manageSubscriptions === "function") {
      await w.StoreKit.manageSubscriptions();
      return true;
    }
    if (typeof w.PlayBilling?.manageSubscriptions === "function") {
      await w.PlayBilling.manageSubscriptions();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function meshPeerId(userId: string): string {
  const compact = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "anon";
  return `p-${compact}`;
}
