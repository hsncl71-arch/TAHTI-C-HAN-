import { hashSeed } from "@/domains/ids";
import { doctrineTactic } from "@/domains/military/combat";
import { TACTICS, type GameAction, type GameState, type TacticId } from "@/domains/types";
import { yearsDue } from "@/domains/worldclock/time";
import { MAX_RAISE } from "./actions.ts";

export function serverDuelSeed(stateSeed: number, year: number, duelId: string): number {
  return hashSeed(`${stateSeed}:${year}:${duelId}`) || 1;
}

export function serverFoeTactic(duelId: string, peerId: string): TacticId {
  const h = hashSeed(`${duelId}:${peerId}:foe`);
  return TACTICS[h % TACTICS.length];
}

export function canAdvanceYear(s: GameState, now: number): boolean {
  if (s.pendingEvents.length) return false;
  return yearsDue(s, now) > 0;
}

/** Rewrite client-supplied combat/economy fields the server must own. */
export function authorizeAction(
  s: GameState,
  action: GameAction,
  ctx: { now: number; peerTactic?: TacticId | null },
): GameAction {
  if (action.type === "START_DUEL") {
    return {
      ...action,
      seed: serverDuelSeed(s.seed, s.year, action.duelId),
      peerId: "ai",
      peerName: action.peerId === "ai" ? action.peerName.slice(0, 40) : "Serdar-ı Talim",
    };
  }
  if (action.type === "RESOLVE_DUEL") {
    const duel = s.military.pendingDuel;
    const peerId = duel?.peerId ?? "ai";
    const foe: TacticId =
      peerId === "ai"
        ? (duel?.foeTactic ?? doctrineTactic(s.military.doctrine, "duel"))
        : (ctx.peerTactic ?? duel?.foeTactic ?? serverFoeTactic(duel?.id ?? "duel", peerId));
    return { type: "RESOLVE_DUEL", tactic: action.tactic, foeTactic: foe };
  }
  if (action.type === "RAISE_TROOPS" || action.type === "DISBAND") {
    return { ...action, count: Math.min(MAX_RAISE, Math.max(1, Math.round(action.count))) };
  }
  return action;
}

export function treasuryDeltaIllegal(before: number, after: number, action: GameAction): boolean {
  if (!Number.isFinite(after) || after > 50_000_000) return true;
  if (
    action.type === "GIFT" ||
    action.type === "RAISE_TROOPS" ||
    action.type === "BUILD" ||
    action.type === "GRAIN_RELIEF" ||
    action.type === "INVEST_PROVINCE" ||
    action.type === "GARRISON" ||
    action.type === "SOOTHE_PROVINCE" ||
    action.type === "INVEST_KIND" ||
    action.type === "SUPPRESS_REVOLT" ||
    action.type === "REFORM" ||
    action.type === "SPY_REALM"
  ) {
    return after > before + 1;
  }
  return false;
}

const ARMY_OK = new Set<GameAction["type"]>([
  "RAISE_TROOPS",
  "DISBAND",
  "ADVANCE_YEAR",
  "RESOLVE_EVENT",
  "RESOLVE_DIVAN",
  "LAUNCH_CAMPAIGN",
  "SIEGE_ACTION",
  "STORM_FORT",
  "RESOLVE_DUEL",
  "RECALL_ARMY",
  "PAY_ULUFE",
  "DRILL_HOST",
]);

export function armySpikeIllegal(before: number, after: number, action: GameAction): boolean {
  if (after < 0 || after > 5_000_000) return true;
  if (!ARMY_OK.has(action.type) && after > before + 40) return true;
  return false;
}

export function hostHeadcount(s: GameState): number {
  const a = s.army;
  return a.janissary + a.sipahi + a.azab + a.akinji + a.topcu + a.navy + a.levend;
}
