import { clamp, nid } from "@/domains/ids";
import type { ChronicleEntry, DipKind, DipOffer, DipTerms, GameState, Treaty } from "@/domains/types";
import { dropOffer, fillRelation, isPlayerHeld, pushPending } from "@/domains/diplomacy/model";

function notice(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): ChronicleEntry {
  return { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
}

function pushLog(s: GameState, entry: ChronicleEntry): GameState {
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

export function setRelation(
  s: GameState,
  realmId: string,
  patch: { treaty?: Treaty; tradePact?: boolean; coalitionAgainst?: string | null; valueDelta?: number; value?: number },
): GameState {
  const has = s.relations.some((r) => r.realmId === realmId);
  const relations = has
    ? s.relations.map((r) => {
        if (r.realmId !== realmId) return r;
        const next = fillRelation(r, r.realmId);
        if (patch.treaty) next.treaty = patch.treaty;
        if (typeof patch.tradePact === "boolean") next.tradePact = patch.tradePact;
        if (patch.coalitionAgainst !== undefined) next.coalitionAgainst = patch.coalitionAgainst;
        if (typeof patch.value === "number") next.value = clamp(patch.value, -100, 100);
        if (typeof patch.valueDelta === "number") next.value = clamp(next.value + patch.valueDelta, -100, 100);
        return next;
      })
    : [
        ...s.relations,
        fillRelation(
          {
            realmId,
            value: patch.value ?? 0,
            treaty: patch.treaty ?? "peace",
            tradePact: patch.tradePact ?? false,
            coalitionAgainst: patch.coalitionAgainst ?? null,
          },
          realmId,
        ),
      ];
  return { ...s, relations };
}

export function applyOfferResult(s: GameState, kind: DipKind, fromSeat: string, toSeat: string, terms: DipTerms, accepted: boolean): GameState {
  const counterpart = fromSeat === s.diplomacy.seatId ? toSeat : fromSeat;
  if (kind === "envoy") {
    return pushLog(setRelation(s, counterpart, { valueDelta: accepted ? 5 : 0 }), notice(s, "diplomasi", "log.envoy.title", "log.envoy.body", { realm: counterpart }));
  }
  if (!accepted) {
    return pushLog(setRelation(s, counterpart, { valueDelta: -4 }), notice(s, "diplomasi", "log.offer_refused.title", "log.offer_refused.body", { realm: counterpart, kind }));
  }
  let next = s;
  if (kind === "peace") next = setRelation(next, counterpart, { treaty: "peace", coalitionAgainst: null, valueDelta: 12 + Math.round(terms.tribute / 400) });
  if (kind === "alliance") next = setRelation(next, counterpart, { treaty: "alliance", valueDelta: 16 });
  if (kind === "trade") next = setRelation(next, counterpart, { tradePact: true, valueDelta: 8 });
  if (kind === "war") next = setRelation(next, counterpart, { treaty: "war", tradePact: false, coalitionAgainst: null, valueDelta: -22 });
  if (kind === "coalition" && terms.againstRealmId) {
    next = setRelation(next, counterpart, { treaty: "alliance", coalitionAgainst: terms.againstRealmId, valueDelta: 10 });
    next = setRelation(next, terms.againstRealmId, { treaty: "war", valueDelta: -18 });
  }
  if (kind === "peace" && terms.tribute > 0 && fromSeat === s.diplomacy.seatId) {
    next = { ...next, treasury: Math.round(next.treasury - terms.tribute) };
  }
  if (kind === "peace" && terms.tribute > 0 && toSeat === s.diplomacy.seatId) {
    next = { ...next, treasury: Math.round(next.treasury + terms.tribute) };
  }
  const title = kind === "war" ? "log.treaty.title" : "log.offer_accepted.title";
  return pushLog(next, notice(s, "diplomasi", title, kind === "war" ? "log.treaty.body" : "log.offer_accepted.body", { realm: counterpart, treaty: kind, kind }));
}

export function localTreatyAllowed(s: GameState, realmId: string, treaty: Treaty): boolean {
  if (treaty === "war") return true;
  return !isPlayerHeld(s, realmId);
}

export function queueOutgoingOffer(s: GameState, offer: DipOffer): GameState {
  const logged = pushLog(s, notice(s, "diplomasi", "log.offer_sent.title", "log.offer_sent.body", { realm: offer.toSeat, kind: offer.kind }));
  return pushPending(logged, offer);
}

export function resolveQueuedOffer(s: GameState, offerId: string, accepted: boolean): GameState {
  const offer = s.diplomacy.pending.find((o) => o.id === offerId);
  if (!offer) return s;
  const dropped = dropOffer(s, offerId);
  return applyOfferResult(dropped, offer.kind, offer.fromSeat, offer.toSeat, offer.terms, accepted);
}
