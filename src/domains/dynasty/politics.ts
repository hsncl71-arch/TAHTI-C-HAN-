import { clamp, nid, pick } from "@/domains/ids";
import type { ChronicleEntry, DynastyMember, GameState, PortraitKey } from "@/domains/types";
import { isAdult, isChild } from "@/domains/dynasty/age";
import { adultConsorts, canRomance } from "@/domains/dynasty/bonds";
import { makeMember } from "@/domains/dynasty/member";
import { livingPrinces, tickPrince } from "@/domains/dynasty/princes";

const MALE = ["Bayezid", "Selim", "Murad", "Cihangir", "Kasım", "Orhan", "Cem", "Alemşah", "Korkut"];
const FEMALE = ["Hatice", "Mihrimah", "Ayşe", "Fatma", "Hüma", "Gülbahar", "Şah", "Gevher"];
const CONSORT = ["Nurbanu", "Safiye", "Mahidevran", "Şemsiruhsar", "Canfeda", "Gülşah", "Hümaşah", "Nazperver"];
const ADULT_FLOOR = 18;

function log(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): GameState {
  const entry: ChronicleEntry = { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

export function tickHaremIntrigue(s: GameState): GameState {
  const consorts = adultConsorts(s);
  let intrigue = s.harem?.intrigue ?? 12;
  if (consorts.length >= 2) intrigue += 3 + (s.harem?.favoriteId ? 2 : 4);
  const mothersWithSons = consorts.filter((h) => s.members.some((m) => m.alive && m.role === "sehzade" && m.motherId === h.id));
  if (mothersWithSons.length >= 2) intrigue += 6;
  const valide = s.members.find((m) => m.alive && m.role === "valide");
  if (valide) intrigue -= Math.round(valide.influence / 40);
  intrigue = clamp(intrigue, 0, 100);
  let stability = s.stability;
  if (intrigue > 70) stability = clamp(stability - 4, 0, 100);
  else if (intrigue < 25) stability = clamp(stability + 1, 0, 100);
  const authority = {
    ...s.ruler.authority,
    harem: clamp(Math.round((valide?.influence ?? 50) * 0.4 + (100 - intrigue) * 0.3 + (s.harem?.favoriteId ? 10 : 0)), 0, 100),
  };
  return { ...s, stability, harem: { ...s.harem, intrigue }, ruler: { ...s.ruler, authority } };
}

export function tickMortality(s: GameState, rng: () => number): GameState {
  const heirs = livingPrinces(s);
  let notices: { name: string; role: string }[] = [];
  const members = s.members.map((m) => {
    if (!m.alive || m.id === s.ruler.memberId) return m;
    const age = s.year - m.birthYear;
    if (age < 12) return m;
    if ((m.role === "sehzade" || m.role === "akraba") && m.gender === "m" && heirs.length <= 1) return m;
    const chance = age < 45 ? 0.008 : age < 60 ? 0.035 : age < 75 ? 0.11 : 0.26;
    if (rng() < chance) {
      notices.push({ name: m.givenName, role: m.role });
      return { ...m, alive: false, deathYear: s.year };
    }
    return m;
  });
  let next: GameState = { ...s, members };
  for (const n of notices) {
    next = log(next, "hanedan", "log.kin_death.title", "log.kin_death.body", { name: n.name, role: n.role });
  }
  return next;
}

export function tickDynastyYear(s: GameState, rng: () => number): GameState {
  const coming: DynastyMember[] = [];
  const members = s.members.map((m) => {
    if (!m.alive) return m;
    const wasChild = s.year - 1 - m.birthYear < 16;
    const nowAdult = isAdult(m, s.year);
    if (wasChild && nowAdult) coming.push(m);
    return tickPrince(s, m);
  });
  let next: GameState = { ...s, members };
  for (const m of coming) {
    next = log(next, "hanedan", "log.coming.title", "log.coming.body", { name: m.givenName });
  }
  next = tickHaremIntrigue(next);
  next = maybeDynastyBirth(next, rng);
  next = tickMortality(next, rng);
  return next;
}

export function maybeDynastyBirth(s: GameState, rng: () => number): GameState {
  if (s.harem?.lastBirthYear === s.year) return s;
  const eligible = (s.harem?.bonds ?? []).filter((b) => {
    if (b.stage !== "halvet" && b.stage !== "family") return false;
    if ((s.harem.lastHalvetYear ?? 0) < s.year - 1) return false;
    return canRomance(s, b.partnerId);
  });
  if (!eligible.length) return s;
  if (rng() > 0.32) return s;
  const bond = pick(rng, eligible);
  const mother = s.members.find((m) => m.id === bond.partnerId);
  if (!mother || !isAdult(mother, s.year) || isChild(mother, s.year)) return s;
  const boy = rng() > 0.42;
  const child = makeMember({
    givenName: boy ? pick(rng, MALE) : pick(rng, FEMALE),
    gender: boy ? "m" : "f",
    role: boy ? "sehzade" : "sultan_kizi",
    birthYear: s.year,
    portrait: boy ? "sehzade" : "hatun",
    location: s.realm.capitalId,
    fatherId: s.ruler.memberId,
    motherId: mother.id,
    education: null,
    military: 4,
    statecraft: 4,
    influence: 8,
    generation: (s.members.find((x) => x.id === s.ruler.memberId)?.generation ?? 1) + 1,
  });
  const next: GameState = {
    ...s,
    members: [...s.members, child],
    harem: {
      ...s.harem,
      lastBirthYear: s.year,
      bonds: s.harem.bonds.map((b) => (b.partnerId === mother.id ? { ...b, stage: "family" } : b)),
    },
    courtTies: [
      ...(s.courtTies ?? []),
      { targetId: child.id, kind: "member", affinity: 70, trust: 60, lastMetYear: s.year },
    ],
    prestige: clamp(s.prestige + 3, 0, 100),
  };
  return log(next, "hanedan", "log.birth.title", "log.birth.body", { name: child.givenName });
}

export function introduceConsort(s: GameState, rng: () => number): GameState {
  if (s.year - (s.harem?.lastIntroduceYear ?? 0) < 2) return s;
  if (s.treasury < 800) return s;
  const used = new Set(s.members.map((m) => m.givenName));
  const name = CONSORT.find((n) => !used.has(n)) ?? pick(rng, CONSORT);
  const hatunCount = s.members.filter((m) => m.alive && m.role === "hatun").length;
  const portrait: PortraitKey = hatunCount % 2 === 0 ? "hatun-b" : "hatun";
  const age = ADULT_FLOOR + Math.floor(rng() * 7);
  const woman = makeMember({
    givenName: name,
    gender: "f",
    role: "hatun",
    birthYear: s.year - age,
    portrait,
    location: s.realm.capitalId,
    haremRank: "ikbal",
    influence: 22,
    generation: s.members.find((x) => x.id === s.ruler.memberId)?.generation ?? 1,
  });
  const next: GameState = {
    ...s,
    treasury: Math.round(s.treasury - 800),
    ledger: [{ id: nid("led"), year: s.year, kind: "gider", amount: -800, noteKey: "ledger.harem_gift" }, ...s.ledger].slice(0, 80),
    members: [...s.members, woman],
    harem: { ...s.harem, lastIntroduceYear: s.year },
    courtTies: [
      ...(s.courtTies ?? []),
      { targetId: woman.id, kind: "member", affinity: 48, trust: 40, lastMetYear: s.year },
    ],
  };
  return log(next, "harem", "log.introduce.title", "log.introduce.body", { name: woman.givenName });
}

export function retireOldHarem(s: GameState, deceasedMemberId: string, heir: DynastyMember): GameState {
  const heirMotherId = heir.motherId;
  const members = s.members.map((m) => {
    if (!m.alive) return m;
    if (m.role === "valide") {
      if (m.id === heirMotherId) return m;
      return { ...m, role: "akraba" as const, haremRank: "none" as const, location: "eski_saray" };
    }
    if (m.role === "hatun") {
      if (m.id === heirMotherId) {
        return { ...m, role: "valide" as const, haremRank: "valide" as const, location: s.realm.capitalId };
      }
      return {
        ...m,
        spouseId: m.spouseId ?? deceasedMemberId,
        haremRank: "none" as const,
        location: "eski_saray",
      };
    }
    return m;
  });
  return {
    ...s,
    members,
    harem: {
      bonds: [],
      favoriteId: null,
      intrigue: 18,
      lastHalvetYear: 0,
      lastIntroduceYear: s.year,
      lastBirthYear: s.harem?.lastBirthYear ?? 0,
      scene: null,
    },
  };
}
