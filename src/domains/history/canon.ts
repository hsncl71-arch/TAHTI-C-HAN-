import { OSMANLI_SEAT, PROVINCE_BLUEPRINTS } from "@/domains/map/provinces";
import type { CanonFact, Treaty } from "@/domains/types";
import { CANON_SOURCES } from "@/domains/history/sources";

const I = "inalcik_1973";
const S = "shaw_1976";
const B = "babinger_1978";
const M = "imber_2002";
const F = "finkel_2005";

function fact(
  id: string,
  year: number,
  kind: CanonFact["kind"],
  extra: Omit<CanonFact, "id" | "year" | "kind" | "titleKey" | "bodyKey"> & { starting?: boolean },
): CanonFact {
  return {
    id,
    year,
    kind,
    titleKey: `canon.${id}.title`,
    bodyKey: `canon.${id}.body`,
    actorSeatId: extra.actorSeatId ?? OSMANLI_SEAT,
    ...extra,
  };
}

/**
 * Sourced regional timeline from 1453. This is context and comparison data —
 * the simulation never applies these facts as world mutations.
 */
export const CANON_FACTS: CanonFact[] = [
  fact("ctx_1453_konstantiniyye", 1453, "context", {
    provinceId: "konstantiniyye",
    ownerSeatId: OSMANLI_SEAT,
    sources: [B, I, F],
    starting: true,
  }),
  fact("siege_1456_belgrad", 1456, "failed_siege", {
    provinceId: "belgrad",
    realmId: "macar",
    ownerSeatId: "macar",
    sources: [B, I, F],
  }),
  fact("conquest_1461_trabzon", 1461, "conquest", {
    provinceId: "trabzon",
    realmId: "trabzon",
    ownerSeatId: OSMANLI_SEAT,
    sources: [B, I, S],
  }),
  fact("conquest_1468_konya", 1468, "conquest", {
    provinceId: "konya",
    realmId: "karaman",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("conquest_1468_karaman", 1468, "conquest", {
    provinceId: "karaman",
    realmId: "karaman",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("battle_1473_otlukbeli", 1473, "battle", {
    provinceId: "tebriz",
    realmId: "akkoyunlu",
    ownerSeatId: "akkoyunlu",
    sources: [I, B, F],
  }),
  fact("conquest_1475_kefe", 1475, "conquest", {
    provinceId: "kefe",
    realmId: "kirim",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("treaty_1479_venice", 1479, "treaty", {
    realmId: "venedik",
    treaty: "peace",
    sources: [B, I, M],
  }),
  fact("siege_1480_rodos", 1480, "failed_siege", {
    provinceId: "rodos",
    realmId: "venedik",
    ownerSeatId: "venedik",
    sources: [B, I, F],
  }),
  fact("succession_1481_bayezid", 1481, "succession", {
    successorName: "Bayezid",
    sources: [I, S, F],
  }),
  fact("succession_1512_selim", 1512, "succession", {
    successorName: "Selim",
    sources: [I, S, F],
  }),
  fact("battle_1514_chaldiran", 1514, "battle", {
    provinceId: "tebriz",
    realmId: "akkoyunlu",
    ownerSeatId: "akkoyunlu",
    sources: [I, S, F],
  }),
  fact("conquest_1516_halep", 1516, "conquest", {
    provinceId: "halep",
    realmId: "memluk",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("conquest_1516_sam", 1516, "conquest", {
    provinceId: "sam",
    realmId: "memluk",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("conquest_1517_kahire", 1517, "conquest", {
    provinceId: "kahire",
    realmId: "memluk",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("conquest_1517_iskenderiye", 1517, "conquest", {
    provinceId: "iskenderiye",
    realmId: "memluk",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("conquest_1517_kudus", 1517, "conquest", {
    provinceId: "kudus",
    realmId: "memluk",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("conquest_1517_mekke", 1517, "conquest", {
    provinceId: "mekke",
    realmId: "memluk",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("conquest_1517_medine", 1517, "conquest", {
    provinceId: "medine",
    realmId: "memluk",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("succession_1520_suleyman", 1520, "succession", {
    successorName: "Süleyman",
    sources: [I, S, F],
  }),
  fact("conquest_1521_belgrad", 1521, "conquest", {
    provinceId: "belgrad",
    realmId: "macar",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("conquest_1522_rodos", 1522, "conquest", {
    provinceId: "rodos",
    realmId: "venedik",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("conquest_1526_budin", 1526, "conquest", {
    provinceId: "budin",
    realmId: "macar",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("conquest_1534_bagdat", 1534, "conquest", {
    provinceId: "bagdat",
    realmId: "akkoyunlu",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, F],
  }),
  fact("succession_1566_selim2", 1566, "succession", {
    successorName: "Selim",
    sources: [I, S, F],
  }),
  fact("conquest_1571_kibris", 1571, "conquest", {
    provinceId: "kibris",
    realmId: "venedik",
    ownerSeatId: OSMANLI_SEAT,
    sources: [I, S, M],
  }),
];

export function canonFactById(id: string): CanonFact | undefined {
  return CANON_FACTS.find((f) => f.id === id);
}

export function startingOwners(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of PROVINCE_BLUEPRINTS) {
    out[b.id] = b.home === "player" ? OSMANLI_SEAT : b.home;
  }
  return out;
}

export function canonOwnersAt(year: number): Record<string, string> {
  const owners = startingOwners();
  for (const f of CANON_FACTS) {
    if (f.year > year) continue;
    if (f.kind === "conquest" && f.provinceId && f.ownerSeatId) {
      owners[f.provinceId] = f.ownerSeatId;
    }
  }
  return owners;
}

export function canonTreatiesAt(year: number): Record<string, Treaty> {
  const out: Record<string, Treaty> = {};
  for (const f of CANON_FACTS) {
    if (f.year > year) continue;
    if (f.kind === "treaty" && f.realmId && f.treaty) out[f.realmId] = f.treaty;
  }
  return out;
}

export function canonDueBy(year: number): CanonFact[] {
  return CANON_FACTS.filter((f) => f.year <= year);
}

export function canonUpcoming(year: number, horizon = 40): CanonFact[] {
  return CANON_FACTS.filter((f) => f.year > year && f.year <= year + horizon);
}

export function everyCanonFactIsSourced(): boolean {
  return CANON_FACTS.every((f) => f.sources.length > 0 && f.sources.every((id) => Boolean(CANON_SOURCES[id])));
}
