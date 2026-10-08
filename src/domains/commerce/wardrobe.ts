import type { GameState, WardrobeState } from "@/domains/types";
import { DEFAULT_CATALOG } from "@/domains/commerce/catalog";
import { COSMETIC_GRANTS, DEFAULT_WARDROBE, type CosmeticSlot } from "@/domains/commerce/model";

const SLOTS: Record<CosmeticSlot, keyof WardrobeState> = {
  robe: "robeId",
  palace: "palaceId",
  banner: "bannerId",
};

export function emptyWardrobe(): WardrobeState {
  return { ...DEFAULT_WARDROBE };
}

export function fillWardrobe(raw: Partial<WardrobeState> | undefined): WardrobeState {
  const empty = emptyWardrobe();
  if (!raw) return empty;
  return {
    robeId: asItem("robe", raw.robeId) ?? empty.robeId,
    palaceId: asItem("palace", raw.palaceId) ?? empty.palaceId,
    bannerId: asItem("banner", raw.bannerId) ?? empty.bannerId,
  };
}

export function ensureWardrobe(s: GameState): GameState {
  return { ...s, wardrobe: fillWardrobe(s.wardrobe) };
}

export function equipWardrobe(s: GameState, slot: CosmeticSlot, itemId: string): GameState {
  const wardrobe = fillWardrobe(s.wardrobe);
  const key = SLOTS[slot];
  const next = asItem(slot, itemId);
  if (!next) return s;
  if (wardrobe[key] === next) return s;
  return { ...s, wardrobe: { ...wardrobe, [key]: next } };
}

function asItem(slot: CosmeticSlot, value: unknown): string | null {
  if (value === "default" || value == null || value === "") return "default";
  if (typeof value !== "string") return null;
  if ((COSMETIC_GRANTS as readonly string[]).includes(value)) {
    const product = DEFAULT_CATALOG.find((p) => p.slot === slot && p.grants.includes(value as never));
    return product ? value : null;
  }
  const bySku = DEFAULT_CATALOG.find((p) => p.sku === value && p.slot === slot);
  return bySku ? bySku.grants[0] : null;
}

export function palaceThemeClass(palaceId: string): string {
  if (palaceId === "palace.night") return "palace-theme-night";
  if (palaceId === "palace.dawn") return "palace-theme-dawn";
  return "palace-theme-default";
}

export function robeClass(robeId: string): string {
  if (robeId === "kaftan.night") return "robe-night";
  if (robeId === "kaftan.crimson") return "robe-crimson";
  if (robeId === "kaftan.ivory") return "robe-ivory";
  return "robe-default";
}

export function bannerClass(bannerId: string): string {
  if (bannerId === "banner.tugh") return "banner-tugh";
  if (bannerId === "banner.hilal") return "banner-hilal";
  return "banner-default";
}
