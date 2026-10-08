import type { GameState, Province, SeasonWeather, Terrain } from "@/domains/types";

const REGION_TERRAIN: Record<string, Terrain> = {
  rumeli: "plain",
  anadolu: "hill",
  dogu: "mountain",
  karadeniz: "forest",
  sam: "hill",
  ada: "island",
  italya: "coast",
  misir: "desert",
  hicaz: "desert",
  irak: "plain",
  iran: "mountain",
  orta_avrupa: "plain",
};

export function terrainOf(p: Province): Terrain {
  if (p.port === "arsenal" || p.port === "harbor") {
    if (p.region === "ada") return "island";
    if (p.development >= 16) return "urban";
    return "coast";
  }
  if (p.development >= 18) return "urban";
  return REGION_TERRAIN[p.region] ?? "plain";
}

export function weatherOf(year: number, p: Province): SeasonWeather {
  const season = ((year % 4) + 4) % 4;
  const terrain = terrainOf(p);
  if (season === 0) {
    if (p.region === "rumeli" || p.region === "orta_avrupa" || p.region === "dogu") return "snow";
    if (terrain === "island" || p.region === "karadeniz") return "storm";
    return "fair";
  }
  if (season === 1) return p.region === "rumeli" || p.region === "anadolu" ? "rain" : "fair";
  if (season === 2) return terrain === "desert" || p.region === "sam" ? "heat" : "fair";
  if (terrain === "island" || p.region === "karadeniz" || p.region === "italya") return "storm";
  return "rain";
}

export function weatherOfState(s: GameState, provinceId: string): SeasonWeather {
  const p = s.provinces.find((x) => x.id === provinceId) ?? s.provinces[0];
  return weatherOf(s.year, p);
}
