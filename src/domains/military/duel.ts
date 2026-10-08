import { clamp, nid } from "@/domains/ids";
import type { GameState, TacticId, TacticalDuel } from "@/domains/types";
import { applyReport, doctrineTactic, resolveBattle } from "@/domains/military/combat";
import { fillMilitary } from "@/domains/military/model";

export function startDuel(
  s: GameState,
  input: { peerId: string; peerName: string; provinceId: string; seed: number; host: boolean; duelId: string },
): GameState {
  if (s.military.pendingDuel) return s;
  const duel: TacticalDuel = {
    id: input.duelId || nid("duel"),
    peerId: input.peerId,
    peerName: input.peerName,
    provinceId: input.provinceId || s.army.provinceId,
    phase: "live",
    selfTactic: null,
    foeTactic: input.peerId === "ai" ? doctrineTactic(s.military.doctrine, "duel") : null,
    seed: input.seed,
    host: input.host,
  };
  return { ...s, military: { ...fillMilitary(s.military), pendingDuel: duel } };
}

export function setLiveTactic(s: GameState, tactic: TacticId): GameState {
  const duel = s.military.pendingDuel;
  if (!duel) return { ...s, military: { ...s.military, liveOrders: tactic } };
  return { ...s, military: { ...s.military, liveOrders: tactic, pendingDuel: { ...duel, selfTactic: tactic } } };
}

export function resolveDuel(s: GameState, tactic: TacticId, foeTactic: TacticId, rng: () => number): GameState {
  const duel = s.military.pendingDuel;
  const provinceId = duel?.provinceId ?? s.army.provinceId;
  const p = s.provinces.find((x) => x.id === provinceId);
  const { report, nextArmy } = resolveBattle(s, {
    kind: "duel",
    provinceId,
    tacticAtk: tactic,
    tacticDef: foeTactic,
    defenderFort: p?.fort ?? 1,
    defenderManpower: Math.round((p?.manpower ?? 2000) * 0.8),
    rng,
    doctrineDef: "hold",
  });
  let next = applyReport(
    {
      ...s,
      army: nextArmy,
      military: { ...s.military, pendingDuel: duel ? { ...duel, phase: "resolved", selfTactic: tactic, foeTactic } : null, liveOrders: tactic },
    },
    report,
    nextArmy,
  );
  next = {
    ...next,
    prestige: clamp(next.prestige + (report.result === "win" ? 6 : report.result === "loss" ? -5 : 0), 0, 100),
    military: { ...next.military, pendingDuel: null },
  };
  const entry = {
    id: nid("ch"),
    year: s.year,
    kind: "ordu",
    titleKey: report.result === "win" ? "log.duel.win.title" : report.result === "loss" ? "log.duel.loss.title" : "log.duel.draw.title",
    bodyKey: report.result === "win" ? "log.duel.win.body" : report.result === "loss" ? "log.duel.loss.body" : "log.duel.draw.body",
    vars: { name: duel?.peerName ?? "", prov: p?.nameKey ?? "" },
  };
  return { ...next, chronicle: [entry, ...next.chronicle].slice(0, 200) };
}

/** Peer dropped or tab closed: resolve with last orders / standing doctrine. Server still rolls the battle. */
export function abandonDuel(s: GameState, rng: () => number): GameState {
  const duel = s.military.pendingDuel;
  if (!duel) return s;
  const self = duel.selfTactic ?? s.military.liveOrders ?? "hold_line";
  const foe = duel.foeTactic ?? doctrineTactic(s.military.doctrine, "duel");
  return resolveDuel(s, self, foe, rng);
}
