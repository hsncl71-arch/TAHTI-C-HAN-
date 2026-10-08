import { SEAT_CATALOG, seatById } from "@/domains/map/provinces";
import type { SeatClaim, SeatKind } from "@/domains/types";
import { ABANDON_DAYS } from "@/domains/diplomacy/model";

export const AI_RULERS: Record<string, string> = {
  osmanli: "Mehmed",
  karaman: "İbrahim",
  akkoyunlu: "Uzun Hasan",
  memluk: "Çakmak",
  venedik: "Foscari",
  macar: "László",
  trabzon: "Ioannes",
  kirim: "Hacı Giray",
};

export const SEAT_TITLE: Record<string, string> = {
  osmanli: "Sultan",
  karaman: "Bey",
  akkoyunlu: "Hükümdar",
  memluk: "Sultan",
  venedik: "Doç",
  macar: "Kral",
  trabzon: "Basileus",
  kirim: "Han",
};

export const ABANDON_MS = ABANDON_DAYS * 24 * 60 * 60 * 1000;

export function seatTitle(seatId: string): string {
  return SEAT_TITLE[seatId] ?? "Hükümdar";
}

export function aiRulerName(seatId: string): string {
  return AI_RULERS[seatId] ?? seatById(seatId).adjective;
}

export function isAbandoned(lastSeen: string | Date | null | undefined, now = Date.now()): boolean {
  if (!lastSeen) return true;
  const t = lastSeen instanceof Date ? lastSeen.getTime() : new Date(lastSeen).getTime();
  if (!Number.isFinite(t)) return true;
  return now - t > ABANDON_MS;
}

export type ClaimVerdict = { ok: true } | { ok: false; reason: "self" | "occupied" | "unknown" | "held" };

export function canClaimSeat(
  seat: { kind: SeatKind; userId: string | null; lastSeen?: string | Date | null } | null | undefined,
  userId: string,
  now = Date.now(),
): ClaimVerdict {
  if (!seat) return { ok: false, reason: "unknown" };
  if (seat.userId === userId) return { ok: true };
  if (seat.kind === "player" && seat.userId && !isAbandoned(seat.lastSeen ?? null, now)) {
    return { ok: false, reason: "occupied" };
  }
  return { ok: true };
}

export function userAlreadyHolds(seats: SeatClaim[], userId: string): SeatClaim | undefined {
  return seats.find((s) => s.userId === userId && s.live);
}

export type SeatRow = {
  seatId: string;
  kind: SeatKind;
  userId: string | null;
  campaignId: string | null;
  rulerName: string;
  realmName: string;
  lastSeen: string | null;
};

export function toSeatClaim(row: SeatRow, now = Date.now()): SeatClaim {
  const abandoned = isAbandoned(row.lastSeen, now);
  const live = row.kind === "player" && Boolean(row.userId) && !abandoned;
  return {
    realmId: row.seatId,
    kind: live ? "player" : "ai",
    userId: live ? row.userId : null,
    campaignId: live ? row.campaignId : null,
    rulerName: live ? row.rulerName : aiRulerName(row.seatId),
    realmName: row.realmName,
    live,
    claimable: !live,
  };
}

export function catalogSeatRows(): SeatRow[] {
  return SEAT_CATALOG.map((s) => ({
    seatId: s.id,
    kind: "ai" as const,
    userId: null,
    campaignId: null,
    rulerName: aiRulerName(s.id),
    realmName: s.name,
    lastSeen: null,
  }));
}
