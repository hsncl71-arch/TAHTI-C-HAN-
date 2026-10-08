import { clamp, nid } from "@/domains/ids";
import type { BondAction, BondStage, GameState, HaremBond, HaremState } from "@/domains/types";
import { ADULT_AGE, isAdult, isChild, motherOfRuler, rulerIsAdult } from "@/domains/dynasty/age";

const STAGE_RANK: Record<BondStage, number> = {
  none: 0,
  acquaintance: 1,
  courtship: 2,
  kiss: 3,
  private: 4,
  marriage: 5,
  halvet: 6,
  family: 7,
};

export const BOND_ACTIONS: BondAction[] = ["meet", "court", "kiss", "private_time", "marry", "halvet"];

const ACTION_TARGET: Record<BondAction, BondStage> = {
  meet: "acquaintance",
  court: "courtship",
  kiss: "kiss",
  private_time: "private",
  marry: "marriage",
  halvet: "halvet",
};

const ACTION_MIN: Record<BondAction, BondStage> = {
  meet: "none",
  court: "acquaintance",
  kiss: "courtship",
  private_time: "kiss",
  marry: "kiss",
  halvet: "private",
};

const SCENE_ACTIONS = new Set<BondAction>(["kiss", "private_time", "halvet"]);

export function emptyHarem(): HaremState {
  return {
    bonds: [],
    favoriteId: null,
    intrigue: 12,
    lastHalvetYear: 0,
    lastIntroduceYear: 0,
    lastBirthYear: 0,
    scene: null,
  };
}

/**
 * Romance is only between the adult sovereign and an adult consort (hatun).
 * Children, daughters, sons, the valide (mother) and previous sultans' widows are excluded.
 */
export function canRomance(s: GameState, partnerId: string): boolean {
  if (!rulerIsAdult(s)) return false;
  const m = s.members.find((x) => x.id === partnerId);
  if (!m || !m.alive) return false;
  if (m.id === s.ruler.memberId) return false;
  if (isChild(m, s.year)) return false;
  if (m.role !== "hatun") return false;
  if (m.gender !== "f") return false;
  if (m.fatherId === s.ruler.memberId || m.motherId === s.ruler.memberId) return false;
  const mother = motherOfRuler(s);
  if (mother && m.id === mother.id) return false;
  if (m.spouseId && m.spouseId !== s.ruler.memberId) return false;
  return ageOfSafe(m, s.year) >= ADULT_AGE;
}

function ageOfSafe(m: { birthYear: number }, year: number): number {
  return year - m.birthYear;
}

export function bondWith(s: GameState, partnerId: string): HaremBond | undefined {
  return (s.harem?.bonds ?? []).find((b) => b.partnerId === partnerId);
}

export function stageOf(s: GameState, partnerId: string): BondStage {
  return bondWith(s, partnerId)?.stage ?? "none";
}

export function actionAllowed(s: GameState, partnerId: string, act: BondAction): boolean {
  if (!canRomance(s, partnerId)) return false;
  const bond = bondWith(s, partnerId);
  if (bond && bond.consent === false) return false;
  const stage = bond?.stage ?? "none";
  if (act === "meet") return stage === "none";
  if (STAGE_RANK[stage] < STAGE_RANK[ACTION_MIN[act]]) return false;
  if (act === "marry" && (stage === "marriage" || STAGE_RANK[stage] >= STAGE_RANK.marriage)) return false;
  return true;
}

export function availableActions(s: GameState, partnerId: string): BondAction[] {
  return BOND_ACTIONS.filter((a) => actionAllowed(s, partnerId, a));
}

export function adultConsorts(s: GameState) {
  return s.members.filter((m) => m.alive && m.role === "hatun" && canRomance(s, m.id));
}

export function childrenInHarem(s: GameState) {
  return s.members.filter(
    (m) => m.alive && isChild(m, s.year) && (m.role === "sehzade" || m.role === "sultan_kizi"),
  );
}

export function actionOpensScene(act: BondAction): boolean {
  return SCENE_ACTIONS.has(act);
}

export function nextStageAfter(act: BondAction, current: BondStage): BondStage {
  const target = ACTION_TARGET[act];
  return STAGE_RANK[target] > STAGE_RANK[current] ? target : current;
}

export function upsertBond(s: GameState, partnerId: string, patch: Partial<HaremBond>): GameState {
  const existing = bondWith(s, partnerId);
  const next: HaremBond = existing
    ? { ...existing, ...patch, partnerId, lastYear: s.year }
    : {
        id: nid("bond"),
        partnerId,
        stage: "none",
        warmth: 40,
        consent: true,
        lastYear: s.year,
        married: false,
        ...patch,
      };
  const bonds = existing
    ? (s.harem.bonds ?? []).map((b) => (b.partnerId === partnerId ? next : b))
    : [...(s.harem?.bonds ?? []), next];
  return { ...s, harem: { ...s.harem, bonds } };
}

export function applyBondAction(s: GameState, partnerId: string, act: BondAction): GameState {
  if (!actionAllowed(s, partnerId, act)) return s;
  const current = stageOf(s, partnerId);
  const stage = nextStageAfter(act, current);
  const warmthDelta = act === "meet" ? 8 : act === "court" ? 10 : act === "marry" ? 12 : 6;
  let next = upsertBond(s, partnerId, {
    stage,
    consent: true,
    warmth: clamp((bondWith(s, partnerId)?.warmth ?? 40) + warmthDelta, 0, 100),
    married: act === "marry" || bondWith(s, partnerId)?.married,
  });
  if (act === "marry") {
    next = {
      ...next,
      members: next.members.map((m) => (m.id === partnerId ? { ...m, spouseId: next.ruler.memberId } : m)),
    };
  }
  if (act === "halvet") {
    next = {
      ...next,
      harem: { ...next.harem, lastHalvetYear: next.year },
      ruler: {
        ...next.ruler,
        healthFlags: { ...next.ruler.healthFlags, fatigue: clamp(next.ruler.healthFlags.fatigue - 8, 0, 100) },
      },
    };
  }
  return next;
}

export function setFavorite(s: GameState, memberId: string): GameState {
  if (!canRomance(s, memberId)) return s;
  const members = s.members.map((m) => {
    if (m.role !== "hatun" || !m.alive) return m;
    if (m.id === memberId) return { ...m, haremRank: "haseki" as const, influence: clamp(m.influence + 10, 0, 100) };
    if (m.haremRank === "haseki") return { ...m, haremRank: "kadin" as const, influence: clamp(m.influence - 6, 0, 100) };
    return m;
  });
  const bonds = (s.harem?.bonds ?? []).map((b) =>
    b.partnerId === memberId
      ? { ...b, warmth: clamp(b.warmth + 10, 0, 100) }
      : { ...b, warmth: clamp(b.warmth - 8, 0, 100) },
  );
  return {
    ...s,
    members,
    harem: { ...s.harem, favoriteId: memberId, bonds, intrigue: clamp((s.harem?.intrigue ?? 12) + 8, 0, 100) },
  };
}

export function isRomanticTargetId(s: GameState, id: string): boolean {
  return canRomance(s, id);
}

export { STAGE_RANK };
