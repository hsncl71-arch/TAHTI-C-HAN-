import type { BattleReport, BattleResult, TacticId } from "@/domains/types";

export const MATCH_LOCK_MS = 8_000;
export const MATCH_HEARTBEAT_MISS_MS = 20_000;
export const MATCH_FORFEIT_MS = 45_000;
export const MATCH_CHALLENGE_TTL_MS = 120_000;

export type MatchStatus =
  | "open"
  | "lobby"
  | "live"
  | "resolving"
  | "done"
  | "forfeit"
  | "abandoned";

export interface LiveMatch {
  id: string;
  hostUserId: string;
  guestUserId: string;
  hostSeat: string;
  guestSeat: string;
  hostName: string;
  guestName: string;
  provinceId: string;
  status: MatchStatus;
  hostReady: boolean;
  guestReady: boolean;
  hostTactic: TacticId | null;
  guestTactic: TacticId | null;
  hostConnectedAt: number;
  guestConnectedAt: number;
  seed: number;
  lockAt: number | null;
  winnerUserId: string | null;
  result: BattleResult | null;
  report: BattleReport | null;
  forfeitUserId: string | null;
  settleKey: string | null;
  createdAt: number;
  updatedAt: number;
}

export type MatchEvent =
  | { type: "accept"; userId: string; now: number }
  | { type: "decline"; userId: string; now: number }
  | { type: "ready"; userId: string; now: number }
  | { type: "tactic"; userId: string; tactic: TacticId; nonce: string; now: number }
  | { type: "heartbeat"; userId: string; now: number }
  | { type: "forfeit"; userId: string; now: number }
  | { type: "tick"; now: number };

export type MatchStep = {
  match: LiveMatch;
  settle: boolean;
  error?: string;
};

export function sideOf(match: LiveMatch, userId: string): "host" | "guest" | null {
  if (userId === match.hostUserId) return "host";
  if (userId === match.guestUserId) return "guest";
  return null;
}

export function opponentOf(match: LiveMatch, userId: string): string | null {
  if (userId === match.hostUserId) return match.guestUserId;
  if (userId === match.guestUserId) return match.hostUserId;
  return null;
}

export function isTerminal(status: MatchStatus): boolean {
  return status === "done" || status === "forfeit" || status === "abandoned";
}

export function isActive(status: MatchStatus): boolean {
  return status === "open" || status === "lobby" || status === "live" || status === "resolving";
}
