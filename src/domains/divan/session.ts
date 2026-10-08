import { clamp, mulberry32, nid } from "@/domains/ids";
import type { ActionResult, ChronicleEntry, CourtPost, DivanState, GameAction, GameState } from "@/domains/types";
import { agendaByKey, buildAgenda } from "@/domains/divan/agenda";
import { holderOf, sitting } from "@/domains/divan/offices";
import { ensureCourt } from "@/domains/divan/statesmen";

function notice(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): ChronicleEntry {
  return { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
}

function pushLog(s: GameState, entry: ChronicleEntry): GameState {
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

function emptyDivan(year: number): DivanState {
  return { sessionOpen: false, agenda: [], minutes: [], lastConvenedYear: year - 1 };
}

export function withDivan(s: GameState): GameState {
  if (s.divan) return s;
  return { ...s, divan: emptyDivan(s.year) };
}

export function holdDivan(s: GameState): ActionResult {
  s = withDivan(s);
  if (s.lastDivanYear === s.year && s.divan.sessionOpen) {
    return { state: s, notices: [] };
  }
  if (s.lastDivanYear === s.year && s.divan.agenda.length === 0) {
    return { state: s, notices: [] };
  }
  const rng = mulberry32(s.seed + s.year * 17 + 41);
  const agenda = s.divan.sessionOpen && s.divan.agenda.length ? s.divan.agenda : buildAgenda(s, rng, 4);
  const sad = holderOf(s, "sadrazam");
  const bonus = Math.round((sad?.competence ?? 50) / 20);
  const kubbe = sitting(s).length;
  let next: GameState = {
    ...s,
    lastDivanYear: s.year,
    stability: clamp(s.stability + 2 + bonus, 0, 100),
    prestige: clamp(s.prestige + 1, 0, 100),
    ruler: {
      ...s.ruler,
      healthFlags: { ...s.ruler.healthFlags, fatigue: clamp(s.ruler.healthFlags.fatigue + 3, 0, 100) },
      authority: { ...s.ruler.authority, divan: clamp(s.ruler.authority.divan + 2, 0, 100) },
    },
    divan: {
      sessionOpen: true,
      agenda,
      minutes: s.divan.minutes,
      lastConvenedYear: s.year,
    },
    npcs: s.npcs.map((n) =>
      sitting(s).some((x) => x.npc.id === n.id)
        ? { ...n, influence: clamp(n.influence + (n.office === "sadrazam" ? 2 : 0.6), 0, 100), favor: clamp(n.favor + 1, 0, 100) }
        : n,
    ),
  };
  next = pushLog(next, notice(s, "divan", "log.divan.title", "log.divan.opened", { count: agenda.length, court: kubbe }));
  return { state: next, notices: next.chronicle.slice(0, 1) };
}

export function resolveDivanItem(s: GameState, itemId: string, choiceId: string): ActionResult {
  s = withDivan(s);
  const item = s.divan.agenda.find((a) => a.id === itemId);
  const def = item ? agendaByKey(item.key) : undefined;
  const choice = def?.choices.find((c) => c.id === choiceId);
  if (!item || !def || !choice) return { state: s, notices: [] };
  const rng = mulberry32(s.seed + s.year * 31 + item.id.length * 7);
  let next = choice.apply(s, item.payload, rng);

  const majority = majorityStance(item);
  const adopted = choiceId === def.choices[0].id;
  next = {
    ...next,
    npcs: next.npcs.map((n) => {
      const vote = item.votes.find((v) => v.npcId === n.id);
      if (!vote) {
        if (n.id === item.proposedBy) {
          return {
            ...n,
            influence: clamp(n.influence + (adopted ? 5 : -3), 0, 100),
            favor: clamp(n.favor + (adopted ? 4 : -2), 0, 100),
          };
        }
        return n;
      }
      const aligned = (adopted && vote.stance === "support") || (!adopted && vote.stance === "oppose");
      return {
        ...n,
        loyalty: clamp(n.loyalty + (aligned ? 3 : vote.stance === "caution" ? 0 : -4), 0, 100),
        favor: clamp(n.favor + (aligned ? 2 : -3), 0, 100),
        influence: clamp(n.influence + (aligned ? 1 : -1), 0, 100),
      };
    }),
    divan: {
      ...next.divan,
      agenda: next.divan.agenda.filter((a) => a.id !== itemId),
      minutes: [
        { id: nid("min"), year: s.year, itemKey: item.key, topic: item.topic, choiceId, titleKey: item.titleKey },
        ...next.divan.minutes,
      ].slice(0, 60),
      sessionOpen: next.divan.agenda.filter((a) => a.id !== itemId).length > 0,
    },
  };
  if (majority === "oppose" && adopted) {
    next = { ...next, stability: clamp(next.stability - 3, 0, 100), prestige: clamp(next.prestige + 2, 0, 100) };
  }
  if (majority === "support" && adopted) {
    next = { ...next, stability: clamp(next.stability + 2, 0, 100) };
  }
  return { state: next, notices: next.chronicle.slice(0, 1) };
}

function majorityStance(item: GameState["divan"]["agenda"][0]): "support" | "oppose" | "split" {
  const sup = item.votes.filter((v) => v.stance === "support").length;
  const opp = item.votes.filter((v) => v.stance === "oppose").length;
  if (sup > opp + 1) return "support";
  if (opp > sup + 1) return "oppose";
  return "split";
}

export function closeDivan(s: GameState): ActionResult {
  s = withDivan(s);
  if (!s.divan.sessionOpen) return { state: s, notices: [] };
  const leftover = s.divan.agenda;
  const minutes = [
    ...leftover.map((a) => ({
      id: nid("min"),
      year: s.year,
      itemKey: a.key,
      topic: a.topic,
      choiceId: "defer",
      titleKey: a.titleKey,
      deferred: true,
    })),
    ...s.divan.minutes,
  ].slice(0, 60);
  let next: GameState = {
    ...s,
    stability: clamp(s.stability - (leftover.length ? 2 : 0), 0, 100),
    divan: { ...s.divan, sessionOpen: false, agenda: [], minutes },
  };
  next = pushLog(next, notice(s, "divan", "log.divan.close", leftover.length ? "log.divan.deferred" : "log.divan.closed", { count: leftover.length }));
  return { state: next, notices: next.chronicle.slice(0, 1) };
}

export function expireDivan(s: GameState): GameState {
  s = withDivan(s);
  if (!s.divan.sessionOpen && s.divan.agenda.length === 0) return s;
  return closeDivan(s).state;
}

export function appointToPost(s: GameState, action: Extract<GameAction, { type: "APPOINT" }>): ActionResult {
  s = withDivan(ensureCourt(s, mulberry32(s.seed + s.year)));
  const npc = s.npcs.find((n) => n.id === action.npcId && n.alive);
  if (!npc) return { state: s, notices: [] };
  const target: CourtPost | undefined = action.postId
    ? s.court.find((p) => p.id === action.postId)
    : s.court.find((p) => p.office === action.office && p.npcId === null) ?? s.court.find((p) => p.office === action.office);
  if (!target) return { state: s, notices: [] };

  const previous = s.npcs.find((n) => n.id === target.npcId);
  let court = s.court.map((p) => (p.npcId === npc.id ? { ...p, npcId: null } : p));
  court = court.map((p) => (p.id === target.id ? { ...p, npcId: npc.id } : p));

  let npcs = s.npcs.map((n) => {
    if (n.id === npc.id) {
      return {
        ...n,
        office: target.office,
        seat: target.seat,
        regionId: target.regionId,
        tenureStart: s.year,
        favor: clamp(n.favor + 8, 0, 100),
        loyalty: clamp(n.loyalty + 4, 0, 100),
        rivals: previous && previous.id !== n.id && !n.rivals.includes(previous.id) ? [...n.rivals, previous.id] : n.rivals,
      };
    }
    if (previous && n.id === previous.id) {
      return {
        ...n,
        loyalty: clamp(n.loyalty - 16, 0, 100),
        influence: clamp(n.influence - 8, 0, 100),
        favor: clamp(n.favor - 10, 0, 100),
        rivals: n.rivals.includes(npc.id) ? n.rivals : [...n.rivals, npc.id],
      };
    }
    return n;
  });

  let next: GameState = { ...s, court, npcs, prestige: clamp(s.prestige + 1, 0, 100) };
  next = pushLog(next, notice(s, "divan", "log.appoint.title", "log.appoint.body", { office: target.office, name: npc.name }));
  return { state: next, notices: next.chronicle.slice(0, 1) };
}

export function dismissPost(s: GameState, postId: string): ActionResult {
  s = withDivan(s);
  const post = s.court.find((p) => p.id === postId);
  if (!post?.npcId) return { state: s, notices: [] };
  const npc = s.npcs.find((n) => n.id === post.npcId);
  if (!npc) return { state: s, notices: [] };

  const tenure = s.year - npc.tenureStart;
  const shock = npc.office === "sadrazam" ? Math.round(npc.influence / 7) + (tenure > 6 ? 4 : 0) : Math.round(npc.influence / 14);
  const allies = new Set(npc.allies);
  const rivals = new Set(npc.rivals);

  const court = s.court.map((p) => (p.id === postId ? { ...p, npcId: null } : p));
  const npcs = s.npcs.map((n) => {
    if (n.id === npc.id) {
      return {
        ...n,
        loyalty: clamp(n.loyalty - 22, 0, 100),
        influence: clamp(n.influence - 12, 0, 100),
        favor: clamp(n.favor - 18, 0, 100),
        ambition: clamp(n.ambition + 8, 0, 100),
      };
    }
    if (allies.has(n.id)) return { ...n, loyalty: clamp(n.loyalty - 10, 0, 100), favor: clamp(n.favor - 6, 0, 100) };
    if (rivals.has(n.id)) return { ...n, loyalty: clamp(n.loyalty + 4, 0, 100), favor: clamp(n.favor + 5, 0, 100), influence: clamp(n.influence + 3, 0, 100) };
    return n;
  });

  let next: GameState = {
    ...s,
    court,
    npcs,
    stability: clamp(s.stability - shock, 0, 100),
    prestige: clamp(s.prestige - (npc.office === "sadrazam" ? 4 : 1), 0, 100),
    ruler: {
      ...s.ruler,
      authority: {
        ...s.ruler.authority,
        divan: clamp(s.ruler.authority.divan + (npc.influence > 70 ? 4 : 1), 0, 100),
      },
    },
  };
  next = pushLog(next, notice(s, "divan", "log.dismiss.title", "log.dismiss.body", { office: post.office, name: npc.name }));
  return { state: next, notices: next.chronicle.slice(0, 1) };
}

export function emptyDivanState(year: number): DivanState {
  return emptyDivan(year);
}
