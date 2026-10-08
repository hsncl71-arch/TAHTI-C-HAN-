import type { ChronicleEntry, GameState, PauseReason } from "@/domains/types";
import { MAX_CATCHUP_YEARS } from "@/domains/types";
import { applyAction } from "@/domains/world/engine";
import { ensureWorldClock, fillWorldClock, pushNotice, setPaused, bumpSim } from "@/domains/worldclock/model";
import { choiceForEvent, decisionForOffer, haltReason, incomingOffers, applyRoutineEdicts } from "@/domains/worldclock/edicts";
import { catchupYears } from "@/domains/worldclock/time";

export interface CatchUpResult {
  state: GameState;
  years: number;
  halted: boolean;
  reason: PauseReason;
  notices: ChronicleEntry[];
}

function applyStanding(s: GameState): GameState {
  let next = applyRoutineEdicts(s);
  let guard = 0;
  while (next.pendingEvents[0] && guard < 8) {
    const ev = next.pendingEvents[0];
    const choice = choiceForEvent(next, ev);
    if (!choice) break;
    next = applyAction(next, { type: "RESOLVE_EVENT", eventId: ev.id, choiceId: choice }).state;
    guard += 1;
  }
  for (const offer of incomingOffers(next)) {
    const d = decisionForOffer(next, offer);
    if (d === "ask") break;
    next = applyAction(next, { type: "DIP_RESPOND", offerId: offer.id, accept: d === "accept" }).state;
  }
  return next;
}

function withHaltNotice(s: GameState, reason: PauseReason): GameState {
  if (!reason) return setPaused(s, null);
  const paused = setPaused(s, reason);
  const key = `nizam.pause.${reason}`;
  return pushNotice(paused, {
    kind: "pause",
    severity: "critical",
    titleKey: "nizam.pause.title",
    bodyKey: `${key}.body`,
    vars: { reason },
  });
}

/**
 * Advance a realm by wall-clock years using standing fermâns — never an LLM.
 * Critical matters halt the clock for this realm only; the shared world keeps moving.
 */
export function catchUpTo(state: GameState, now: number, msPerYear?: number, cap = MAX_CATCHUP_YEARS): CatchUpResult {
  let next = ensureWorldClock(state, state.world?.lastSimAt ?? now);
  const world = fillWorldClock(next.world, now);
  const notices: ChronicleEntry[] = [];
  const due = catchupYears({ ...next, world }, now, msPerYear, cap);

  next = applyStanding(next);
  const early = haltReason(next);
  if (early) {
    if (next.world.paused && next.world.pauseReason === early) {
      return { state: next, years: 0, halted: true, reason: early, notices };
    }
    return { state: withHaltNotice(next, early), years: 0, halted: true, reason: early, notices };
  }
  if (due <= 0) {
    return { state: setPaused(next, null), years: 0, halted: false, reason: null, notices };
  }

  let advanced = 0;
  for (let i = 0; i < due; i += 1) {
    next = applyStanding(next);
    const before = haltReason(next);
    if (before) {
      return { state: withHaltNotice(next, before), years: advanced, halted: true, reason: before, notices };
    }
    if (next.pendingEvents.length) {
      return { state: withHaltNotice(next, "event"), years: advanced, halted: true, reason: "event", notices };
    }
    const res = applyAction(next, { type: "ADVANCE_YEAR" });
    next = bumpSim(res.state, 1);
    notices.push(...res.notices);
    advanced += 1;
    next = applyStanding(next);
    const after = haltReason(next);
    if (after) {
      return { state: withHaltNotice(next, after), years: advanced, halted: true, reason: after, notices };
    }
  }
  const digest = pushNotice(setPaused(next, null), {
    kind: "catchup",
    severity: advanced >= 3 ? "critical" : "info",
    titleKey: "nizam.catchup.title",
    bodyKey: "nizam.catchup.body",
    vars: { n: advanced, year: next.year },
  });
  return { state: digest, years: advanced, halted: false, reason: null, notices };
}
