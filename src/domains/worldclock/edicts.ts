import { clamp } from "@/domains/ids";
import type { DipOffer, GameState, PauseReason, PendingEvent, StandingEdicts } from "@/domains/types";
import { eventByKey } from "@/domains/events/catalog";
import { skipScene } from "@/domains/dynasty/intimacy";
import { applyGrainRelief } from "@/domains/economy/tick";
import { canBorrow, openLoan } from "@/domains/economy/credit";
import { totalDebt } from "@/domains/economy/budget";
import { payUlufe, setDoctrine } from "@/domains/military/campaign";
import { dismissSiegeCinema } from "@/domains/military/siege";
import { fillWorldClock } from "@/domains/worldclock/model";
import { completeDueWorks, maybeAutoCaravan } from "@/domains/worldclock/works";

const CRITICAL_EVENTS = new Set([
  "tahta_cikis",
  "sehzade_ihtilaf",
  "evlilik_teklifi",
  "harem_rekabet",
  "valide_tercih",
  "sehzade_ocak",
  "reaya_isyan",
  "saray_gerilimi",
]);

/** Deterministic event picks from standing fermâns. `null` means ask the sovereign. */
export function choiceForEvent(s: GameState, ev: PendingEvent): string | null {
  const edicts = fillWorldClock(s.world, s.world?.lastSimAt ?? 0).edicts;
  const def = eventByKey(ev.key);
  if (!def) return null;
  if (ev.key.startsWith("crisis_")) return null;
  if (CRITICAL_EVENTS.has(ev.key)) return null;
  const ids = new Set(def.choices.map((c) => c.id));
  const pick = (id: string, fallback?: string) => (ids.has(id) ? id : fallback && ids.has(fallback) ? fallback : null);

  switch (ev.key) {
    case "yeni_ceri_ulufe":
    case "ocak_maas":
      if (edicts.ulufe === "ask") return null;
      return edicts.ulufe === "refuse" ? pick("refuse", def.choices[1]?.id) : pick("pay", def.choices[0]?.id);
    case "kıtlık":
      if (edicts.famine === "ask") return null;
      return edicts.famine === "endure" ? pick("endure") : pick("relief", def.choices[0]?.id);
    case "hasat":
      return pick("store", def.choices[0]?.id);
    case "vezir_rusvet":
      return pick("dismiss", def.choices[0]?.id);
    case "sinir_akini":
      if (edicts.onAttack === "ask") return null;
      return edicts.onAttack === "sally" ? pick("retaliate", def.choices[0]?.id) : pick("fortify", def.choices[1]?.id) ?? pick("retaliate");
    case "alim_gelir":
      return s.treasury >= 500 ? pick("patron") : pick("dismiss");
    case "cami_dilekce":
      return s.treasury >= 1800 ? pick("build") : pick("later");
    case "veba":
      return pick("quarantine", def.choices[0]?.id);
    case "casus":
      return pick("turn", def.choices[1]?.id) ?? pick("execute");
    case "ipek_yolu":
      return edicts.trade === "refuse" ? pick("tariff") : pick("open", def.choices[0]?.id);
    case "ulema_fetva":
      return pick("heed", def.choices[0]?.id);
    case "dogum":
      return pick("celebrate", def.choices[0]?.id);
    case "deprem":
      return s.treasury >= 1600 ? pick("rebuild") : pick("move");
    case "ticaret_kirilmasi":
      return edicts.trade === "refuse" || s.treasury < 750 ? pick("endure") : pick("escort");
    case "galata_borc":
      if (edicts.debt === "ask") return null;
      return edicts.debt === "no_borrow" ? pick("repay", def.choices[0]?.id) : pick("defer", def.choices[1]?.id);
    default:
      return def.choices.length === 1 ? def.choices[0].id : null;
  }
}

export function incomingOffers(s: GameState): DipOffer[] {
  const seat = s.diplomacy?.seatId;
  if (!seat) return [];
  return (s.diplomacy.pending ?? []).filter((o) => o.status === "pending" && o.toSeat === seat);
}

