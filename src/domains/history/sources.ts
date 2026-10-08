import type { HistorySource } from "@/domains/types";

/**
 * Bibliographic sources for canon facts. The engine never invents citations.
 * Dates and claims in canon.ts must map to at least one of these works.
 */
export const CANON_SOURCES: Record<string, HistorySource> = {
  inalcik_1973: {
    id: "inalcik_1973",
    work: "The Ottoman Empire: The Classical Age 1300–1600",
    author: "Halil İnalcık",
    year: 1973,
  },
  shaw_1976: {
    id: "shaw_1976",
    work: "History of the Ottoman Empire and Modern Turkey, Volume I",
    author: "Stanford J. Shaw",
    year: 1976,
  },
  babinger_1978: {
    id: "babinger_1978",
    work: "Mehmed the Conqueror and His Time",
    author: "Franz Babinger",
    year: 1978,
  },
  imber_2002: {
    id: "imber_2002",
    work: "The Ottoman Empire, 1300–1650: The Structure of Power",
    author: "Colin Imber",
    year: 2002,
  },
  finkel_2005: {
    id: "finkel_2005",
    work: "Osman's Dream: The Story of the Ottoman Empire 1300–1923",
    author: "Caroline Finkel",
    year: 2005,
  },
};

export function sourceById(id: string): HistorySource | null {
  return CANON_SOURCES[id] ?? null;
}

export function citeSource(id: string): string {
  const s = CANON_SOURCES[id];
  if (!s) return id;
  return `${s.author}, ${s.work} (${s.year})`;
}
