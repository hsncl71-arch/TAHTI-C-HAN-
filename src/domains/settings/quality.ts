import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type GfxQuality = "low" | "medium" | "high";

export const GFX_QUALITIES: GfxQuality[] = ["low", "medium", "high"];

export function defaultQuality(): GfxQuality {
  if (typeof navigator === "undefined") return "medium";
  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (typeof mem === "number" && mem <= 2) return "low";
  if (cores <= 4 && (mem ?? 8) <= 4) return "low";
  if (cores >= 8 && (mem ?? 4) >= 8) return "high";
  return "medium";
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function allowsVideo(q: GfxQuality, reduced = false): boolean {
  return q !== "low" && !reduced;
}

export function allowsKenBurns(q: GfxQuality, reduced = false): boolean {
  return q === "high" && !reduced;
}

export function qualityClass(q: GfxQuality): string {
  return `gfx-${q}`;
}

export function applyQualityToDocument(q: GfxQuality, reduced = false): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("gfx-low", "gfx-medium", "gfx-high");
  root.classList.add(qualityClass(q));
  const cut = reduced || prefersReducedMotion();
  root.classList.toggle("motion-reduce", cut);
}

type QualityStore = {
  quality: GfxQuality;
  reducedMotion: boolean;
  setQuality: (quality: GfxQuality) => void;
  setReducedMotion: (on: boolean) => void;
};

const memory: Record<string, string> = {};
const safeStorage = {
  getItem: (key: string) => {
    try {
      if (typeof localStorage !== "undefined") return localStorage.getItem(key);
    } catch {
      /* private mode */
    }
    return memory[key] ?? null;
  },
  setItem: (key: string, value: string) => {
    memory[key] = value;
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (key: string) => {
    delete memory[key];
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const useQuality = create<QualityStore>()(
  persist(
    (set, get) => ({
      quality: "medium",
      reducedMotion: false,
      setQuality: (quality) => {
        applyQualityToDocument(quality, get().reducedMotion);
        set({ quality });
      },
      setReducedMotion: (reducedMotion) => {
        applyQualityToDocument(get().quality, reducedMotion);
        set({ reducedMotion });
      },
    }),
    {
      name: "taht-gfx",
      storage: createJSONStorage(() => safeStorage),
      onRehydrateStorage: () => (state) => {
        if (state) applyQualityToDocument(state.quality, state.reducedMotion);
      },
    },
  ),
);

export function readQuality(): GfxQuality {
  return useQuality.getState().quality;
}

export function readReducedMotion(): boolean {
  return useQuality.getState().reducedMotion || prefersReducedMotion();
}