export function decisionForOffer(s: GameState, offer: DipOffer): "accept" | "refuse" | "ask" {
  const edicts = fillWorldClock(s.world, s.world?.lastSimAt ?? 0).edicts;
  const rel = s.relations.find((r) => r.realmId === offer.fromSeat);
  if (offer.kind === "peace") {
    if (edicts.peace === "ask") return "ask";
    if (edicts.peace === "refuse") return "refuse";
    const losing = s.stability < 40 || s.army.morale < 40 || s.treasury < 800;
    return losing ? "accept" : "ask";
  }
  if (offer.kind === "war") {
    return edicts.warOffer === "ask" ? "ask" : "refuse";
  }
  if (offer.kind === "trade") {
    if (edicts.trade === "ask") return "ask";
    if (edicts.trade === "refuse") return "refuse";
    return (rel?.value ?? 0) >= 10 ? "accept" : "ask";
  }
  if (offer.kind === "alliance" || offer.kind === "coalition") return "ask";
  return "accept";
}

export function haltReason(s: GameState): PauseReason {
  if (s.governance?.speed === "dur") return "speed";
  if (s.succession) return "succession";
  if (s.military?.pendingDuel) return "duel";
  const pending = s.pendingEvents[0];
  if (pending) {
    if (pending.key === "reaya_isyan" || pending.key === "crisis_revolt") return "revolt";
    if (pending.key.startsWith("crisis_palace") || pending.key === "harem_rekabet" || pending.key === "evlilik_teklifi") {
      return "harem";
    }
    if (CRITICAL_EVENTS.has(pending.key) || !choiceForEvent(s, pending)) return "event";
  }
  for (const offer of incomingOffers(s)) {
    const d = decisionForOffer(s, offer);
    if (d === "ask") return offer.kind === "peace" ? "peace" : offer.kind === "war" ? "war_offer" : "event";
  }
  const edicts = fillWorldClock(s.world, s.world?.lastSimAt ?? 0).edicts;
  if (edicts.onAttack === "ask") {
    const last = s.military?.battles?.[0];
    if (last && last.year === s.year && last.result !== "win") return "attack";
  }
  return null;
}

export function skipPresentations(s: GameState): GameState {
  let next = s;
  if (next.harem?.scene) next = skipScene(next);
  if (next.siege?.cinema) next = dismissSiegeCinema(next);
  return next;
}

export function applyRoutineEdicts(s: GameState): GameState {
  const edicts = fillWorldClock(s.world, s.world?.lastSimAt ?? 0).edicts;
  let next = skipPresentations(s);
  next = completeDueWorks(next);

  if (edicts.onAttack === "defend_walls" && next.military?.doctrine !== "hold") {
    next = setDoctrine(next, "hold");
  }
  if (edicts.onAttack === "sally" && next.military?.doctrine !== "sally") {
    next = setDoctrine(next, "sally");
  }

  const people = next.economy?.people;
  if (edicts.famine === "relief" && (people?.foodAccess ?? 64) < 36 && (next.economy?.lastReliefYear ?? 0) < next.year && next.treasury >= 800) {
    next = applyGrainRelief(next, 800);
  }
  if (edicts.tax === "ease_if_unrest" && (people?.taxPressure ?? 0) > 70) {
    next = { ...next, taxRate: clamp(next.taxRate - 0.01, 0.06, 0.24) };
  }
  if (edicts.debt === "borrow_if_empty" && next.treasury < 200 && canBorrow(next, "galata", 1000)) {
    next = openLoan(next, "galata", 1000);
  }
  if (edicts.ulufe === "pay" && next.army.pay < 42 && next.treasury >= 500) {
    const paid = payUlufe(next);
    if (paid.treasury !== next.treasury) next = paid;
  }
  if (edicts.works === "caravan") next = maybeAutoCaravan(next);
  void totalDebt;
  return next;
}

export function mergeEdicts(base: StandingEdicts, patch: Partial<StandingEdicts>): StandingEdicts {
  return { ...base, ...patch };
}
