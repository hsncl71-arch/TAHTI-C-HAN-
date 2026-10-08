import { isActive, isTerminal, sideOf, type LiveMatch, type MatchStatus } from "./model.ts";

export type ChallengeGuard =
  | { ok: true }
  | { ok: false; error: "self_challenge" | "blocked" | "opponent_busy" | "self_busy" | "bad_opponent" };

export function guardChallenge(input: {
  selfId: string;
  opponentId: string;
  blocked: boolean;
  selfBusy: boolean;
  opponentBusy: boolean;
}): ChallengeGuard {
  if (!input.opponentId) return { ok: false, error: "bad_opponent" };
  if (input.selfId === input.opponentId) return { ok: false, error: "self_challenge" };
  if (input.blocked) return { ok: false, error: "blocked" };
  if (input.selfBusy) return { ok: false, error: "self_busy" };
  if (input.opponentBusy) return { ok: false, error: "opponent_busy" };
  return { ok: true };
}

/** Same pair already in an active field — reuse, do not insert a second row. */
export function reuseActiveMatch(
  existing: LiveMatch | null,
  selfId: string,
  opponentId: string,
): LiveMatch | null {
  if (!existing || !isActive(existing.status)) return null;
  const other = existing.hostUserId === selfId ? existing.guestUserId : existing.hostUserId;
  return other === opponentId ? existing : null;
}

export function memberOrThrow(match: LiveMatch, userId: string): "host" | "guest" {
  const side = sideOf(match, userId);
  if (!side) throw new Error("not_member");
  return side;
}

function seedForClient(match: LiveMatch): number | null {
  if (isTerminal(match.status)) return match.seed;
  return null;
}

/** What a client may see. Never leaks the opponent's locked tactic or the pre-lock seed. */
export function publicMatchView(match: LiveMatch, userId: string) {
  const side = memberOrThrow(match, userId);
  const selfHost = side === "host";
  return {
    id: match.id,
    status: match.status as MatchStatus,
    provinceId: match.provinceId,
    hostName: match.hostName,
    guestName: match.guestName,
    hostSeat: match.hostSeat,
    guestSeat: match.guestSeat,
    selfSide: side,
    opponentName: selfHost ? match.guestName : match.hostName,
    ready: { host: match.hostReady, guest: match.guestReady },
    selfTactic: selfHost ? match.hostTactic : match.guestTactic,
    foeLocked: selfHost ? Boolean(match.guestTactic) : Boolean(match.hostTactic),
    lockAt: match.lockAt,
    seed: seedForClient(match),
    result: match.result,
    winnerUserId: match.winnerUserId,
    forfeitUserId: match.forfeitUserId,
    report: match.report
      ? {
          result: match.report.result,
          atkPower: match.report.atkPower,
          defPower: match.report.defPower,
          tacticAtk: match.report.tacticAtk,
          tacticDef: match.report.tacticDef,
          provinceId: match.report.provinceId,
        }
      : null,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
  };
}

export type PublicMatchView = ReturnType<typeof publicMatchView>;
