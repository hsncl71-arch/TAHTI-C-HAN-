import { clamp, nid } from "@/domains/ids";
import type { ChronicleEntry, GameState } from "@/domains/types";
import { START_YEAR } from "@/domains/types";
import { ensureGovernance, populationOf, realmPopulation } from "@/domains/governance/model";

function notice(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): ChronicleEntry {
  return { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
}

function pushLog(s: GameState, entry: ChronicleEntry): GameState {
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

function grant(s: GameState, id: string): GameState {
  if (s.governance.achievements.includes(id)) return s;
  const next: GameState = {
    ...s,
    governance: { ...s.governance, achievements: [...s.governance.achievements, id].slice(0, 24) },
  };
  return pushLog(next, notice(s, "vekayiname", "log.achievement.title", "log.achievement.body", { id }));
}

export function tickGovernanceYear(s: GameState): GameState {
  let next = ensureGovernance(s);
  const atWar = next.relations.some((r) => r.treaty === "war");
  const population = { ...next.governance.population };
  for (const p of next.provinces) {
    const cur = population[p.id] ?? populationOf(p);
    let drift = 0.003;
    if (p.ownerId === next.realm.id) {
      if (next.taxRate >= 0.2) drift -= 0.008;
      else if (next.taxRate > 0.16) drift -= 0.004;
      else if (next.taxRate < 0.1) drift += 0.003;
      if (p.prosperity < 34) drift -= 0.01;
      if (p.prosperity > 72) drift += 0.004;
      if (p.unrest > 68) drift -= 0.008;
      if (p.grain < 28) drift -= 0.01;
      if (atWar) drift -= 0.002;
      const works = next.governance.works[p.id];
      if (works?.tarim) drift += 0.002;
      if (works?.pazar) drift += 0.001;
    }
    population[p.id] = clamp(Math.round(cur * (1 + drift)), 800, 2_000_000);
  }
  next = { ...next, governance: { ...next.governance, population } };

  for (const p of next.provinces) {
    if (p.ownerId !== next.realm.id) continue;
    if (p.unrest < 62 || p.loyalty >= 48) continue;
    const seen = next.chronicle.some((c) => c.year === next.year && c.titleKey === "log.revolt_warn.title" && c.vars.prov === p.nameKey);
    if (seen) continue;
    const why = p.grain < 30 ? "iaşe" : next.taxRate > 0.16 ? "vergi" : "sadakat";
    next = pushLog(next, notice(next, "isyan", "log.revolt_warn.title", "log.revolt_warn.body", { prov: p.nameKey, why }));
  }

  let treasury = next.treasury;
  let ledger = next.ledger;
  for (const [realmId, pact] of Object.entries(next.governance.tributes)) {
    if (!pact || next.year > pact.until) continue;
    const rel = next.relations.find((r) => r.realmId === realmId);
    if (!rel || rel.treaty === "war") continue;
    const amount = Math.round(clamp(pact.amount, 0, 800));
    if (amount <= 0) continue;
    treasury += amount;
    ledger = [{ id: nid("led"), year: next.year, kind: "gelir", amount, noteKey: "ledger.tribute" }, ...ledger].slice(0, 80);
  }
  if (treasury !== next.treasury) next = { ...next, treasury, ledger };

  const lands = next.provinces.filter((p) => p.ownerId === next.realm.id).length;
  const wins = next.military.battles.filter((b) => b.result === "win").length;
  const reign = next.year - (next.ruler.reignStart ?? START_YEAR);
  if (next.governance.conquests >= 1) next = grant(next, "fetih");
  if (next.governance.peaces >= 1) next = grant(next, "sulh");
  if (wins >= 1) next = grant(next, "zafer");
  if (lands >= 10) next = grant(next, "on_eyalet");
  if (lands >= 20) next = grant(next, "yirmi_eyalet");
  if (reign >= 50) next = grant(next, "elli_yil");
  if (next.treasury >= 40_000) next = grant(next, "hazine");
  if (reign >= 15 && next.economy.revoltRisk < 28) next = grant(next, "asyude");
  if (lands >= 24 && next.prestige >= 70) next = grant(next, "cihan");

  if (next.governance.outcome === "none" && lands >= 22 && next.prestige >= 75) {
    next = {
      ...next,
      governance: { ...next.governance, outcome: "glory" },
    };
    next = pushLog(next, notice(next, "vekayiname", "log.glory.title", "log.glory.body", { n: lands }));
  } else if (next.governance.outcome === "none" && lands <= 2 && next.stability < 22 && next.treasury < 0) {
    next = { ...next, governance: { ...next.governance, outcome: "strain" } };
    next = pushLog(next, notice(next, "vekayiname", "log.strain.title", "log.strain.body", {}));
  }

  void realmPopulation;
  return next;
}
