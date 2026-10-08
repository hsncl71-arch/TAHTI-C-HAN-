import { canClaimSeat, type SeatRow } from "@/domains/diplomacy/seats";
import { nid } from "@/domains/ids";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SeatInvite {
  id: string;
  token: string;
  fromUserId: string;
  fromSeat: string;
  targetSeat: string;
  createdAt: number;
  expiresAt: number;
  redeemedBy: string | null;
}

export function mintInviteToken(): string {
  return nid("inv").replace(/[^a-zA-Z0-9]/g, "").slice(-10).toUpperCase();
}

export function canIssueInvite(
  seats: SeatRow[],
  fromUserId: string,
  targetSeat: string,
  now = Date.now(),
): { ok: true } | { ok: false; reason: "self" | "held" | "occupied" | "unknown" } {
  const mine = seats.find((s) => s.userId === fromUserId);
  if (!mine) return { ok: false, reason: "held" };
  if (mine.seatId === targetSeat) return { ok: false, reason: "self" };
  const target = seats.find((s) => s.seatId === targetSeat);
  if (!target) return { ok: false, reason: "unknown" };
  const verdict = canClaimSeat(target, fromUserId, now);
  if (!verdict.ok && verdict.reason === "occupied") return { ok: false, reason: "occupied" };
  if (target.userId && target.userId !== fromUserId && verdict.ok === false) return { ok: false, reason: "occupied" };
  if (target.kind === "player" && target.userId && target.userId !== fromUserId) {
    const claim = canClaimSeat(target, "invitee", now);
    if (!claim.ok) return { ok: false, reason: "occupied" };
  }
  return { ok: true };
}

export function inviteOpen(invite: SeatInvite, now = Date.now()): boolean {
  return !invite.redeemedBy && invite.expiresAt > now;
}

export function canRedeemInvite(
  invite: SeatInvite,
  userId: string,
  seats: SeatRow[],
  now = Date.now(),
): { ok: true } | { ok: false; reason: "self" | "used" | "expired" | "occupied" | "held" } {
  if (invite.fromUserId === userId) return { ok: false, reason: "self" };
  if (invite.redeemedBy) return { ok: false, reason: "used" };
  if (invite.expiresAt <= now) return { ok: false, reason: "expired" };
  const held = seats.find((s) => s.userId === userId && s.kind === "player");
  if (held && held.seatId !== invite.targetSeat) {
    /* rebind is allowed — claimWorldSeat releases the old throne */
  }
  const target = seats.find((s) => s.seatId === invite.targetSeat);
  if (!target) return { ok: false, reason: "occupied" };
  const verdict = canClaimSeat(target, userId, now);
  if (!verdict.ok && verdict.reason === "occupied") return { ok: false, reason: "occupied" };
  return { ok: true };
}

export function issueInvite(args: {
  fromUserId: string;
  fromSeat: string;
  targetSeat: string;
  now?: number;
}): SeatInvite {
  const now = args.now ?? Date.now();
  const token = mintInviteToken();
  return {
    id: nid("sinv"),
    token,
    fromUserId: args.fromUserId,
    fromSeat: args.fromSeat,
    targetSeat: args.targetSeat,
    createdAt: now,
    expiresAt: now + INVITE_TTL_MS,
    redeemedBy: null,
  };
}
