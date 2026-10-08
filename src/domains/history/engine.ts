import { START_YEAR, type GameState, type HistoryDivergence, type PlayerHistoryEvent } from "@/domains/types";
import { CANON_FACTS, canonFactById, canonUpcoming } from "@/domains/history/canon";
import {
  ensureHistory,
  fillHistory,
  holderSeat,
  ownerMap,
  playerSeatId,
  treatyMap,
} from "@/domains/history/model";

function eventKey(e: Pick<PlayerHistoryEvent, "kind" | "year" | "provinceId" | "realmId" | "successorName">): string {
  return `${e.kind}:${e.provinceId ?? e.realmId ?? e.successorName ?? "x"}:${e.year}`;
}

function dedupeEvents(events: PlayerHistoryEvent[]): PlayerHistoryEvent[] {
  const seen = new Set<string>();
  const out: PlayerHistoryEvent[] = [];
  for (const e of events) {
    const k = e.id || eventKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...e, id: k });
  }
  return out.sort((a, b) => b.year - a.year || a.id.localeCompare(b.id)).slice(0, 400);
}

function linkCanon(kind: PlayerHistoryEvent["kind"], provinceId?: string, realmId?: string, year?: number): string | null {
  if (kind === "conquest" && provinceId) {
    const hits = CANON_FACTS.filter((f) => f.kind === "conquest" && f.provinceId === provinceId);
    const nearest = hits.sort((a, b) => Math.abs((year ?? 0) - a.year) - Math.abs((year ?? 0) - b.year))[0];
    return nearest?.id ?? null;
  }
  if (kind === "treaty" && realmId) {
    return CANON_FACTS.find((f) => f.kind === "treaty" && f.realmId === realmId)?.id ?? null;
  }
  if (kind === "succession") {
    const hits = CANON_FACTS.filter((f) => f.kind === "succession");
    const nearest = hits.sort((a, b) => Math.abs((year ?? 0) - a.year) - Math.abs((year ?? 0) - b.year))[0];
    return nearest?.id ?? null;
  }
  if ((kind === "campaign" || kind === "campaign_failed") && provinceId) {
    return (
      CANON_FACTS.find((f) => (f.kind === "failed_siege" || f.kind === "conquest" || f.kind === "battle") && f.provinceId === provinceId)
        ?.id ?? null
    );
  }
  return null;
}

function pushEvent(events: PlayerHistoryEvent[], partial: Omit<PlayerHistoryEvent, "id">): void {
  const id = eventKey(partial);
  if (events.some((e) => e.id === id)) return;
  events.push({ ...partial, id, canonId: partial.canonId ?? linkCanon(partial.kind, partial.provinceId, partial.realmId, partial.year) });
}

function collectPlayerEvents(s: GameState, cause: string): PlayerHistoryEvent[] {
  const h = fillHistory(s.history);
  const events = [...h.playerEvents];
  const owners = ownerMap(s);
  const treaties = treatyMap(s);
  const first = Object.keys(h.lastOwners).length === 0;

  if (!events.some((e) => e.kind === "coronation")) {
    pushEvent(events, {
      year: s.ruler.reignStart ?? START_YEAR,
      kind: "coronation",
      titleKey: "log.coronation.title",
      bodyKey: "log.coronation.body",
      vars: { name: s.ruler.givenName, dynasty: s.ruler.dynastyName, city: s.realm.capitalId },
      successorName: s.ruler.givenName,
    });
  }

  if (!first) {
    for (const p of s.provinces) {
      const prev = h.lastOwners[p.id];
      if (!prev || prev === p.ownerId) continue;
      if (p.ownerId === s.realm.id) {
        pushEvent(events, {
          year: s.year,
          kind: "conquest",
          titleKey: "log.conquest.title",
          bodyKey: "log.conquest.body",
          vars: { prov: p.nameKey },
          provinceId: p.id,
        });
      } else if (prev === s.realm.id) {
        pushEvent(events, {
          year: s.year,
          kind: "loss",
          titleKey: "log.lost.title",
          bodyKey: "log.lost.body",
          vars: { prov: p.nameKey },
          provinceId: p.id,
          realmId: p.ownerId,
        });
      }
    }
    for (const r of s.relations) {
      const prev = h.lastTreaties[r.realmId];
      if (!prev || prev === r.treaty) continue;
      pushEvent(events, {
        year: s.year,
        kind: "treaty",
        titleKey: "log.treaty.title",
        bodyKey: "log.treaty.body",
        vars: { realm: r.realmId, treaty: r.treaty },
        realmId: r.realmId,
        treaty: r.treaty,
      });
    }
  }

  const target = s.campaign?.targetProvinceId;
  if ((cause === "LAUNCH_CAMPAIGN" || (target && target !== h.lastCampaignTarget)) && target) {
    const prov = s.provinces.find((p) => p.id === target);
    pushEvent(events, {
      year: s.year,
      kind: "campaign",
      titleKey: "log.march.title",
      bodyKey: "log.march.body",
      vars: { prov: prov?.nameKey ?? target },
      provinceId: target,
    });
  }

  if (!first && h.lastCampaignTarget && !s.campaign) {
    const stillOurs = s.provinces.find((p) => p.id === h.lastCampaignTarget)?.ownerId === s.realm.id;
    if (!stillOurs && (cause === "RECALL_ARMY" || cause === "OFFER_PEACE" || cause === "ADVANCE_YEAR" || cause === "STORM_FORT" || cause === "SIEGE_ACTION")) {
      const prov = s.provinces.find((p) => p.id === h.lastCampaignTarget);
      pushEvent(events, {
        year: s.year,
        kind: "campaign_failed",
        titleKey: "log.retreat.title",
        bodyKey: "log.retreat.body",
        vars: { prov: prov?.nameKey ?? h.lastCampaignTarget },
        provinceId: h.lastCampaignTarget,
      });
    }
  }

  const liveReign = (s.reigns ?? []).find((r) => r.endYear === null);
  const ordinal = liveReign?.ordinal ?? (s.reigns ?? []).length;
  if (ordinal > 0 && h.lastReignOrdinal > 0 && ordinal !== h.lastReignOrdinal) {
    pushEvent(events, {
      year: s.year,
      kind: "succession",
      titleKey: "log.succession.title",
      bodyKey: "log.succession.body",
      vars: {
        name: s.ruler.givenName,
        dynasty: s.ruler.dynastyName,
        ordinal,
        gen: liveReign?.generation ?? 1,
      },
      successorName: s.ruler.givenName,
    });
  }

  return dedupeEvents(events);
}

