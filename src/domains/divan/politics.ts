import { clamp, nid } from "@/domains/ids";
import type { ChronicleEntry, GameState, Npc } from "@/domains/types";
import { holderOf, officeDef, sitting } from "@/domains/divan/offices";

function notice(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): ChronicleEntry {
  return { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
}

function pushLog(s: GameState, entry: ChronicleEntry): GameState {
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

export function courtCompetence(s: GameState, office: Parameters<typeof holderOf>[1], fallback = 50): number {
  return holderOf(s, office)?.competence ?? fallback;
}

export function incomeModifier(s: GameState): number {
  const defter = courtCompetence(s, "defterdar", 48);
  const vacant = !holderOf(s, "defterdar");
  return (0.96 + defter / 2200) * (vacant ? 0.92 : 1);
}

export function moraleModifier(s: GameState): number {
  const aga = holderOf(s, "yeniceri_agasi");
  if (!aga) return -3;
  return Math.round((aga.loyalty - 50) / 20);
}

export function navyModifier(s: GameState): number {
  const kap = holderOf(s, "kaptan");
  return kap ? Math.round(kap.competence / 40) : 0;
}

export function tickPolitics(s: GameState, rng: () => number): GameState {
  const seated = sitting(s);
  const seatedIds = new Set(seated.map((x) => x.npc.id));
  const sad = holderOf(s, "sadrazam");
  const siyaset = s.ruler.stats.siyaset;

  let npcs: Npc[] = s.npcs.map((n) => {
    if (!n.alive) return n;
    const post = seated.find((x) => x.npc.id === n.id);
    const tenure = Math.max(0, s.year - n.tenureStart);
    const def = officeDef(n.office);
    let influence = n.influence;
    let wealth = n.wealth;
    let loyalty = n.loyalty;
    let favor = n.favor;
    let ambition = n.ambition;

    if (post) {
      const rate = def?.influenceRate ?? 1;
      const sadBonus = n.office === "sadrazam" ? 1.6 - siyaset * 0.04 : 0;
      influence = clamp(influence + rate + n.competence / 45 + Math.min(3, tenure / 4) + sadBonus, 0, 100);
      wealth = Math.round(wealth + (def?.stipend ?? 60) * 4 + n.influence * 2);
      if (n.ambition > 65 && n.competence < 55) {
        wealth += 120;
        loyalty = clamp(loyalty - 2, 0, 100);
      }
      favor = clamp(favor + (loyalty > 70 ? 1 : -1), 0, 100);
    } else {
      influence = clamp(influence - 1.2, 0, 100);
      ambition = clamp(ambition + 1, 0, 100);
    }

    for (const rivalId of n.rivals) {
      const rival = s.npcs.find((x) => x.id === rivalId);
      if (!rival?.alive) continue;
      if (n.competence > rival.competence && rng() > 0.55) {
        influence = clamp(influence + 1.5, 0, 100);
      } else if (rng() > 0.7) {
        loyalty = clamp(loyalty - 1, 0, 100);
      }
    }

    loyalty = clamp(loyalty + Math.floor((rng() - 0.48) * 5) + (favor - 50) / 40, 10, 100);
    return { ...n, influence, wealth, loyalty, favor, ambition };
  });

  let next: GameState = { ...s, npcs };
  let stability = s.stability;
  let treasury = s.treasury;
  let authority = s.ruler.authority;

  if (!sad) {
    stability = clamp(stability - 5, 0, 100);
  } else if (sad.influence > 78) {
    authority = { ...authority, divan: clamp(authority.divan - 2, 0, 100) };
    stability = clamp(stability + 1, 0, 100);
    treasury = Math.round(treasury - 70);
    const sadNpc = npcs.find((n) => n.id === sad.id);
    if (sadNpc) {
      npcs = npcs.map((n) => (n.id === sad.id ? { ...n, wealth: n.wealth + 180 } : n));
      next = { ...next, npcs };
    }
    if (s.year % 5 === 0 && sad.influence > 82) {
      next = pushLog(next, notice(s, "divan", "log.shadow.title", "log.shadow.body", { name: sad.name }));
    }
  } else if (sad.competence > 80 && sad.loyalty > 70) {
    stability = clamp(stability + 1, 0, 100);
    authority = { ...authority, divan: clamp(authority.divan + 1, 0, 100) };
  }

  if (!holderOf(s, "yeniceri_agasi")) {
    next = {
      ...next,
      army: { ...next.army, morale: clamp(next.army.morale - 3, 10, 100) },
    };
  } else {
    next = {
      ...next,
      army: { ...next.army, morale: clamp(next.army.morale + moraleModifier(s), 10, 100) },
    };
  }

  const siphon = npcs.filter((n) => seatedIds.has(n.id) && n.ambition > 72 && n.loyalty < 50 && rng() > 0.7);
  if (siphon.length) {
    const take = siphon.length * 180;
    treasury -= take;
    npcs = npcs.map((n) => (siphon.some((x) => x.id === n.id) ? { ...n, wealth: n.wealth + 180, favor: clamp(n.favor - 4, 0, 100) } : n));
    next = pushLog({ ...next, npcs }, notice(s, "divan", "log.siphon.title", "log.siphon.body", { name: siphon[0].name }));
  }

  const clash = seated.filter(({ npc }) => npc.rivals.some((id) => seatedIds.has(id)));
  if (clash.length >= 2 && rng() > 0.62) {
    const a = clash[0].npc;
    const b = npcs.find((n) => n.id === a.rivals.find((id) => seatedIds.has(id)));
    if (b) {
      npcs = npcs.map((n) => {
        if (n.id === a.id) return { ...n, influence: clamp(n.influence + (a.competence >= b.competence ? 3 : -2), 0, 100) };
        if (n.id === b.id) return { ...n, influence: clamp(n.influence + (b.competence > a.competence ? 3 : -2), 0, 100) };
        return n;
      });
      next = pushLog({ ...next, npcs }, notice(s, "divan", "log.rivalry.title", "log.rivalry.body", { a: a.name, b: b.name }));
    }
  }

  return {
    ...next,
    npcs,
    treasury: Math.round(treasury),
    stability: clamp(stability, 0, 100),
    ruler: { ...next.ruler, authority },
  };
}
