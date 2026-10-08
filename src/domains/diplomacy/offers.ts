import type { DipKind, DipTerms, GameState } from "@/domains/types";
import { clampTerms } from "@/domains/diplomacy/world";
import { isPlayerHeld } from "@/domains/diplomacy/model";

export const CRITICAL_KINDS: DipKind[] = ["peace", "alliance", "trade", "war", "coalition"];

export function isUnilateral(kind: DipKind): boolean {
  return kind === "war" || kind === "envoy";
}

export function needsCounterpartyConsent(kind: DipKind): boolean {
  return kind === "peace" || kind === "alliance" || kind === "trade" || kind === "coalition";
}

/** AI must not exercise a player-held throne's critical acts. */
export function aiMayActForSeat(s: GameState, actingSeatId: string, kind: DipKind): boolean {
  if (actingSeatId === s.diplomacy.seatId) return false;
  if (isPlayerHeld(s, actingSeatId) && CRITICAL_KINDS.includes(kind)) return false;
  return true;
}

export function validateOffer(
  s: GameState,
  toSeat: string,
  kind: DipKind,
  terms: DipTerms,
): { ok: true; terms: DipTerms } | { ok: false; reason: "self" | "unknown" | "terms" | "warlock" } {
  const from = s.diplomacy.seatId;
  if (!from || from === toSeat) return { ok: false, reason: "self" };
  const known = toSeat === from || s.foreign.some((f) => f.id === toSeat) || s.diplomacy.seats.some((x) => x.realmId === toSeat);
  if (!known) return { ok: false, reason: "unknown" };
  const clean = clampTerms(terms);
  if (kind === "coalition") {
    if (!clean.againstRealmId || clean.againstRealmId === from || clean.againstRealmId === toSeat) {
      return { ok: false, reason: "terms" };
    }
  }
  if (kind === "peace") {
    const rel = s.relations.find((r) => r.realmId === toSeat);
    if (rel && rel.treaty !== "war" && rel.treaty !== "truce") {
      /* peace from peace is still a formal ahid */
    }
  }
  if (kind === "alliance" || kind === "trade") {
    const rel = s.relations.find((r) => r.realmId === toSeat);
    if (rel?.treaty === "war") return { ok: false, reason: "warlock" };
  }
  return { ok: true, terms: clean };
}

export const OFFER_TTL_YEARS = 3;