function firstTakeYear(events: PlayerHistoryEvent[], provinceId: string): number | null {
  const hits = events.filter((e) => e.kind === "conquest" && e.provinceId === provinceId).sort((a, b) => a.year - b.year);
  return hits[0]?.year ?? null;
}

function computeDivergences(s: GameState, events: PlayerHistoryEvent[]): HistoryDivergence[] {
  const seat = playerSeatId(s);
  const out: HistoryDivergence[] = [];

  for (const fact of CANON_FACTS) {
    if (fact.starting) continue;

    if (fact.kind === "conquest" && fact.provinceId && fact.ownerSeatId) {
      const held = holderSeat(s, fact.provinceId);
      const tookYear = firstTakeYear(events, fact.provinceId);
      const playerIsActor = seat === (fact.actorSeatId ?? "osmanli");
      const vars = { year: fact.year, playerYear: tookYear ?? s.year, prov: `prov.${fact.provinceId}`, name: s.ruler.givenName };

      if (held === fact.ownerSeatId) {
        if (tookYear != null && tookYear < fact.year) {
          out.push(div("early", fact, tookYear, events, fact.provinceId, vars));
        } else if (tookYear != null && tookYear > fact.year) {
          out.push(div("late", fact, tookYear, events, fact.provinceId, vars));
        }
      } else if (s.year >= fact.year) {
        out.push(div("missed", fact, s.year, events, fact.provinceId, vars));
      } else if (playerIsActor && held === seat && fact.year > s.year) {
        out.push(div("early", fact, tookYear ?? s.year, events, fact.provinceId, vars));
      }
    }

    if (fact.kind === "failed_siege" && fact.provinceId) {
      const held = holderSeat(s, fact.provinceId);
      const tookYear = firstTakeYear(events, fact.provinceId);
      const camp = events.find((e) => e.provinceId === fact.provinceId && (e.kind === "campaign" || e.kind === "campaign_failed") && e.year <= fact.year);
      const vars = { year: fact.year, playerYear: tookYear ?? s.year, prov: `prov.${fact.provinceId}`, name: s.ruler.givenName };
      if (held === seat && tookYear != null && tookYear <= fact.year) {
        out.push(div("contrary", fact, tookYear, events, fact.provinceId, vars));
      } else if (s.year >= fact.year && !camp && held !== seat) {
        out.push(div("missed", fact, s.year, events, fact.provinceId, vars));
      }
    }

    if (fact.kind === "treaty" && fact.realmId && fact.treaty) {
      const counterpart = fact.realmId === seat ? "osmanli" : fact.realmId;
      const rel = s.relations.find((r) => r.realmId === counterpart);
      const signed = events.find((e) => e.kind === "treaty" && e.realmId === counterpart);
      const vars = { year: fact.year, playerYear: signed?.year ?? s.year, realm: counterpart, treaty: fact.treaty, name: s.ruler.givenName };
      if (s.year < fact.year) continue;
      if (!rel) {
        out.push(div("missed", fact, s.year, events, undefined, vars));
      } else if (rel.treaty !== fact.treaty) {
        out.push(div("contrary", fact, s.year, events, undefined, vars));
      } else if (signed && signed.year !== fact.year) {
        out.push(div(signed.year < fact.year ? "early" : "late", fact, signed.year, events, undefined, vars));
      }
    }

    if (fact.kind === "succession" && fact.successorName) {
      if (s.year < fact.year) continue;
      const reign = (s.reigns ?? []).find((r) => r.startYear === fact.year);
      const covering = (s.reigns ?? []).find((r) => r.startYear <= fact.year && (r.endYear ?? 9999) >= fact.year);
      const name = covering?.givenName ?? s.ruler.givenName;
      const vars = { year: fact.year, playerYear: covering?.startYear ?? s.year, name, canonName: fact.successorName };
      if (!reign || name !== fact.successorName) {
        out.push(div("contrary", fact, covering?.startYear ?? s.year, events, undefined, vars));
      }
    }

    if (fact.kind === "battle" && fact.provinceId) {
      if (s.year < fact.year) continue;
      const camp = events.find((e) => e.provinceId === fact.provinceId && (e.kind === "campaign" || e.kind === "conquest") && Math.abs(e.year - fact.year) <= 5);
      const vars = { year: fact.year, playerYear: camp?.year ?? s.year, prov: `prov.${fact.provinceId}`, name: s.ruler.givenName };
      if (!camp) out.push(div("missed", fact, s.year, events, fact.provinceId, vars));
    }
  }

  return out.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
}

