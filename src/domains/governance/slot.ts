import type { GameState } from "@/domains/types";
import { ensureGovernance } from "@/domains/governance/model";

/** Reject a checkpoint that is not the same realm or that breaks the map. */
export function slotAcceptable(current: GameState, incoming: GameState): boolean {
  if (!incoming?.realm || incoming.realm.id !== current.realm.id) return false;
  if (!Array.isArray(incoming.provinces) || incoming.provinces.length !== current.provinces.length) return false;
  const expected = new Set(current.provinces.map((p) => p.id));
  const ids = new Set(incoming.provinces.map((p) => p.id));
  if (ids.size !== expected.size) return false;
  for (const id of expected) if (!ids.has(id)) return false;
  const owners = new Set([current.realm.id, ...current.foreign.map((f) => f.id)]);
  for (const p of incoming.provinces) {
    if (!owners.has(p.ownerId)) return false;
    if (!Number.isFinite(p.manpower) || p.manpower < 0 || p.manpower > 80_000) return false;
  }
  if (!Number.isFinite(incoming.treasury) || incoming.treasury < -40_000 || incoming.treasury > 90_000) return false;
  if (!Number.isFinite(incoming.year) || incoming.year < 1299 || incoming.year > 1800) return false;
  const army = incoming.army;
  if (!army) return false;
  for (const n of [army.janissary, army.sipahi, army.azab, army.akinji, army.topcu, army.navy, army.levend]) {
    if (!Number.isFinite(n) || n < 0 || n > 400_000) return false;
  }
  ensureGovernance(incoming);
  return true;
}
