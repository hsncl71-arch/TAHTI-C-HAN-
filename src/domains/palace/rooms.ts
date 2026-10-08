import type { GameState, PalaceOccupant, PalaceRoomId, ViewId } from "@/domains/types";
import { holderOf, sitting } from "@/domains/divan/offices";

export const ROOM_ORDER: PalaceRoomId[] = [
  "taht",
  "divan",
  "harem",
  "hazine",
  "hasoda",
  "bahce",
  "elci",
  "sehzade",
  "askeri",
];

export const VIEW_TO_ROOM: Partial<Record<ViewId, PalaceRoomId>> = {
  divan: "divan",
  hazine: "hazine",
  ordu: "askeri",
  diplomasi: "elci",
  hanedan: "sehzade",
};

export const CINEMATIC_CULUS = {
  id: "culus",
  src: "/art/cinema/culus.mp4",
  room: "taht" as PalaceRoomId,
};

export function roomSceneSrc(room: PalaceRoomId): string {
  switch (room) {
    case "taht":
      return "/art/throne-room.jpg";
    case "divan":
      return "/art/divan.jpg";
    case "hazine":
      return "/art/treasury.jpg";
    case "harem":
      return "/art/rooms/harem.jpg";
    case "hasoda":
      return "/art/rooms/has-oda.jpg";
    case "bahce":
      return "/art/rooms/bahce.jpg";
    case "elci":
      return "/art/rooms/elci.jpg";
    case "sehzade":
      return "/art/rooms/sehzade-kanat.jpg";
    case "askeri":
      return "/art/rooms/askeri.jpg";
    default:
      return "/art/throne-room.jpg";
  }
}

export function roomCinematic(state: GameState, room: PalaceRoomId): string | null {
  if (room === CINEMATIC_CULUS.room && !state.palace.seenCinematics.includes(CINEMATIC_CULUS.id)) {
    return CINEMATIC_CULUS.src;
  }
  if (state.succession) return null;
  return null;
}

export function placeOccupants(s: GameState): PalaceOccupant[] {
  const out: PalaceOccupant[] = [];
  const add = (characterId: string, kind: PalaceOccupant["kind"], room: PalaceRoomId) => {
    if (!characterId) return;
    if (out.some((o) => o.characterId === characterId && o.room === room)) return;
    out.push({ characterId, kind, room });
  };

  add(s.ruler.id, "ruler", "taht");
  add(s.ruler.id, "ruler", "hasoda");

  for (const { post, npc } of sitting(s)) {
    add(npc.id, "npc", "divan");
    if (post.office === "sadrazam") {
      add(npc.id, "npc", "taht");
      add(npc.id, "npc", "askeri");
    }
    if (post.office === "defterdar") add(npc.id, "npc", "hazine");
    if (post.office === "nisanci" || post.office === "reisulkuttab") add(npc.id, "npc", "elci");
    if (post.office === "kaptan" || post.office === "yeniceri_agasi") add(npc.id, "npc", "askeri");
    if (post.office === "beylerbeyi") add(npc.id, "npc", "taht");
  }

  const mus = s.npcs.find((n) => n.office === "musahib" && n.alive);
  if (mus) {
    add(mus.id, "npc", "taht");
    add(mus.id, "npc", "bahce");
  }

  const sad = holderOf(s, "sadrazam");
  if (sad) add(sad.id, "npc", "divan");

  for (const m of s.members.filter((x) => x.alive)) {
    if (m.role === "valide") {
      add(m.id, "member", "harem");
      add(m.id, "member", "taht");
    } else if (m.role === "hatun") {
      add(m.id, "member", "harem");
      add(m.id, "member", "bahce");
      if (s.harem?.favoriteId === m.id) add(m.id, "member", "hasoda");
    } else if (m.role === "sultan_kizi") {
      add(m.id, "member", "harem");
    } else if (m.role === "sehzade" || m.role === "akraba") {
      add(m.id, "member", "sehzade");
    }
  }

  return out;
}

export function occupantsIn(s: GameState, room: PalaceRoomId): PalaceOccupant[] {
  return (s.palace?.occupants ?? placeOccupants(s)).filter((o) => o.room === room);
}

export function findOccupantSubject(s: GameState, occupant: PalaceOccupant) {
  if (occupant.kind === "ruler") {
    return {
      id: s.ruler.id,
      name: s.ruler.givenName,
      portrait: s.ruler.portrait,
      subtitle: "ruler",
      age: s.year - s.ruler.birthYear,
    };
  }
  if (occupant.kind === "npc") {
    const n = s.npcs.find((x) => x.id === occupant.characterId);
    if (!n) return null;
    return { id: n.id, name: n.name, portrait: n.portrait, subtitle: n.office, age: s.year - n.birthYear };
  }
  const m = s.members.find((x) => x.id === occupant.characterId);
  if (!m) return null;
  return { id: m.id, name: m.givenName, portrait: m.portrait, subtitle: m.role, age: s.year - m.birthYear };
}
