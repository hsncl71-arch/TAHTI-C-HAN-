import { clamp } from "@/domains/ids";
import type { DipKind, DipTerms, GameState, Relation } from "@/domains/types";
import { isPlayerHeld } from "@/domains/diplomacy/model";
import { fillRelation } from "@/domains/diplomacy/model";
import type { SeatClaim } from "@/domains/types";
import type { WorldBond } from "@/domains/diplomacy/world";
import { findBond, upsertWorldBond } from "@/domains/diplomacy/world";
import { defaultBond } from "@/domains/diplomacy/defaults";

export function tickAiDiplomacy(s: GameState, rng: () => number): GameState {
  const relations = s.relations.map((r) => {
    const cur = fillRelation(r, r.realmId);
    if (isPlayerHeld(s, cur.realmId)) {
      const value = clamp(cur.value + Math.floor((rng() - 0.5) * 3), -100, 100);
      return { ...cur, value };
    }
    let value = cur.value + Math.floor((rng() - 0.48) * 8);
    let treaty = cur.treaty;
    if (treaty !== "war" && value < -55 && rng() > 0.82) treaty = "war";
    return { ...cur, value: clamp(value, -100, 100), treaty };
  });
  return { ...s, relations };
}

export function playerHeldWars(s: GameState): Relation[] {
  return s.relations.filter((r) => r.treaty === "war" && isPlayerHeld(s, r.realmId));
}

export function aiWars(s: GameState): Relation[] {
  return s.relations.filter((r) => r.treaty === "war" && !isPlayerHeld(s, r.realmId));
}

export function aiAcceptsOffer(s: GameState, realmId: string, kind: DipKind, terms: DipTerms, rng: () => number): boolean {
  if (isPlayerHeld(s, realmId)) return false;
  const rel = s.relations.find((r) => r.realmId === realmId);
  const value = rel?.value ?? 0;
  const treaty = rel?.treaty ?? "peace";
  if (kind === "envoy") return true;
  if (kind === "war") return true;
  if (kind === "peace") {
    if (treaty !== "war") return true;
    return value > -40 || terms.tribute >= 800 || rng() > 0.45;
  }
  if (kind === "alliance") return value >= 8 && treaty !== "war" && rng() > 0.28;
  if (kind === "trade") return treaty !== "war" && value > -25 && rng() > 0.2;
  if (kind === "coalition") return Boolean(terms.againstRealmId) && value > -10 && rng() > 0.35;
  return false;
}

export type WorldTickOffer = {
  fromSeat: string;
  toSeat: string;
  kind: DipKind;
  tribute: number;
  againstSeat: string | null;
};

export function tickWorldAiBonds(
  seats: SeatClaim[],
  bonds: WorldBond[],
  pendingPairs: Array<{ from: string; to: string }>,
  rng: () => number,
): { bonds: WorldBond[]; offers: WorldTickOffer[] } {
  const livePlayer = new Set(seats.filter((s) => s.kind === "player" && s.live).map((s) => s.realmId));
  const all = seats.map((s) => s.realmId);
  let next = bonds;
  const offers: WorldTickOffer[] = [];
  const pending = new Set(pendingPairs.map((p) => `${p.from}>${p.to}`));

  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const a = all[i];
      const b = all[j];
      const aPlayer = livePlayer.has(a);
      const bPlayer = livePlayer.has(b);
      let bond = findBond(next, a, b);
      if (!bond) {
        const seed = defaultBond(a, b);
        bond = { a: a < b ? a : b, b: a < b ? b : a, value: seed.value, treaty: seed.treaty, tradePact: false, coalitionAgainst: null };
        next = upsertWorldBond(next, bond);
      }
      if (aPlayer && bPlayer) continue;

      if (!aPlayer && !bPlayer) {
        let value = bond.value + Math.floor((rng() - 0.48) * 8);
        let treaty = bond.treaty;
        let tradePact = bond.tradePact;
        if (treaty === "war" && rng() > 0.7) {
          treaty = "truce";
          value += 10;
        } else if (treaty !== "war" && value < -55 && rng() > 0.82) {
          treaty = "war";
          tradePact = false;
        } else if (treaty === "peace" && value > 40 && rng() > 0.9) {
          treaty = "alliance";
        }
        next = upsertWorldBond(next, { ...bond, value: clamp(value, -100, 100), treaty, tradePact });
        continue;
      }

      const aiSeat = aPlayer ? b : a;
      const playerSeat = aPlayer ? a : b;
      const value = bond.value + Math.floor((rng() - 0.5) * 4);
      next = upsertWorldBond(next, { ...bond, value: clamp(value, -100, 100) });
      if (pending.has(`${aiSeat}>${playerSeat}`)) continue;
      if (offers.some((o) => o.fromSeat === aiSeat)) continue;
      if (rng() < 0.88) continue;
      if (bond.treaty === "war") {
        offers.push({ fromSeat: aiSeat, toSeat: playerSeat, kind: "peace", tribute: value < -20 ? 0 : 400, againstSeat: null });
      } else if (bond.value > 28 && !bond.tradePact) {
        offers.push({ fromSeat: aiSeat, toSeat: playerSeat, kind: "trade", tribute: 0, againstSeat: null });
      } else if (bond.value > 45 && bond.treaty !== "alliance") {
        offers.push({ fromSeat: aiSeat, toSeat: playerSeat, kind: "alliance", tribute: 0, againstSeat: null });
      } else if (bond.value < -58) {
        offers.push({ fromSeat: aiSeat, toSeat: playerSeat, kind: "war", tribute: 0, againstSeat: null });
      }
    }
  }
  return { bonds: next, offers };
}
