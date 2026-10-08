import { nid } from "@/domains/ids";
import type { DynastyMember, Education, HaremRank, MemberRole, PortraitKey, RulerStats, TemperId } from "@/domains/types";

const TEMPER_BY_ROLE: Record<MemberRole, TemperId> = {
  sultan: "tedbirli",
  valide: "tedbirli",
  hatun: "comert",
  sehzade: "atesli",
  sultan_kizi: "tedbirli",
  akraba: "supheli",
};

export function defaultHaremRank(role: MemberRole, favorite = false): HaremRank {
  if (role === "valide") return "valide";
  if (role === "hatun") return favorite ? "haseki" : "kadin";
  return "none";
}

export function blankStats(role: MemberRole): RulerStats {
  if (role === "valide") return { adalet: 8, cesaret: 3, ilim: 7, siyaset: 9 };
  if (role === "hatun") return { adalet: 6, cesaret: 4, ilim: 6, siyaset: 7 };
  if (role === "sehzade") return { adalet: 5, cesaret: 6, ilim: 5, siyaset: 5 };
  if (role === "sultan") return { adalet: 6, cesaret: 6, ilim: 6, siyaset: 6 };
  return { adalet: 5, cesaret: 4, ilim: 5, siyaset: 5 };
}

export function makeMember(input: {
  givenName: string;
  gender: "m" | "f";
  role: MemberRole;
  birthYear: number;
  portrait: PortraitKey;
  stats?: RulerStats;
  location: string;
  fatherId?: string | null;
  motherId?: string | null;
  education?: Education | null;
  spouseId?: string | null;
  haremRank?: HaremRank;
  temper?: TemperId;
  military?: number;
  statecraft?: number;
  influence?: number;
  supporters?: string[];
  favorite?: boolean;
  generation?: number;
}): DynastyMember {
  const rank = input.haremRank ?? defaultHaremRank(input.role, Boolean(input.favorite));
  const isPrince = input.role === "sehzade" || input.role === "akraba";
  const generation =
    input.generation ??
    (input.role === "valide" ? 0 : input.role === "sehzade" || input.role === "sultan_kizi" ? 2 : 1);
  return {
    id: nid("m"),
    givenName: input.givenName,
    gender: input.gender,
    role: input.role,
    birthYear: input.birthYear,
    deathYear: null,
    fatherId: input.fatherId ?? null,
    motherId: input.motherId ?? null,
    education: input.education ?? (input.role === "sehzade" ? "seyfiye" : null),
    location: input.location,
    alive: true,
    stats: input.stats ?? blankStats(input.role),
    portrait: input.portrait,
    temper: input.temper ?? TEMPER_BY_ROLE[input.role],
    haremRank: rank,
    spouseId: input.spouseId ?? null,
    military: input.military ?? (isPrince ? 18 : input.role === "valide" ? 8 : 10),
    statecraft: input.statecraft ?? (input.role === "valide" ? 58 : isPrince ? 14 : 16),
    influence: input.influence ?? (input.role === "valide" ? 72 : input.role === "hatun" ? 42 : isPrince ? 16 : 12),
    supporters: input.supporters ?? [],
    generation,
  };
}

export function fillMember(m: DynastyMember, favoriteId?: string | null): DynastyMember {
  return {
    ...m,
    temper: m.temper ?? TEMPER_BY_ROLE[m.role] ?? "tedbirli",
    haremRank: m.haremRank ?? defaultHaremRank(m.role, m.id === favoriteId),
    spouseId: m.spouseId ?? null,
    military: m.military ?? (m.role === "sehzade" || m.role === "akraba" ? 18 : 8),
    statecraft: m.statecraft ?? (m.role === "valide" ? 58 : 14),
    influence: m.influence ?? (m.role === "valide" ? 72 : m.role === "hatun" ? 42 : 16),
    supporters: m.supporters ?? [],
    generation:
      typeof m.generation === "number"
        ? m.generation
        : m.role === "valide"
          ? 0
          : m.role === "sehzade" || m.role === "sultan_kizi"
            ? 2
            : 1,
  };
}
