import type { DynastyMember, GameState } from "@/domains/types";

/** Hard gate: nobody under this age enters romance, intimacy, or adult harem politics as a partner. */
export const ADULT_AGE = 16;

export function ageOf(member: { birthYear: number }, year: number): number {
  return year - member.birthYear;
}

export function isAdult(member: { birthYear: number }, year: number): boolean {
  return ageOf(member, year) >= ADULT_AGE;
}

export function isChild(member: { birthYear: number }, year: number): boolean {
  return !isAdult(member, year);
}

export function rulerIsAdult(s: GameState): boolean {
  return s.year - s.ruler.birthYear >= ADULT_AGE;
}

export function livingMembers(s: GameState): DynastyMember[] {
  return s.members.filter((m) => m.alive);
}

export function motherOfRuler(s: GameState): DynastyMember | undefined {
  const self = s.members.find((m) => m.id === s.ruler.memberId);
  if (self?.motherId) return s.members.find((m) => m.id === self.motherId);
  return s.members.find((m) => m.alive && m.role === "valide");
}
