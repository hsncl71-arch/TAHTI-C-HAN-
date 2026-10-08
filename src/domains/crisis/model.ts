import { clamp, nid } from "@/domains/ids";
import { CRISIS_KINDS, type ChronicleEntry, type CrisisKind, type CrisisSeed, type CrisisState, type GameState } from "@/domains/types";

/** Payoffs that close a file instead of returning as a later crisis. */
export const HARVEST_KEYS = new Set(["crisis_spy:fund", "crisis_agent:turn"]);

export function seedSequel(fromKey: string, explicit?: boolean): boolean {
  if (typeof explicit === "boolean") return explicit;
  return !HARVEST_KEYS.has(fromKey);
}

export function emptyHeat(): Record<CrisisKind, number> {
  return {
    revolt: 0,
    janissary: 0,
    palace: 0,
    rivalry: 0,
    spy: 0,
    agent: 0,
    economy: 0,
    claim: 0,
    diplomatic: 0,
    commander: 0,
  };
}

export function emptyCrisis(): CrisisState {
  return { heat: emptyHeat(), seeds: [], lastFired: {}, log: [] };
}

export function fillCrisis(raw: Partial<CrisisState> | undefined): CrisisState {
  const empty = emptyCrisis();
  if (!raw) return empty;
  const heat = emptyHeat();
  for (const k of CRISIS_KINDS) {
    const v = raw.heat?.[k];
    heat[k] = typeof v === "number" ? clamp(Math.round(v), 0, 100) : 0;
  }
  const lastFired: CrisisState["lastFired"] = {};
  for (const k of CRISIS_KINDS) {
    const y = raw.lastFired?.[k];
    if (typeof y === "number") lastFired[k] = y;
  }
  return {
    heat,
    seeds: Array.isArray(raw.seeds)
      ? raw.seeds
          .filter((s) => s && s.id && s.kind && typeof s.ripeYear === "number")
          .slice(0, 40)
          .map((s) => ({
            ...s,
            payload: s.payload ?? {},
            sequel: seedSequel(s.fromKey, s.sequel),
          }))
      : [],
    lastFired,
    log: Array.isArray(raw.log) ? raw.log.filter((r) => r && r.id && r.kind).slice(0, 80) : [],
  };
}

export function logCrisis(
  s: GameState,
  kind: string,
  titleKey: string,
  bodyKey: string,
  vars: ChronicleEntry["vars"] = {},
): GameState {
  const entry: ChronicleEntry = { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

export function plantSeed(s: GameState, seed: Omit<CrisisSeed, "id" | "sequel"> & { sequel?: boolean }): GameState {
  const crisis = fillCrisis(s.crisis);
  const id = `crseed_${seed.fromKey}_${seed.plantedYear}_${seed.kind}`;
  if (crisis.seeds.some((x) => x.id === id)) return { ...s, crisis };
  const row: CrisisSeed = { ...seed, id, sequel: seedSequel(seed.fromKey, seed.sequel) };
  return { ...s, crisis: { ...crisis, seeds: [...crisis.seeds, row].slice(0, 40) } };
}

export function recordCrisis(s: GameState, kind: CrisisKind, key: string, choiceId: string): GameState {
  const crisis = fillCrisis(s.crisis);
  const rec = { id: `crlog_${key}_${s.year}_${choiceId}`, year: s.year, kind, key, choiceId };
  return {
    ...s,
    crisis: {
      ...crisis,
      log: [rec, ...crisis.log.filter((r) => r.id !== rec.id)].slice(0, 80),
      lastFired: { ...crisis.lastFired, [kind]: s.year },
    },
  };
}

export function decisionHits(s: GameState, kinds: string[], choiceIds?: string[]): number {
  return (s.decisions ?? []).filter((d) => kinds.includes(d.kind) && (!choiceIds || choiceIds.includes(d.choiceId ?? ""))).length;
}

export function crisisHits(s: GameState, kind: CrisisKind, choiceIds?: string[]): number {
  return (s.crisis?.log ?? []).filter((r) => r.kind === kind && (!choiceIds || choiceIds.includes(r.choiceId))).length;
}

export function seedPressure(s: GameState, kind: CrisisKind): number {
  return (s.crisis?.seeds ?? []).filter((x) => x.kind === kind).length * 7;
}

export function spendCrisis(s: GameState, amount: number, noteKey: string): GameState {
  if (amount <= 0) return s;
  return {
    ...s,
    treasury: Math.round(s.treasury - amount),
    ledger: [{ id: nid("led"), year: s.year, kind: "gider", amount: -amount, noteKey }, ...s.ledger].slice(0, 80),
  };
}