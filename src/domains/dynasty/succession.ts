import { clamp, mulberry32, nid, pick } from "@/domains/ids";
import type {
  ChronicleEntry,
  GameState,
  Pretender,
  SuccessionState,
  TraitId,
} from "@/domains/types";
import { buildIdentity, personalityFrom } from "@/domains/palace/identity";
import { makeMember } from "@/domains/dynasty/member";
import { rankedHeirs } from "@/domains/dynasty/princes";
import { retireOldHarem } from "@/domains/dynasty/politics";
import { buildPretenders, measureTension } from "@/domains/dynasty/claim";
import { closeReign, openReign, patchReignHeir } from "@/domains/dynasty/reigns";
import { ageOf, isAdult } from "@/domains/dynasty/age";

const MALE = ["Bayezid", "Selim", "Murad", "Cihangir", "Kasım", "Orhan", "Cem", "Alemşah", "Korkut"];

function notice(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): ChronicleEntry {
  return { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
}

function pushLog(s: GameState, entry: ChronicleEntry): GameState {
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 280) };
}

export function livingHeirs(s: GameState) {
  return rankedHeirs(s);
}

export function ensureHeir(s: GameState, rng: () => number): GameState {
  if (livingHeirs(s).length > 0) return s;
  const rulerGen = s.members.find((m) => m.id === s.ruler.memberId)?.generation ?? 1;
  const cousin = makeMember({
    givenName: pick(rng, MALE),
    gender: "m",
    role: "akraba",
    birthYear: s.year - 16 - Math.floor(rng() * 10),
    location: s.realm.capitalId,
    portrait: "sehzade",
    education: "seyfiye",
    military: 22,
    statecraft: 18,
    influence: 20,
    generation: rulerGen,
  });
  return pushLog(
    {
      ...s,
      members: [...s.members, cousin],
      courtTies: [
        ...(s.courtTies ?? []),
        { targetId: cousin.id, kind: "member", affinity: 55, trust: 50, lastMetYear: s.year },
      ],
    },
    notice(s, "hanedan", "log.distant_heir.title", "log.distant_heir.body", { name: cousin.givenName }),
  );
}

export function hydrateSuccession(s: GameState): GameState {
  if (!s.succession) return s;
  const pretenders =
    s.succession.pretenders && s.succession.pretenders.length > 0 ? s.succession.pretenders : buildPretenders(s);
  const chosen =
    pretenders.find((p) => p.memberId === s.succession?.heirMemberId) ?? pretenders[0];
  const next: SuccessionState = {
    deceasedName: s.succession.deceasedName,
    deceasedMemberId: s.succession.deceasedMemberId ?? s.ruler.memberId,
    heirMemberId: chosen?.memberId ?? s.succession.heirMemberId,
    heirName: chosen?.name ?? s.succession.heirName,
    pretenders,
    phase: s.succession.phase ?? "open",
    tension: typeof s.succession.tension === "number" ? s.succession.tension : measureTension(pretenders),
    yearOpened: s.succession.yearOpened ?? s.year,
  };
  return { ...s, succession: next };
}

export function beginInterregnum(s: GameState): GameState {
  if (s.succession) return hydrateSuccession(s);
  const closed = closeReign(s);
  const deceasedName = closed.ruler.givenName;
  const deceasedMemberId = closed.ruler.memberId;
  const age = closed.year - closed.ruler.birthYear;
  const members = closed.members.map((m) =>
    m.id === deceasedMemberId ? { ...m, alive: false, deathYear: m.deathYear ?? closed.year } : m,
  );
  let next: GameState = {
    ...closed,
    members,
    ruler: {
      ...s.ruler,
      health: 0,
      healthFlags: { ...s.ruler.healthFlags, vigor: 0, constitution: "zayif" },
    },
    pendingEvents: [],
  };
  const rng = mulberry32(s.seed + s.year * 17 + s.tick);
  next = ensureHeir(next, rng);
  const pretenders = buildPretenders(next);
  const lead = pretenders[0];
  next = {
    ...next,
    succession: {
      deceasedName,
      deceasedMemberId,
      heirMemberId: lead?.memberId ?? "",
      heirName: lead?.name ?? "",
      pretenders,
      phase: "open",
      tension: measureTension(pretenders),
      yearOpened: s.year,
    },
  };
  return pushLog(
    next,
    notice(s, "saltanat", "log.death.title", "log.death.body", {
      name: deceasedName,
      heir: lead?.name ?? "",
      age,
    }),
  );
}

export function backPretender(s: GameState, memberId: string): GameState {
  if (!s.succession) return s;
  const pretender = s.succession.pretenders.find((p) => p.memberId === memberId);
  if (!pretender) return s;
  return {
    ...s,
    succession: {
      ...s.succession,
      heirMemberId: pretender.memberId,
      heirName: pretender.name,
      phase: "chosen",
    },
  };
}

function traitsFromMember(m: { stats: { adalet: number; cesaret: number; ilim: number; siyaset: number } }): TraitId[] {
  const pairs: [TraitId, number][] = [
    ["adalet", m.stats.adalet],
    ["cesaret", m.stats.cesaret],
    ["ilim", m.stats.ilim],
    ["siyaset", m.stats.siyaset],
  ];
  return pairs.sort((a, b) => b[1] - a[1]).slice(0, 3).map((p) => p[0]);
}

