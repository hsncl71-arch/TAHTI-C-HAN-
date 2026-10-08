import type { Treaty } from "@/domains/types";
import { pairKey } from "@/domains/diplomacy/world";

export type BondSeed = { value: number; treaty: Treaty };

const SEEDS: Array<[string, string, number, Treaty?]> = [
  ["kirim", "osmanli", 35, "alliance"],
  ["karaman", "osmanli", -25],
  ["memluk", "osmanli", -10],
  ["akkoyunlu", "osmanli", -5],
  ["macar", "osmanli", -15],
  ["osmanli", "venedik", 2],
  ["osmanli", "trabzon", -8],
  ["akkoyunlu", "memluk", -12],
  ["karaman", "memluk", 10],
  ["karaman", "akkoyunlu", -6],
  ["macar", "venedik", 8],
  ["trabzon", "venedik", 12],
  ["kirim", "macar", -18],
  ["akkoyunlu", "trabzon", -4],
];

export function defaultBond(a: string, b: string): BondSeed {
  const [x, y] = pairKey(a, b);
  const hit = SEEDS.find((s) => {
    const [p, q] = pairKey(s[0], s[1]);
    return p === x && q === y;
  });
  if (hit) return { value: hit[2], treaty: hit[3] ?? "peace" };
  return { value: 0, treaty: "peace" };
}

export function allDefaultBonds(seatIds: string[]): { a: string; b: string; value: number; treaty: Treaty }[] {
  const out: { a: string; b: string; value: number; treaty: Treaty }[] = [];
  for (let i = 0; i < seatIds.length; i += 1) {
    for (let j = i + 1; j < seatIds.length; j += 1) {
      const [a, b] = pairKey(seatIds[i], seatIds[j]);
      const seed = defaultBond(a, b);
      out.push({ a, b, value: seed.value, treaty: seed.treaty });
    }
  }
  return out;
}
