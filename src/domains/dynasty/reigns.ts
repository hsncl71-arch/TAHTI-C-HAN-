import { nid } from "@/domains/ids";
import type { GameState, RealmSnapshot, ReignRecord } from "@/domains/types";
import { totalDebt } from "@/domains/economy/budget";

export function takeRealmSnapshot(s: GameState): RealmSnapshot {
  const owned = s.provinces.filter((p) => p.ownerId === s.realm.id);
  const wars = s.relations.filter((r) => r.treaty === "war").map((r) => r.realmId);
  const friends = s.relations.filter((r) => r.value >= 20 && r.treaty !== "war").map((r) => r.realmId);
  const enemies = s.relations.filter((r) => r.value <= -20 || r.treaty === "war").map((r) => r.realmId);
  return {
    year: s.year,
    treasury: s.treasury,
    stability: s.stability,
    prestige: s.prestige,
    piety: s.piety,
    army: {
      janissary: s.army.janissary,
      sipahi: s.army.sipahi,
      azab: s.army.azab,
      akinji: s.army.akinji ?? 0,
      topcu: s.army.topcu,
      navy: s.army.navy,
      levend: s.army.levend ?? 0,
      morale: s.army.morale,
    },
    provincesOwned: owned.length,
    wars,
    friends,
    enemies,
    treaties: s.relations.map((r) => ({ realmId: r.realmId, treaty: r.treaty, value: r.value })),
    debt: totalDebt(s),
  };
}

export function openReign(s: GameState): GameState {
  const already = (s.reigns ?? []).some((r) => r.endYear === null && r.memberId === s.ruler.memberId);
  if (already) return s;
  const gen = s.members.find((m) => m.id === s.ruler.memberId)?.generation ?? 1;
  const record: ReignRecord = {
    id: nid("reign"),
    ordinal: (s.reigns ?? []).length + 1,
    memberId: s.ruler.memberId,
    givenName: s.ruler.givenName,
    portrait: s.ruler.portrait,
    identity: s.ruler.identity,
    startYear: s.ruler.reignStart ?? s.year,
    endYear: null,
    deathAge: null,
    snapshotStart: takeRealmSnapshot(s),
    snapshotEnd: null,
    warsWon: 0,
    warsLost: 0,
    provincesGained: 0,
    provincesLost: 0,
    buildingsRaised: 0,
    heirName: null,
    generation: gen,
  };
  return { ...s, reigns: [...(s.reigns ?? []), record] };
}

export function closeReign(s: GameState, heirName: string | null = null): GameState {
  const reigns = [...(s.reigns ?? [])];
  let idx = reigns.findIndex((r) => r.endYear === null && r.memberId === s.ruler.memberId);
  if (idx < 0) idx = reigns.findIndex((r) => r.endYear === null);
  if (idx < 0) return s;
  const start = reigns[idx].snapshotStart;
  const end = takeRealmSnapshot(s);
  const buildingsNow =
    s.buildings.cami + s.buildings.medrese + s.buildings.kervansaray + s.buildings.tersane + s.buildings.hisar;
  reigns[idx] = {
    ...reigns[idx],
    endYear: s.year,
    deathAge: s.year - s.ruler.birthYear,
    snapshotEnd: end,
    heirName: heirName ?? reigns[idx].heirName,
    provincesGained: Math.max(0, end.provincesOwned - start.provincesOwned),
    provincesLost: Math.max(0, start.provincesOwned - end.provincesOwned),
    warsWon: Math.max(0, end.provincesOwned - start.provincesOwned),
    warsLost: Math.max(0, start.provincesOwned - end.provincesOwned),
    buildingsRaised: Math.max(0, buildingsNow),
  };
  return { ...s, reigns };
}

export function patchReignHeir(s: GameState, deceasedMemberId: string, heirName: string): GameState {
  return {
    ...s,
    reigns: (s.reigns ?? []).map((r) =>
      r.memberId === deceasedMemberId && r.endYear != null ? { ...r, heirName } : r,
    ),
  };
}

export function ensureReigns(s: GameState): GameState {
  if (s.succession) return { ...s, reigns: s.reigns ?? [] };
  if ((s.reigns ?? []).length > 0) {
    const open = s.reigns.some((r) => r.endYear === null);
    if (open) return s;
    return openReign(s);
  }
  return openReign({ ...s, reigns: [] });
}

export function currentReign(s: GameState): ReignRecord | undefined {
  return (s.reigns ?? []).find((r) => r.endYear === null) ?? s.reigns?.[s.reigns.length - 1];
}

export function generationCount(s: GameState): number {
  let max = 1;
  for (const m of s.members) {
    if ((m.generation ?? 1) > max) max = m.generation ?? 1;
  }
  for (const r of s.reigns ?? []) {
    if (r.generation > max) max = r.generation;
  }
  return max;
}

export function realmInherited(before: GameState, after: GameState): boolean {
  if (after.treasury !== before.treasury) return false;
  if (after.army.janissary !== before.army.janissary) return false;
  if (after.army.sipahi !== before.army.sipahi) return false;
  if (after.army.azab !== before.army.azab) return false;
  if (after.army.topcu !== before.army.topcu) return false;
  if (after.army.navy !== before.army.navy) return false;
  if (after.provinces.length !== before.provinces.length) return false;
  for (const p of before.provinces) {
    const q = after.provinces.find((x) => x.id === p.id);
    if (!q || q.ownerId !== p.ownerId) return false;
  }
  for (const r of before.relations) {
    const q = after.relations.find((x) => x.realmId === r.realmId);
    if (!q || q.treaty !== r.treaty || q.value !== r.value) return false;
  }
  return true;
}