function div(
  kind: HistoryDivergence["kind"],
  fact: { id: string; year: number },
  year: number,
  events: PlayerHistoryEvent[],
  provinceId: string | undefined,
  vars: HistoryDivergence["vars"],
): HistoryDivergence {
  const playerEventId = events.find((e) => e.canonId === fact.id)?.id;
  return {
    id: `${kind}:${fact.id}`,
    year,
    kind,
    canonId: fact.id,
    playerEventId,
    titleKey: `tarih.div.${kind}`,
    bodyKey: `tarih.div.${kind}.body`,
    vars,
    provinceId,
  };
}

/**
 * Compare the live world to sourced canon and record the player's lane.
 * Never mutates provinces, treaties, or succession — comparison only.
 */
export function syncHistory(s: GameState, cause = "sync"): GameState {
  const next = ensureHistory(s);
  const events = collectPlayerEvents(next, cause);
  const divergences = computeDivergences(next, events);
  const liveReign = (next.reigns ?? []).find((r) => r.endYear === null);
  return {
    ...next,
    history: {
      playerEvents: events,
      divergences,
      lastSyncYear: next.year,
      lastOwners: ownerMap(next),
      lastTreaties: treatyMap(next),
      lastRulerName: next.ruler.givenName,
      lastReignOrdinal: liveReign?.ordinal ?? (next.reigns ?? []).length,
      lastCampaignTarget: next.campaign?.targetProvinceId ?? null,
    },
  };
}

export function historyCounselNote(s: GameState): string {
  const due = CANON_FACTS.filter((f) => f.year <= s.year)
    .slice(-8)
    .map((f) => `${f.year}:${f.id}`)
    .join(", ");
  const upcoming = canonUpcoming(s.year, 30)
    .slice(0, 6)
    .map((f) => `${f.year}:${f.id}`)
    .join(", ");
  const player = (s.history?.playerEvents ?? [])
    .slice(0, 8)
    .map((e) => `${e.year}:${e.kind}:${e.provinceId ?? e.realmId ?? e.successorName ?? ""}`)
    .join(", ");
  return [
    "HISTORICAL CANON is sourced reference data only. Do not invent dates, battles, sultans, treaties, or citations beyond this list.",
    `CANON (already elapsed, may or may not have happened in the player's world): ${due || "none"}.`,
    `SOURCED FUTURE (real history, NOT the player's fate, do not treat as having happened): ${upcoming || "none"}.`,
    `PLAYER TIMELINE (alternative history, the live world): ${player || "coronation only"}.`,
    "Never describe a canon event as having occurred in the player's world unless it also appears in the player timeline. The player's future is not required to follow real history.",
  ].join(" ");
}

export function provinceDivergence(s: GameState, provinceId: string): HistoryDivergence | undefined {
  return s.history?.divergences.find((d) => d.provinceId === provinceId);
}

export function canonOwnerOf(s: GameState, provinceId: string): string | null {
  const due = CANON_FACTS.filter((f) => f.year <= s.year && f.provinceId === provinceId && f.ownerSeatId).sort((a, b) => b.year - a.year)[0];
  if (due?.ownerSeatId) return due.ownerSeatId;
  const start = CANON_FACTS.find((f) => f.starting && f.provinceId === provinceId);
  return start?.ownerSeatId ?? holderSeat(s, provinceId);
}

export { canonFactById };
