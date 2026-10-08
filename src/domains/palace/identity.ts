import { clamp } from "@/domains/ids";
import type {
  AgeBand,
  CharacterIdentity,
  Constitution,
  ExpressionId,
  FaceDna,
  GameState,
  HealthFlags,
  PalaceRoomId,
  Personality,
  PortraitKey,
  Regalia,
  TemperId,
  TraitId,
} from "@/domains/types";
import { holderOf } from "@/domains/divan/offices";

export const FACE_DNA: Record<PortraitKey, FaceDna> = {
  "sultan-a": {
    complexion: "zeytin-altın",
    eyes: "koyu badem",
    brows: "kalın koyu",
    beard: "kısa siyah sivri sakal",
    bone: "yüksek elmacık, ince çene",
    marks: "sol kulakta altın halka",
  },
  "sultan-b": {
    complexion: "ılık zeytin",
    eyes: "koyu kahve",
    brows: "düz koyu",
    beard: "düzgün kesilmiş dolgun sakal",
    bone: "dolgun yüz, geniş çene",
    marks: "sol kulakta altın halka",
  },
  "sultan-c": {
    complexion: "koyu zeytin",
    eyes: "sert koyu bakış",
    brows: "çatık koyu",
    beard: "sık siyah sakal",
    bone: "ince uzun yüz",
    marks: "sol kulakta altın halka",
  },
  valide: {
    complexion: "olgun zeytin",
    eyes: "koyu, okuyan bakış",
    brows: "ince koyu",
    beard: "yok",
    bone: "yumuşak oval yüz",
    marks: "altın küpe ve işlemeli hotoz",
  },
  vizier: {
    complexion: "soluk zeytin",
    eyes: "şahin bakış",
    brows: "kır",
    beard: "kır-beyaz sakal",
    bone: "çekik alın, uzun yüz",
    marks: "açık baş, kürklü kaftan",
  },
  sehzade: {
    complexion: "genç zeytin",
    eyes: "koyu badem",
    brows: "kalın koyu",
    beard: "yok",
    bone: "henüz oturmamış çene",
    marks: "sol kulakta altın halka",
  },
  kaptan: {
    complexion: "rüzgâr yanığı zeytin",
    eyes: "kısık deniz bakışı",
    brows: "kalın",
    beard: "dolgun koyu sakal",
    bone: "geniş çene",
    marks: "sol kulakta altın halka",
  },
  ulema: {
    complexion: "koyu zeytin",
    eyes: "yavaş koyu bakış",
    brows: "ak",
    beard: "beyaz uzun sakal",
    bone: "çekik yanak, çizgili alın",
    marks: "beyaz sarık",
  },
  hatun: {
    complexion: "zeytin",
    eyes: "koyu kahve badem",
    brows: "kavisli koyu",
    beard: "yok",
    bone: "ince yüz, düz burun",
    marks: "sağ kulakta altın halka, işlemeli hotoz",
  },
  "hatun-b": {
    complexion: "ılık zeytin",
    eyes: "kehribar badem",
    brows: "kavisli koyu",
    beard: "yok",
    bone: "yumuşak yuvarlak yüz",
    marks: "sol göz yanında ben, inci hotoz, alın pendenti",
  },
};

const SULTAN_KEYS = new Set<PortraitKey>(["sultan-a", "sultan-b", "sultan-c"]);

export function isSultanArchetype(key: PortraitKey): boolean {
  return SULTAN_KEYS.has(key);
}

export function buildIdentity(archetypeId: PortraitKey, givenName: string, year: number): CharacterIdentity {
  return {
    archetypeId,
    givenName,
    face: FACE_DNA[archetypeId],
    lockedAtYear: year,
  };
}

export function temperFromTraits(traits: TraitId[]): TemperId {
  if (traits.includes("zahid")) return "sogukkanli";
  if (traits.includes("comertlik")) return "comert";
  if (traits.includes("cesaret") && !traits.includes("siyaset")) return "atesli";
  if (traits.includes("siyaset")) return "tedbirli";
  if (traits.includes("adalet")) return "tedbirli";
  return "supheli";
}

export function personalityFrom(traits: TraitId[]): Personality {
  return { temper: temperFromTraits(traits), traits: [...traits] };
}

export function ageBandOf(age: number): AgeBand {
  if (age < 32) return "young";
  if (age < 46) return "prime";
  if (age < 60) return "mature";
  return "elder";
}

/** CSS class for aging — face DNA / src never changes with age. */
export function ageBandClass(band: AgeBand): string {
  return `is-${band}`;
}

export function constitutionOf(vigor: number, fatigue: number): Constitution {
  if (vigor < 35 || fatigue > 75) return "zayif";
  if (fatigue > 55 || vigor < 50) return "yorgun";
  if (vigor >= 75 && fatigue < 30) return "saglam";
  return "dinc";
}

