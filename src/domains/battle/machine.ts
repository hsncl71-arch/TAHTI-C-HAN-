import { TACTICS, type TacticId } from "@/domains/types";
import {
  MATCH_CHALLENGE_TTL_MS,
  MATCH_FORFEIT_MS,
  MATCH_HEARTBEAT_MISS_MS,
  MATCH_LOCK_MS,
  isTerminal,
  sideOf,
  type LiveMatch,
  type MatchEvent,
  type MatchStep,
} from "./model.ts";

const TACTIC_SET = new Set<string>(TACTICS);

function ok(match: LiveMatch, extra: Partial<LiveMatch> = {}, settle = false): MatchStep {
  return { match: { ...match, ...extra, updatedAt: extra.updatedAt ?? match.updatedAt }, settle };
}

function fail(match: LiveMatch, error: string): MatchStep {
  return { match, settle: false, error };
}

function bothReady(m: LiveMatch, now: number): Partial<LiveMatch> {
  return {
    status: "live",
    lockAt: now + MATCH_LOCK_MS,
    updatedAt: now,
  };
}

function missed(last: number, now: number, window: number): boolean {
  return now - last > window;
}

/**
 * Pure match FSM. Persistence and army math live elsewhere.
 * Duplicate tactics and double-settle are rejected here so the SQL layer
 * can stay a thin store.
 */
export function applyMatchEvent(match: LiveMatch, event: MatchEvent): MatchStep {
  if (isTerminal(match.status) && event.type !== "heartbeat") {
    return fail(match, "match_closed");
  }

  switch (event.type) {
    case "accept": {
      if (match.status !== "open") return fail(match, "not_open");
      if (event.userId !== match.guestUserId) return fail(match, "not_guest");
      if (event.now - match.createdAt > MATCH_CHALLENGE_TTL_MS) {
        return ok(match, { status: "abandoned", updatedAt: event.now });
      }
      return ok(match, {
        status: "lobby",
        guestConnectedAt: event.now,
        hostConnectedAt: event.now,
        updatedAt: event.now,
      });
    }
    case "decline": {
      if (match.status !== "open" && match.status !== "lobby") return fail(match, "not_open");
      const side = sideOf(match, event.userId);
      if (!side) return fail(match, "not_member");
      return ok(match, { status: "abandoned", updatedAt: event.now });
    }
    case "ready": {
      if (match.status !== "lobby" && match.status !== "live") return fail(match, "not_lobby");
      const side = sideOf(match, event.userId);
      if (!side) return fail(match, "not_member");
      const next: LiveMatch = {
        ...match,
        hostReady: side === "host" ? true : match.hostReady,
        guestReady: side === "guest" ? true : match.guestReady,
        hostConnectedAt: side === "host" ? event.now : match.hostConnectedAt,
        guestConnectedAt: side === "guest" ? event.now : match.guestConnectedAt,
        updatedAt: event.now,
      };
      if (next.hostReady && next.guestReady && match.status === "lobby") {
        return ok(next, bothReady(next, event.now));
      }
      return ok(next);
    }
    case "tactic": {
      if (match.status !== "live") return fail(match, "not_live");
      const side = sideOf(match, event.userId);
      if (!side) return fail(match, "not_member");
      if (!TACTIC_SET.has(event.tactic)) return fail(match, "bad_tactic");
      const already = side === "host" ? match.hostTactic : match.guestTactic;
      if (already) {
        if (already === event.tactic) return ok(match);
        return fail(match, "tactic_locked");
      }
      const next: LiveMatch = {
        ...match,
        hostTactic: side === "host" ? event.tactic : match.hostTactic,
        guestTactic: side === "guest" ? event.tactic : match.guestTactic,
        hostConnectedAt: side === "host" ? event.now : match.hostConnectedAt,
        guestConnectedAt: side === "guest" ? event.now : match.guestConnectedAt,
        updatedAt: event.now,
      };
      if (next.hostTactic && next.guestTactic) {
        return { match: { ...next, status: "resolving" }, settle: true };
      }
      if (next.lockAt && event.now >= next.lockAt) {
        return { match: { ...next, status: "resolving" }, settle: true };
      }
      return ok(next);
    }
    case "heartbeat": {
      const side = sideOf(match, event.userId);
      if (!side) return fail(match, "not_member");
      return ok(match, {
        hostConnectedAt: side === "host" ? event.now : match.hostConnectedAt,
        guestConnectedAt: side === "guest" ? event.now : match.guestConnectedAt,
        updatedAt: event.now,
      });
    }
    case "forfeit": {
      if (match.status !== "lobby" && match.status !== "live") return fail(match, "not_live");
      const side = sideOf(match, event.userId);
      if (!side) return fail(match, "not_member");
      return {
        match: {
          ...match,
          status: "forfeit",
          forfeitUserId: event.userId,
          updatedAt: event.now,
        },
        settle: true,
      };
    }
    case "tick": {
      const now = event.now;
      if (match.status === "open" && now - match.createdAt > MATCH_CHALLENGE_TTL_MS) {
        return ok(match, { status: "abandoned", updatedAt: now });
      }
      if (match.status === "lobby") {
        const hostGone = missed(match.hostConnectedAt, now, MATCH_FORFEIT_MS);
        const guestGone = missed(match.guestConnectedAt, now, MATCH_FORFEIT_MS);
        if (hostGone && guestGone) return ok(match, { status: "abandoned", updatedAt: now });
        if (hostGone) {
          return { match: { ...match, status: "forfeit", forfeitUserId: match.hostUserId, updatedAt: now }, settle: true };
        }
        if (guestGone) {
          return { match: { ...match, status: "forfeit", forfeitUserId: match.guestUserId, updatedAt: now }, settle: true };
        }
        return ok(match);
      }
      if (match.status === "live") {
        if (match.lockAt && now >= match.lockAt) {
          return { match: { ...match, status: "resolving", updatedAt: now }, settle: true };
        }
        const hostGone = missed(match.hostConnectedAt, now, MATCH_FORFEIT_MS);
        const guestGone = missed(match.guestConnectedAt, now, MATCH_FORFEIT_MS);
        if (hostGone && !missed(match.guestConnectedAt, now, MATCH_HEARTBEAT_MISS_MS)) {
          return { match: { ...match, status: "forfeit", forfeitUserId: match.hostUserId, updatedAt: now }, settle: true };
        }
        if (guestGone && !missed(match.hostConnectedAt, now, MATCH_HEARTBEAT_MISS_MS)) {
          return { match: { ...match, status: "forfeit", forfeitUserId: match.guestUserId, updatedAt: now }, settle: true };
        }
      }
      return ok(match);
    }
    default:
      return fail(match, "bad_event");
  }
}

export function doctrineOr(tactic: TacticId | null, fallback: TacticId): TacticId {
  return tactic ?? fallback;
}
