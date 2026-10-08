import { clamp } from "@/domains/ids";
import type { ClaimPower, DynastyMember, GameState, Pretender } from "@/domains/types";
import { ageOf, isChild } from "@/domains/dynasty/age";

const OFFICE_WEIGHT: Record<string, number> = {
  sadrazam: 28,
  yeniceri_agasi: 22,
  seyhulislam: 16,
  defterdar: 12,
  kaptan: 14,
  nisanci: 10,
  kazasker_rumeli: 11,
  kazasker_anadolu: 10,
  kubbe_vezir: 9,
  beylerbeyi: 15,
  reisulkuttab: 8,
  musahib: 7,
};

export function claimPower(s: GameState, m: DynastyMember): ClaimPower {
  const child = isChild(m, s.year);
  let court = m.influence * 0.15;
  for (const id of m.supporters) {
    const npc = s.npcs.find((n) => n.id === id && n.alive);
    if (!npc) continue;
    court += npc.influence * 0.28 + (OFFICE_WEIGHT[npc.office] ?? 8) + npc.loyalty * 0.08;
  }
  const mother = m.motherId ? s.members.find((x) => x.id === m.motherId) : undefined;
  if (mother?.alive) court += mother.influence * 0.22;
  if (s.harem?.favoriteId && mother && s.harem.favoriteId === mother.id) court += 14;
  const valide = s.members.find((x) => x.alive && x.role === "valide");
  if (valide && mother && (mother.id === valide.id || mother.role === "hatun")) {
    court += valide.influence * 0.12;
  }

  let army = m.military * 0.55;
  const agha = s.npcs.find((n) => n.office === "yeniceri_agasi" && n.alive);
  if (agha && m.supporters.includes(agha.id)) army += 24;
  const kaptan = s.npcs.find((n) => n.office === "kaptan" && n.alive);
  if (kaptan && m.supporters.includes(kaptan.id)) army += 10;
  if (m.education === "seyfiye") army += 8;
  army += s.army.morale * 0.08;

  let people = m.influence * 0.35 + m.stats.adalet * 2.2 + (s.ruler.reputation?.people ?? 50) * 0.08;
  if (m.education === "ilmiye") people += 7;
  people += Math.max(0, 40 - (s.harem?.intrigue ?? 12)) * 0.15;

  const loc = s.provinces.find((p) => p.id === m.location && p.ownerId === s.realm.id);
  let province = 0;
  if (loc) {
    province = loc.development * 3.2 + loc.loyalty * 0.38 + loc.manpower / 450 + loc.fort * 4;
  } else if (m.location === s.realm.capitalId) {
    province = 10;
  }

  const talent =
    (m.stats.adalet + m.stats.cesaret + m.stats.ilim + m.stats.siyaset) * 1.15 +
    m.military * 0.16 +
    m.statecraft * 0.22;
  const edu = m.education === "seyfiye" ? 4 : m.education === "kalemiye" ? 5 : m.education === "ilmiye" ? 3 : 0;

  let blood = 0;
  if (m.fatherId === s.ruler.memberId) blood = 44;
  else if (m.role === "sehzade") blood = 30;
  else blood = 14;
  if (mother?.role === "valide" || mother?.haremRank === "haseki") blood += 10;
  const brothers = s.members.filter(
    (x) => x.alive && x.gender === "m" && x.fatherId && x.fatherId === m.fatherId && x.id !== m.id,
  );
  blood += Math.max(0, 8 - brothers.length * 2);
  const age = ageOf(m, s.year);
  if (age >= 18) blood += 6;

  const scale = child ? 0.42 : 1;
  return {
    court: clamp(Math.round(court * scale), 0, 100),
    army: clamp(Math.round(army * scale), 0, 100),
    people: clamp(Math.round(people * (child ? 0.55 : 1)), 0, 100),
    province: clamp(Math.round(province * scale), 0, 100),
    talent: clamp(Math.round((talent + edu) * (child ? 0.5 : 1)), 0, 100),
    blood: clamp(Math.round(blood), 0, 100),
  };
}

export function claimStrength(power: ClaimPower): number {
  return Math.round(
    power.court * 0.22 +
      power.army * 0.2 +
      power.people * 0.12 +
      power.province * 0.16 +
      power.talent * 0.14 +
      power.blood * 0.16,
  );
}

export function asPretender(s: GameState, m: DynastyMember): Pretender {
  const claim = claimPower(s, m);
  return {
    memberId: m.id,
    name: m.givenName,
    portrait: m.portrait,
    birthYear: m.birthYear,
    generation: m.generation ?? 1,
    claim,
    strength: claimStrength(claim),
    backers: [...m.supporters],
    location: m.location,
    motherId: m.motherId,
    fatherId: m.fatherId,
  };
}

export function eligiblePrinces(s: GameState): DynastyMember[] {
  return s.members.filter((m) => m.alive && (m.role === "sehzade" || m.role === "akraba") && m.gender === "m");
}

export function buildPretenders(s: GameState): Pretender[] {
  return eligiblePrinces(s)
    .map((m) => asPretender(s, m))
    .sort((a, b) => b.strength - a.strength || a.birthYear - b.birthYear);
}

export function measureTension(pretenders: Pretender[]): number {
  if (pretenders.length <= 1) return 12;
  const spread = pretenders[0].strength - pretenders[1].strength;
  return clamp(78 - spread * 2.4, 14, 96);
}
