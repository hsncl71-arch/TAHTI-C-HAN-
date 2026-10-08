import type { DipOffer, DipTerms, GameState, Relation, SeatClaim, Treaty } from "@/domains/types";
import { fillRelation } from "@/domains/diplomacy/model";

export type WorldBond = {
  a: string;
  b: string;
  value: number;
  treaty: Treaty;
  tradePact: boolean;
  coalitionAgainst: string | null;
};

export function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function bondId(a: string, b: string): string {
  const [x, y] = pairKey(a, b);
  return `${x}|${y}`;
}

export function otherSeat(bond: WorldBond, seatId: string): string {
  return bond.a === seatId ? bond.b : bond.a;
}

export function findBond(bonds: WorldBond[], a: string, b: string): WorldBond | undefined {
  const [x, y] = pairKey(a, b);
  return bonds.find((bond) => bond.a === x && bond.b === y);
}

export function upsertWorldBond(bonds: WorldBond[], patch: WorldBond): WorldBond[] {
  const [a, b] = pairKey(patch.a, patch.b);
  const next: WorldBond = { ...patch, a, b };
  const idx = bonds.findIndex((bond) => bond.a === a && bond.b === b);
  if (idx < 0) return [...bonds, next];
  const copy = bonds.slice();
  copy[idx] = next;
  return copy;
}

export function relationFromBond(seatId: string, counterpart: string, bond: WorldBond | undefined, fallback?: Relation): Relation {
  if (!bond) return fillRelation(fallback, counterpart);
  const against = bond.coalitionAgainst && bond.coalitionAgainst !== seatId ? bond.coalitionAgainst : null;
  return fillRelation(
    {
      realmId: counterpart,
      value: bond.value,
      treaty: bond.treaty,
      tradePact: bond.tradePact,
      coalitionAgainst: against,
    },
    counterpart,
  );
}

export function bondFromRelation(seatId: string, rel: Relation): WorldBond {
  const [a, b] = pairKey(seatId, rel.realmId);
  return {
    a,
    b,
    value: rel.value,
    treaty: rel.treaty,
    tradePact: rel.tradePact,
    coalitionAgainst: rel.coalitionAgainst,
  };
}

export function hydrateWorldOntoState(
  s: GameState,
  seats: SeatClaim[],
  bonds: WorldBond[],
  pending: DipOffer[],
): GameState {
  const seatId = s.diplomacy?.seatId ?? seats.find((x) => x.userId && x.live)?.realmId ?? "osmanli";
  const known = new Set(s.relations.map((r) => r.realmId));
  const relations = s.relations.map((r) => {
    const bond = findBond(bonds, seatId, r.realmId);
    return relationFromBond(seatId, r.realmId, bond, r);
  });
  for (const seat of seats) {
    if (seat.realmId === seatId || known.has(seat.realmId)) continue;
    const bond = findBond(bonds, seatId, seat.realmId);
    relations.push(relationFromBond(seatId, seat.realmId, bond));
  }
  return {
    ...s,
    foreign: s.foreign.map((f) => {
      const seat = seats.find((x) => x.realmId === f.id);
      return seat ? { ...f, isPlayer: seat.kind === "player" && seat.live } : f;
    }),
    relations,
    diplomacy: {
      seatId,
      seats,
      pending: pending.filter((o) => o.status === "pending" && (o.toSeat === seatId || o.fromSeat === seatId)),
    },
  };
}

export function clampTerms(raw: Partial<DipTerms> | undefined): DipTerms {
  const tribute = Math.max(0, Math.min(8000, Math.round(Number(raw?.tribute ?? 0) || 0)));
  const durationYears = Math.max(1, Math.min(15, Math.round(Number(raw?.durationYears ?? 5) || 5)));
  const against = typeof raw?.againstRealmId === "string" && raw.againstRealmId ? raw.againstRealmId : null;
  const note = typeof raw?.note === "string" ? raw.note.slice(0, 280) : "";
  return { tribute, durationYears, againstRealmId: against, note };
}
