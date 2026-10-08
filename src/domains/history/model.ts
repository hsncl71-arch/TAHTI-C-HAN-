import { OSMANLI_SEAT } from "@/domains/map/provinces";
import type { GameState, HistoryState, Treaty } from "@/domains/types";

export function emptyHistory(): HistoryState {
  return {
    playerEvents: [],
    divergences: [],
    lastSyncYear: 0,
    lastOwners: {},
    lastTreaties: {},
    lastRulerName: "",
    lastReignOrdinal: 0,
    lastCampaignTarget: null,
  };
}

export function fillHistory(raw: Partial<HistoryState> | undefined): HistoryState {
  const empty = emptyHistory();
  if (!raw) return empty;
  return {
    playerEvents: Array.isArray(raw.playerEvents) ? raw.playerEvents.filter((e) => e && e.id && e.kind) : [],
    divergences: Array.isArray(raw.divergences) ? raw.divergences.filter((d) => d && d.id && d.canonId) : [],
    lastSyncYear: typeof raw.lastSyncYear === "number" ? raw.lastSyncYear : 0,
    lastOwners: raw.lastOwners && typeof raw.lastOwners === "object" ? { ...raw.lastOwners } : {},
    lastTreaties: raw.lastTreaties && typeof raw.lastTreaties === "object" ? { ...raw.lastTreaties } : {},
    lastRulerName: typeof raw.lastRulerName === "string" ? raw.lastRulerName : "",
    lastReignOrdinal: typeof raw.lastReignOrdinal === "number" ? raw.lastReignOrdinal : 0,
    lastCampaignTarget: typeof raw.lastCampaignTarget === "string" ? raw.lastCampaignTarget : null,
  };
}

export function ensureHistory(s: GameState): GameState {
  return { ...s, history: fillHistory(s.history) };
}

export function playerSeatId(s: GameState): string {
  return s.diplomacy?.seatId || s.realm.aiKey || OSMANLI_SEAT;
}

export function holderSeat(s: GameState, provinceId: string): string | null {
  const p = s.provinces.find((x) => x.id === provinceId);
  if (!p) return null;
  if (p.ownerId === s.realm.id) return playerSeatId(s);
  return p.ownerId;
}

export function ownerMap(s: GameState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of s.provinces) out[p.id] = p.ownerId;
  return out;
}

export function treatyMap(s: GameState): Record<string, Treaty> {
  const out: Record<string, Treaty> = {};
  for (const r of s.relations) out[r.realmId] = r.treaty;
  return out;
}

export function seatLabel(s: GameState, seatId: string): string {
  if (seatId === s.realm.id || seatId === playerSeatId(s)) return s.realm.name;
  return s.foreign.find((f) => f.id === seatId)?.name ?? seatId;
}
