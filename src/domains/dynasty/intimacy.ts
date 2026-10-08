import type { BondAction, GameState, IntimateScene, IntimateStep } from "@/domains/types";

export const INTIMATE_STEPS: IntimateStep[] = ["kiss", "closeness", "chamber", "veiled", "fade", "aftermath"];

const START_STEP: Record<"kiss" | "private_time" | "halvet", IntimateStep> = {
  kiss: "kiss",
  private_time: "closeness",
  halvet: "chamber",
};

export function sceneArt(step: IntimateStep): string | null {
  switch (step) {
    case "kiss":
      return "/art/cinema/kiss.jpg";
    case "closeness":
      return "/art/cinema/closeness.jpg";
    case "chamber":
      return "/art/rooms/has-oda.jpg";
    case "veiled":
      return "/art/cinema/veiled.jpg";
    case "fade":
      return null;
    case "aftermath":
      return "/art/cinema/aftermath.jpg";
    default:
      return null;
  }
}

export function startScene(s: GameState, partnerId: string, act: BondAction): GameState {
  if (act !== "kiss" && act !== "private_time" && act !== "halvet") return s;
  const scene: IntimateScene = {
    partnerId,
    act,
    step: START_STEP[act],
  };
  return { ...s, harem: { ...s.harem, scene } };
}

export function advanceScene(s: GameState): { state: GameState; finished: boolean; step: IntimateStep | null } {
  const scene = s.harem?.scene;
  if (!scene) return { state: s, finished: true, step: null };
  const idx = INTIMATE_STEPS.indexOf(scene.step);
  if (idx < 0 || idx >= INTIMATE_STEPS.length - 1) {
    return { state: { ...s, harem: { ...s.harem, scene: null } }, finished: true, step: scene.step };
  }
  const step = INTIMATE_STEPS[idx + 1];
  return {
    state: { ...s, harem: { ...s.harem, scene: { ...scene, step } } },
    finished: false,
    step,
  };
}

export function skipScene(s: GameState): GameState {
  if (!s.harem?.scene) return s;
  return { ...s, harem: { ...s.harem, scene: null } };
}

export function sceneLine(step: IntimateStep, locale: "tr" | "en"): string {
  const lines: Record<IntimateStep, { tr: string; en: string }> = {
    kiss: {
      tr: "İki alın yaklaşır. Söz biter, nefes kalır.",
      en: "Two brows draw near. Words end; breath remains.",
    },
    closeness: {
      tr: "Eller buluşur. Oda, dışarıdaki devleti unutturur.",
      en: "Hands meet. The room lets the state wait outside.",
    },
    chamber: {
      tr: "Kapı kapanır. Has oda yalnız ikinizi bilir.",
      en: "The door shuts. The private chamber keeps only the two of you.",
    },
    veiled: {
      tr: "Yorgan ağır, kandil kısık. Mahremiyet perdenin ardındadır.",
      en: "The quilt is heavy, the lamp low. Privacy stays behind the veil.",
    },
    fade: {
      tr: "Gece kendi dilinde konuşur. Sabah başka bir cümle kuracaktır.",
      en: "Night speaks in its own tongue. Morning will make another sentence.",
    },
    aftermath: {
      tr: "Pencereden Boğaz ağarır. İki yüz, giyinik ve sakin, aynı odada.",
      en: "The Bosphorus pales at the window. Two faces, dressed and quiet, share the room.",
    },
  };
  return lines[step][locale];
}
