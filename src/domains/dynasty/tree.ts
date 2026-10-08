import type { DynastyMember, GameState } from "@/domains/types";

export interface TreeNode {
  member: DynastyMember;
  spouses: DynastyMember[];
  children: TreeNode[];
}

export function byGeneration(s: GameState): Map<number, DynastyMember[]> {
  const map = new Map<number, DynastyMember[]>();
  for (const m of s.members) {
    const g = m.generation ?? 1;
    const arr = map.get(g) ?? [];
    arr.push(m);
    map.set(g, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.birthYear - b.birthYear || a.givenName.localeCompare(b.givenName));
  }
  return map;
}

export function spousesOf(s: GameState, m: DynastyMember): DynastyMember[] {
  return s.members.filter(
    (x) => x.id !== m.id && (x.spouseId === m.id || m.spouseId === x.id || (m.role === "sultan" && x.role === "hatun" && x.spouseId === m.id)),
  );
}

export function childrenOf(s: GameState, m: DynastyMember): DynastyMember[] {
  return s.members
    .filter((x) => x.fatherId === m.id || x.motherId === m.id)
    .sort((a, b) => a.birthYear - b.birthYear);
}

export function dynastyRoots(s: GameState): DynastyMember[] {
  const ids = new Set(s.members.map((m) => m.id));
  const roots = s.members.filter((m) => {
    if (m.role === "sultan" && (m.generation ?? 1) <= 1) return true;
    if (!m.fatherId && !m.motherId && m.role !== "hatun") return true;
    if (m.fatherId && !ids.has(m.fatherId) && m.role === "sultan") return true;
    return false;
  });
  const unique = new Map(roots.map((r) => [r.id, r]));
  if (unique.size === 0) {
    const founder = s.members.find((m) => m.role === "sultan") ?? s.members[0];
    if (founder) unique.set(founder.id, founder);
  }
  return [...unique.values()].sort((a, b) => a.birthYear - b.birthYear);
}

export function buildTree(s: GameState): TreeNode[] {
  const seen = new Set<string>();
  const walk = (m: DynastyMember): TreeNode => {
    seen.add(m.id);
    const kids = childrenOf(s, m).filter((c) => !seen.has(c.id));
    return {
      member: m,
      spouses: spousesOf(s, m),
      children: kids.map(walk),
    };
  };
  return dynastyRoots(s).map(walk);
}

export function lineagePath(s: GameState, memberId: string): DynastyMember[] {
  const path: DynastyMember[] = [];
  let cur = s.members.find((m) => m.id === memberId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    path.unshift(cur);
    cur = cur.fatherId ? s.members.find((m) => m.id === cur!.fatherId) : undefined;
  }
  return path;
}
