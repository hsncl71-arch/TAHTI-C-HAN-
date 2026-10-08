import type { DiplomacyState, DipOffer, DipTerms, GameState, Relation, SeatClaim } from "@/domains/types";
import { OSMANLI_SEAT, seatById } from "@/domains/map/provinces";

export const ABANDON_DAYS = 7;

export function emptyTerms(): DipTerms {
  return { tribute: 0, durationYears: 5, againstRealmId: null, note: "" };
}

export function emptyDiplomacy(seatId = OSMANLI_SEAT): DiplomacyState {
  return { seatId, seats: [], pending: [] };
}

export function fillRelation(raw: Partial<Relation> | undefined, realmId: string): Relation {
  const treaty = raw?.treaty;
  return {
    realmId,
    value: typeof raw?.value === "number" ? raw.value : 0,
    treaty: treaty === "truce" || treaty === "alliance" || treaty === "war" || treaty === "peace" ? treaty : "peace",
    tradePact: Boolean(raw?.tradePact),
    coalitionAgainst: typeof raw?.coalitionAgainst === "string" && raw.coalitionAgainst ? raw.coalitionAgainst : null,
  };
}

export function fillOffer(raw: Partial<DipOffer> | undefined, id: string): DipOffer | null {
  if (!raw?.fromSeat || !raw.toSeat || !raw.kind) return null;
  const status = raw.status;
  return {
    id,
    fromSeat: raw.fromSeat,
    toSeat: raw.toSeat,
    kind: raw.kind,
    terms: {
      tribute: Number(raw.terms?.tribute ?? 0) || 0,
      durationYears: Number(raw.terms?.durationYears ?? 5) || 5,
      againstRealmId: raw.terms?.againstRealmId ?? null,
      note: raw.terms?.note ?? "",
    },
    status:
      status === "accepted" || status === "refused" || status === "expired" || status === "withdrawn" ? status : "pending",
    year: Number(raw.year ?? 0) || 0,
    fromRuler: raw.fromRuler ?? "",
    fromRealm: raw.fromRealm ?? "",
  };
}

export function fillDiplomacy(raw: Partial<DiplomacyState> | undefined, seatId: string): DiplomacyState {
  const seats = Array.isArray(raw?.seats) ? raw!.seats.filter((s): s is SeatClaim => Boolean(s?.realmId)) : [];
  const pending = Array.isArray(raw?.pending)
    ? raw!.pending.map((o) => fillOffer(o, o.id)).filter((o): o is DipOffer => Boolean(o))
    : [];
  return {
    seatId: typeof raw?.seatId === "string" && raw.seatId ? raw.seatId : seatId,
    seats,
    pending,
  };
}

export function inferSeatId(s: GameState): string {
  if (s.diplomacy?.seatId) return s.diplomacy.seatId;
  const cap = s.realm?.capitalId;
  const hit = cap ? seatById(cap === "konstantiniyye" ? OSMANLI_SEAT : cap) : null;
  if (hit && hit.capitalId === cap) return hit.id;
  return OSMANLI_SEAT;
}

export function isPlayerHeld(s: GameState, realmId: string): boolean {
  const seat = s.diplomacy?.seats.find((x) => x.realmId === realmId);
  if (seat) return seat.kind === "player" && Boolean(seat.userId) && seat.live;
  return false;
}

export function ensureDiplomacy(s: GameState): GameState {
  const seatId = inferSeatId(s);
  const relations = (s.relations ?? []).map((r) => fillRelation(r, r.realmId));
  return {
    ...s,
    relations,
    diplomacy: fillDiplomacy(s.diplomacy, seatId),
  };
}

export function hydrateSeats(s: GameState, seats: SeatClaim[]): GameState {
  const next = ensureDiplomacy(s);
  return { ...next, diplomacy: { ...next.diplomacy, seats } };
}

export function dropOffer(s: GameState, offerId: string): GameState {
  const next = ensureDiplomacy(s);
  return { ...next, diplomacy: { ...next.diplomacy, pending: next.diplomacy.pending.filter((o) => o.id !== offerId) } };
}

export function pushPending(s: GameState, offer: DipOffer): GameState {
  const next = ensureDiplomacy(s);
  const pending = [offer, ...next.diplomacy.pending.filter((o) => o.id !== offer.id)].slice(0, 40);
  return { ...next, diplomacy: { ...next.diplomacy, pending } };
}
