import { clamp } from "@/domains/ids";
import type { DynastyMember, GameState } from "@/domains/types";
import { isAdult, isChild } from "@/domains/dynasty/age";
import { claimStrength, claimPower, eligiblePrinces } from "@/domains/dynasty/claim";

export function livingPrinces(s: GameState): DynastyMember[] {
  return eligiblePrinces(s);
}

export function heirScore(s: GameState, m: DynastyMember): number {
  return claimStrength(claimPower(s, m));
}

export function rankedHeirs(s: GameState): DynastyMember[] {
  return [...livingPrinces(s)].sort((a, b) => heirScore(s, b) - heirScore(s, a) || a.birthYear - b.birthYear);
}

export function tickPrince(s: GameState, m: DynastyMember): DynastyMember {
  if (!m.alive) return m;
  if (m.role !== "sehzade" && m.role !== "akraba") return m;
  if (isChild(m, s.year)) return m;
  const atCourt = m.location === s.realm.capitalId;
  let military = m.military;
  let statecraft = m.statecraft;
  let influence = m.influence;
  const stats = { ...m.stats };
  if (m.education === "seyfiye") {
    military += 2;
    stats.cesaret = clamp(stats.cesaret + (military > 40 ? 1 : 0), 1, 20);
  } else if (m.education === "kalemiye") {
    statecraft += 2;
    stats.siyaset = clamp(stats.siyaset + 1, 1, 20);
  } else if (m.education === "ilmiye") {
    stats.ilim = clamp(stats.ilim + 1, 1, 20);
    statecraft += 1;
  }
  if (atCourt) influence += 2;
  else {
    military += 1;
    statecraft += 2;
    influence += 1;
  }
  return {
    ...m,
    stats,
    military: clamp(military, 0, 100),
    statecraft: clamp(statecraft, 0, 100),
    influence: clamp(influence, 0, 100),
  };
}

export function cultivatePrince(s: GameState, memberId: string, npcId: string): GameState {
  const prince = s.members.find((m) => m.id === memberId);
  const npc = s.npcs.find((n) => n.id === npcId);
  if (!prince || !npc || !npc.alive) return s;
  if (!isAdult(prince, s.year)) return s;
  if (prince.role !== "sehzade" && prince.role !== "akraba") return s;
  if (prince.supporters.includes(npcId)) return s;
  return {
    ...s,
    members: s.members.map((m) =>
      m.id === memberId
        ? { ...m, supporters: [...m.supporters, npcId], influence: clamp(m.influence + 6, 0, 100) }
        : m,
    ),
    npcs: s.npcs.map((n) => (n.id === npcId ? { ...n, favor: clamp(n.favor + 5, 0, 100), loyalty: clamp(n.loyalty - 2, 0, 100) } : n)),
  };
}

export function drillPrince(s: GameState, memberId: string): GameState {
  const prince = s.members.find((m) => m.id === memberId);
  if (!prince || !isAdult(prince, s.year)) return s;
  if (prince.role !== "sehzade" && prince.role !== "akraba") return s;
  return {
    ...s,
    members: s.members.map((m) =>
      m.id === memberId
        ? {
            ...m,
            military: clamp(m.military + 4, 0, 100),
            stats: { ...m.stats, cesaret: clamp(m.stats.cesaret + 1, 1, 20) },
          }
        : m,
    ),
  };
}
