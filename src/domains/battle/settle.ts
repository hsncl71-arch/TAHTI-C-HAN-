import { clamp, mulberry32, nid } from "@/domains/ids";
import type { Army, BattleReport, BattleResult, GameState, TacticId, TroopKind } from "@/domains/types";
import { TROOP_KINDS } from "@/domains/types";
import { applyReport, resolveBattle } from "@/domains/military/combat";
import { landHost } from "@/domains/military/model";
import { doctrineTactic } from "@/domains/military/combat";
import type { LiveMatch } from "./model.ts";

const SHARE: Record<TroopKind, number> = {
  janissary: 0.22,
  sipahi: 0.18,
  azab: 0.38,
  akinji: 0.14,
  topcu: 0.04,
  navy: 0.04,
  levend: 0.08,
};

function applyLosses(army: Army, rate: number): { army: Army; losses: Partial<Record<TroopKind, number>> } {
  const host = landHost(army);
  const losses: Partial<Record<TroopKind, number>> = {};
  let next: Army = { ...army };
  for (const kind of TROOP_KINDS) {
    const share = SHARE[kind];
    const lost = Math.round(host * rate * share * (kind === "topcu" || kind === "navy" ? 0.15 : 1));
    const take = Math.min(next[kind], Math.max(0, lost));
    if (take > 0) {
      losses[kind] = take;
      next = { ...next, [kind]: next[kind] - take };
    }
  }
  return { army: next, losses };
}

function invertResult(result: BattleResult): BattleResult {
  if (result === "win") return "loss";
  if (result === "loss" || result === "retreat") return "win";
  return "stalemate";
}

function prestigeDelta(result: BattleResult): number {
  if (result === "win") return 6;
  if (result === "loss") return -5;
  if (result === "retreat") return -3;
  return 0;
}

function chronicle(s: GameState, result: BattleResult, foeName: string, provKey: string) {
  const key = result === "win" ? "win" : result === "loss" || result === "retreat" ? "loss" : "draw";
  return {
    id: nid("ch"),
    year: s.year,
    kind: "ordu" as const,
    titleKey: `log.duel.${key}.title`,
    bodyKey: `log.duel.${key}.body`,
    vars: { name: foeName, prov: provKey },
  };
}

function withArmy(s: GameState, army: Army, report: BattleReport, result: BattleResult, foeName: string): GameState {
  const p = s.provinces.find((x) => x.id === report.provinceId);
  const logged = chronicle(s, result, foeName, p?.nameKey ?? "");
  const next = applyReport(
    {
      ...s,
      army,
      prestige: clamp(s.prestige + prestigeDelta(result), 0, 100),
      military: { ...s.military, pendingDuel: null, liveOrders: report.tacticAtk },
    },
    report,
    army,
  );
  return { ...next, chronicle: [logged, ...next.chronicle].slice(0, 200) };
}

export function tacticsForSettle(match: LiveMatch, host: GameState, guest: GameState): { host: TacticId; guest: TacticId } {
  const hostFallback = doctrineTactic(host.military.doctrine, "duel");
  const guestFallback = doctrineTactic(guest.military.doctrine, "duel");
  return {
    host: match.hostTactic ?? host.military.liveOrders ?? hostFallback,
    guest: match.guestTactic ?? guest.military.liveOrders ?? guestFallback,
  };
}

/** One seed, two campaigns. Client never picks the winner. */
export function settleLiveMatch(
  host: GameState,
  guest: GameState,
  input: { hostTactic: TacticId; guestTactic: TacticId; seed: number; provinceId: string },
): { host: GameState; guest: GameState; report: BattleReport } {
  const rng = mulberry32(input.seed || 1);
  const p = host.provinces.find((x) => x.id === input.provinceId) ?? guest.provinces.find((x) => x.id === input.provinceId);
  const guestFort = p?.fort ?? 1;
  const { report, nextArmy } = resolveBattle(host, {
    kind: "duel",
    provinceId: input.provinceId,
    tacticAtk: input.hostTactic,
    tacticDef: input.guestTactic,
    defenderFort: guestFort,
    defenderManpower: landHost(guest.army),
    rng,
    doctrineDef: guest.military.doctrine,
  });

  const hostResult = report.result;
  const guestResult = invertResult(hostResult);
  const guestRate = guestResult === "win" ? 0.06 : guestResult === "stalemate" ? 0.1 : 0.16;
  const guestLost = applyLosses(guest.army, guestRate);
  const morale = guestResult === "win" ? 8 : guestResult === "stalemate" ? -2 : -14;
  const guestArmy: Army = {
    ...guestLost.army,
    morale: clamp(guestLost.army.morale + morale, 10, 100),
    experience: clamp(guestLost.army.experience + (guestResult === "win" ? 6 : 3), 0, 100),
    supply: clamp(guestLost.army.supply - (guestResult === "win" ? 6 : 12), 8, 100),
  };

  const guestReport: BattleReport = {
    ...report,
    id: nid("btl"),
    result: guestResult,
    tacticAtk: input.guestTactic,
    tacticDef: input.hostTactic,
    lossesAtk: guestLost.losses,
    lossesDef: landHost(host.army) - landHost(nextArmy),
  };

  return {
    host: withArmy(host, nextArmy, report, hostResult, guest.ruler.givenName),
    guest: withArmy(guest, guestArmy, guestReport, guestResult, host.ruler.givenName),
    report,
  };
}

export function settleForfeit(
  host: GameState,
  guest: GameState,
  match: LiveMatch,
): { host: GameState; guest: GameState; report: BattleReport } {
  const tactics = tacticsForSettle(match, host, guest);
  if (match.forfeitUserId === match.hostUserId) {
    return settleLiveMatch(host, guest, {
      hostTactic: "withdraw",
      guestTactic: tactics.guest,
      seed: match.seed,
      provinceId: match.provinceId,
    });
  }
  if (match.forfeitUserId === match.guestUserId) {
    return settleLiveMatch(host, guest, {
      hostTactic: tactics.host,
      guestTactic: "withdraw",
      seed: match.seed,
      provinceId: match.provinceId,
    });
  }
  return settleLiveMatch(host, guest, {
    hostTactic: tactics.host,
    guestTactic: tactics.guest,
    seed: match.seed,
    provinceId: match.provinceId,
  });
}

export function winnerUserId(match: LiveMatch, report: BattleReport): string | null {
  if (match.status === "forfeit" && match.forfeitUserId) {
    return match.forfeitUserId === match.hostUserId ? match.guestUserId : match.hostUserId;
  }
  if (report.result === "win") return match.hostUserId;
  if (report.result === "loss" || report.result === "retreat") return match.guestUserId;
  return null;
}
