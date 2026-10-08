import { applyAction } from "../world/engine.ts";
import { eventByKey } from "../events/catalog.ts";
import type { GameState } from "../types.ts";

/** Drain blocking overlays so a year can actually turn. Deterministic, no LLM. */
export function drainModals(s: GameState): GameState {
  let next = s;
  let guard = 0;
  while (guard++ < 48) {
    if (next.siege?.cinema) {
      next = applyAction(next, { type: "SKIP_SIEGE_CINEMA" }).state;
      continue;
    }
    if (next.harem?.scene) {
      next = applyAction(next, { type: "SKIP_SCENE" }).state;
      continue;
    }
    if (next.military?.pendingDuel) {
      next = applyAction(next, { type: "RESOLVE_DUEL", tactic: "center", foeTactic: "hold_line" }).state;
      continue;
    }
    if (next.succession) {
      next = applyAction(next, { type: "CONFIRM_SUCCESSION" }).state;
      continue;
    }
    const ev = next.pendingEvents[0];
    if (ev) {
      const def = eventByKey(ev.key);
      const choiceId = def?.choices[0]?.id ?? (ev.key === "tahta_cikis" ? "adalet" : "store");
      const tried = applyAction(next, { type: "RESOLVE_EVENT", eventId: ev.id, choiceId });
      if (tried.state.pendingEvents[0]?.id === ev.id) {
        next = { ...next, pendingEvents: next.pendingEvents.slice(1) };
      } else {
        next = tried.state;
      }
      continue;
    }
    break;
  }
  return next;
}

export function playYear(s: GameState): GameState {
  let next = drainModals(s);
  if (
    next.pendingEvents.length ||
    next.succession ||
    next.harem?.scene ||
    next.siege?.cinema ||
    next.military?.pendingDuel
  ) {
    return drainModals(next);
  }
  next = applyAction(next, { type: "ADVANCE_YEAR" }).state;
  return drainModals(next);
}

export function playYears(s: GameState, n: number): GameState {
  let next = s;
  for (let i = 0; i < n; i += 1) next = playYear(next);
  return next;
}
