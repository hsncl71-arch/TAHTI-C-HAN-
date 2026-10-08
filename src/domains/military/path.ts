import type { Province } from "@/domains/types";

export function shortestPath(provinces: Province[], fromId: string, toId: string): string[] | null {
  if (fromId === toId) return [fromId];
  const byId = new Map(provinces.map((p) => [p.id, p]));
  if (!byId.has(fromId) || !byId.has(toId)) return null;
  const seen = new Set<string>([fromId]);
  const q: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];
  while (q.length) {
    const cur = q.shift()!;
    const node = byId.get(cur.id);
    if (!node) continue;
    for (const n of node.neighbors) {
      if (seen.has(n) || !byId.has(n)) continue;
      const path = [...cur.path, n];
      if (n === toId) return path;
      seen.add(n);
      q.push({ id: n, path });
    }
  }
  return null;
}

export function reachableIds(provinces: Province[], fromId: string): Set<string> {
  const byId = new Map(provinces.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const q = [fromId];
  if (!byId.has(fromId)) return seen;
  seen.add(fromId);
  while (q.length) {
    const id = q.shift()!;
    const node = byId.get(id);
    if (!node) continue;
    for (const n of node.neighbors) {
      if (seen.has(n) || !byId.has(n)) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return seen;
}