function healthForAge(age: number): number {
  if (age < 16) return 70;
  if (age < 40) return 80;
  if (age < 55) return 68;
  return 54;
}

function settleRivals(s: GameState, winnerId: string, pretenders: Pretender[]): GameState {
  const owned = s.provinces.filter((p) => p.ownerId === s.realm.id && p.id !== s.realm.capitalId);
  const remote = [...owned].sort((a, b) => a.loyalty - b.loyalty);
  let cursor = 0;
  const members = s.members.map((m) => {
    if (m.id === winnerId) return { ...m, role: "sultan" as const, location: s.realm.capitalId };
    const rival = pretenders.find((p) => p.memberId === m.id && p.memberId !== winnerId);
    if (!rival) return m;
    const dest = remote[cursor % Math.max(1, remote.length)];
    cursor += 1;
    return {
      ...m,
      location: dest?.id ?? "eski_saray",
      influence: clamp(Math.round(m.influence * 0.55), 0, 100),
      role: m.role === "sehzade" ? m.role : ("akraba" as const),
    };
  });
  const winner = pretenders.find((p) => p.memberId === winnerId);
  const winnerBackers = new Set(winner?.backers ?? []);
  const npcs = s.npcs.map((n) => {
    if (winnerBackers.has(n.id)) {
      return { ...n, loyalty: clamp(n.loyalty + 10, 10, 100), favor: clamp(n.favor + 12, 0, 100) };
    }
    const backedLoser = pretenders.some((p) => p.memberId !== winnerId && p.backers.includes(n.id));
    if (backedLoser) {
      return { ...n, loyalty: clamp(n.loyalty - 14, 10, 100), favor: clamp(Math.round(n.favor * 0.6), 0, 100) };
    }
    return {
      ...n,
      loyalty: clamp(n.loyalty - 8 + Math.round(n.favor / 20), 10, 100),
      favor: clamp(Math.round(n.favor * 0.7 + 15), 0, 100),
    };
  });
  return { ...s, members, npcs };
}

export function confirmEnthronement(s: GameState): GameState {
  if (!s.succession) return s;
  const staged = hydrateSuccession(s);
  const suc = staged.succession!;
  const heir = staged.members.find((m) => m.id === suc.heirMemberId);
  if (!heir) return { ...staged, succession: null };
  const heirPortrait = heir.portrait || "sehzade";
  const age = ageOf(heir, staged.year);
  const health = healthForAge(age);
  const traits = traitsFromMember(heir);
  const constitution: "yorgun" | "dinc" = age > 55 ? "yorgun" : "dinc";
  const nextRuler: GameState["ruler"] = {
    id: nid("ruler"),
    memberId: heir.id,
    givenName: heir.givenName,
    title: "Sultan",
    dynastyName: staged.ruler.dynastyName,
    gender: heir.gender,
    birthYear: heir.birthYear,
    health,
    traits,
    stats: heir.stats,
    portrait: heirPortrait,
    reignStart: staged.year,
    identity: buildIdentity(heirPortrait, heir.givenName, staged.year),
    clothing: "ceremonial" as const,
    healthFlags: {
      vigor: health,
      fatigue: age < 16 ? 8 : 12,
      constitution,
    },
    reputation: staged.ruler.reputation,
    authority: staged.ruler.authority,
    personality: { ...personalityFrom(traits), temper: heir.temper },
  };
  let next: GameState = settleRivals(staged, heir.id, suc.pretenders);
  next = {
    ...next,
    members: next.members.map((m) =>
      m.id === suc.deceasedMemberId ? { ...m, alive: false, deathYear: m.deathYear ?? staged.year, role: m.role === "sultan" ? m.role : m.role } : m,
    ),
  };
  next = retireOldHarem(next, suc.deceasedMemberId, heir);
  const tensionCost = Math.round(suc.tension / 12);
  const childPenalty = isAdult(heir, staged.year) ? 0 : 10;
  const armyDip = suc.pretenders.length > 1 ? 4 : 0;
  next = {
    ...next,
    ruler: nextRuler,
    succession: null,
    prestige: clamp(staged.prestige - 4, 0, 100),
    stability: clamp(staged.stability - 6 - tensionCost - childPenalty, 0, 100),
    army: { ...staged.army, morale: clamp(staged.army.morale - armyDip, 10, 100) },
    palace: { currentRoom: "taht", occupants: [], seenCinematics: [] },
    divan: { sessionOpen: false, agenda: [], minutes: staged.divan?.minutes ?? [], lastConvenedYear: staged.year - 1 },
    lastDivanYear: staged.year - 1,
  };
  next = patchReignHeir(next, suc.deceasedMemberId, heir.givenName);
  next = openReign(next);
  next = pushLog(
    next,
    notice(staged, "saltanat", "log.succession.title", "log.succession.body", {
      name: heir.givenName,
      dynasty: staged.ruler.dynastyName,
      gen: heir.generation ?? 1,
      ordinal: next.reigns.length,
    }),
  );
  return next;
}

export function leadingPretender(s: GameState): Pretender | undefined {
  if (!s.succession) return undefined;
  return (
    s.succession.pretenders.find((p) => p.memberId === s.succession?.heirMemberId) ?? s.succession.pretenders[0]
  );
}