export function regaliaForRoom(room: PalaceRoomId): Regalia {
  switch (room) {
    case "taht":
    case "elci":
      return "ceremonial";
    case "divan":
    case "hazine":
      return "divan";
    case "askeri":
      return "campaign";
    case "bahce":
      return "garden";
    case "harem":
    case "hasoda":
    case "sehzade":
      return "private";
    default:
      return "ceremonial";
  }
}

export function identitySrc(key: PortraitKey, expression: ExpressionId = "idle"): string {
  if (expression === "idle") return `/art/${key}.jpg`;
  return `/art/identity/${key}/${expression}.jpg`;
}

export function expressionForSovereign(state: GameState, speaking: boolean): ExpressionId {
  const flags = state.ruler.healthFlags;
  if (speaking) return "speak";
  if (flags.constitution === "zayif" || flags.vigor < 40) return "weary";
  if (state.stability < 40 || state.relations.some((r) => r.treaty === "war")) return "stern";
  return "idle";
}

export function comingOfAge(age: number): boolean {
  return age >= 16;
}

export function portraitForRole(role: DynastyMemberRoleLike, fallback: PortraitKey = "sehzade"): PortraitKey {
  if (role === "sultan") return fallback;
  if (role === "valide") return "valide";
  if (role === "hatun" || role === "sultan_kizi") return "hatun";
  if (role === "sehzade" || role === "akraba") return "sehzade";
  return fallback;
}

type DynastyMemberRoleLike = "sultan" | "valide" | "hatun" | "sehzade" | "sultan_kizi" | "akraba";

export function standingFromWorld(s: GameState): {
  healthFlags: HealthFlags;
  reputation: GameState["ruler"]["reputation"];
  authority: GameState["ruler"]["authority"];
} {
  const npcAvg =
    s.npcs.filter((n) => n.alive).reduce((a, n) => a + n.loyalty, 0) / Math.max(1, s.npcs.filter((n) => n.alive).length);
  const peopleAvg =
    s.provinces.filter((p) => p.ownerId === s.realm.id).reduce((a, p) => a + p.loyalty, 0) /
    Math.max(1, s.provinces.filter((p) => p.ownerId === s.realm.id).length);
  const fatigue = s.ruler.healthFlags?.fatigue ?? 20;
  const vigor = clamp(s.ruler.health, 1, 100);
  const healthFlags: HealthFlags = {
    vigor,
    fatigue: clamp(fatigue, 0, 100),
    constitution: constitutionOf(vigor, fatigue),
  };
  const sad = holderOf(s, "sadrazam");
  const sey = holderOf(s, "seyhulislam");
  const aga = holderOf(s, "yeniceri_agasi");
  const sadInfluence = sad?.influence ?? 40;
  const valideTie = s.courtTies?.find((t) => s.members.find((m) => m.id === t.targetId && m.role === "valide"));
  const intrigue = s.harem?.intrigue ?? 12;
  return {
    healthFlags,
    reputation: {
      court: clamp(Math.round(npcAvg * 0.6 + s.stability * 0.4), 0, 100),
      people: clamp(Math.round(peopleAvg), 0, 100),
      ulema: clamp(Math.round(s.piety * 0.7 + (sey?.loyalty ?? 50) * 0.3), 0, 100),
      army: clamp(Math.round(s.army.morale * 0.7 + s.prestige * 0.3), 0, 100),
    },
    authority: {
      divan: clamp(Math.round(s.stability * 0.45 + (sad?.loyalty ?? 50) * 0.35 + Math.max(0, 40 - sadInfluence * 0.3)), 0, 100),
      army: clamp(Math.round(s.ruler.stats.cesaret * 5 + s.army.morale * 0.35 + (aga?.loyalty ?? 50) * 0.15), 0, 100),
      harem: clamp(
        Math.round((valideTie?.affinity ?? 55) * 0.45 + s.stability * 0.25 + Math.max(0, 70 - intrigue) * 0.3),
        0,
        100,
      ),
      ulema: clamp(Math.round(s.piety * 0.5 + s.ruler.stats.ilim * 4), 0, 100),
    },
  };
}

export function lockEquals(a: CharacterIdentity, b: CharacterIdentity): boolean {
  return (
    a.archetypeId === b.archetypeId &&
    a.face.marks === b.face.marks &&
    a.face.beard === b.face.beard &&
    a.face.bone === b.face.bone &&
    a.face.eyes === b.face.eyes
  );
}

export function sovereignArchetype(s: GameState): PortraitKey {
  return s.ruler.identity?.archetypeId ?? s.ruler.portrait;
}
