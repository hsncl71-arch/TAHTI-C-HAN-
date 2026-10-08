import type { GameState, PalaceRoomId, PortraitKey } from "@/domains/types";
import { identitySrc, sovereignArchetype } from "@/domains/palace/identity";
import { occupantsIn, roomSceneSrc } from "@/domains/palace/rooms";

export interface ConsistencyReport {
  ok: boolean;
  failures: string[];
  archetypeId: PortraitKey;
}

export function inspectIdentity(state: GameState): ConsistencyReport {
  const failures: string[] = [];
  const arch = sovereignArchetype(state);
  if (state.ruler.portrait !== arch) {
    failures.push(`portrait ${state.ruler.portrait} != identity.archetypeId ${arch}`);
  }
  if (state.ruler.identity.givenName !== state.ruler.givenName) {
    failures.push("identity.givenName drifted from ruler.givenName");
  }
  const idle = identitySrc(arch, "idle");
  const speak = identitySrc(arch, "speak");
  if (!idle.endsWith(`/${arch}.jpg`)) {
    failures.push(`idle path does not lock to ${arch}`);
  }
  if (!speak.includes(`/${arch}/`) && !speak.endsWith(`/${arch}.jpg`)) {
    failures.push(`speak path escaped archetype ${arch}`);
  }
  const rooms: PalaceRoomId[] = ["taht", "divan", "harem", "hazine", "hasoda", "bahce", "elci", "sehzade", "askeri"];
  for (const room of rooms) {
    const src = roomSceneSrc(room);
    if (!src.startsWith("/art/")) failures.push(`room ${room} has no scene`);
    const people = occupantsIn(state, room);
    for (const o of people) {
      if (o.kind === "ruler" && o.characterId !== state.ruler.id) {
        failures.push(`ruler occupant in ${room} is not the sovereign`);
      }
      if (o.kind === "npc" && !state.npcs.some((n) => n.id === o.characterId)) {
        failures.push(`ghost npc ${o.characterId} in ${room}`);
      }
      if (o.kind === "member" && !state.members.some((m) => m.id === o.characterId)) {
        failures.push(`ghost member ${o.characterId} in ${room}`);
      }
    }
  }
  return { ok: failures.length === 0, failures, archetypeId: arch };
}

export function sameSovereign(before: GameState, after: GameState): boolean {
  if (before.ruler.id !== after.ruler.id) return true;
  return (
    before.ruler.portrait === after.ruler.portrait &&
    before.ruler.identity.archetypeId === after.ruler.identity.archetypeId &&
    before.ruler.identity.face.marks === after.ruler.identity.face.marks &&
    before.ruler.identity.face.beard === after.ruler.identity.face.beard
  );
}
