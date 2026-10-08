import { mulberry32, nid } from "@/domains/ids";
import { STATE_VERSION, type GameState, type PortraitKey } from "@/domains/types";
import { buildIdentity, personalityFrom, portraitForRole, standingFromWorld } from "@/domains/palace/identity";
import { placeOccupants } from "@/domains/palace/rooms";
import { ensureCourt } from "@/domains/divan/statesmen";
import { emptyDivanState } from "@/domains/divan/session";
import { fillMember } from "@/domains/dynasty/member";
import { emptyHarem } from "@/domains/dynasty/bonds";
import { ensureReigns } from "@/domains/dynasty/reigns";
import { hydrateSuccession } from "@/domains/dynasty/succession";
import { ensureEconomy } from "@/domains/economy/model";
import { computePeople } from "@/domains/economy/tick";
import { ensureMilitary } from "@/domains/military/model";
import { ensureDiplomacy } from "@/domains/diplomacy/model";
import { ensureSiege } from "@/domains/military/siege";
import { ensureWorldClock } from "@/domains/worldclock/model";
import { ensureHistory } from "@/domains/history/model";
import { syncHistory } from "@/domains/history/engine";
import { ensureCrisis } from "@/domains/crisis/tick";
import { ensureWardrobe } from "@/domains/commerce/wardrobe";
import { ensureGovernance } from "@/domains/governance/model";

const SULTAN: PortraitKey[] = ["sultan-a", "sultan-b", "sultan-c"];
const ALL: PortraitKey[] = [...SULTAN, "valide", "vizier", "sehzade", "kaptan", "ulema", "hatun", "hatun-b"];

function asPortrait(value: unknown, fallback: PortraitKey): PortraitKey {
  if (typeof value === "string" && (ALL as string[]).includes(value)) return value as PortraitKey;
  return fallback;
}

export function migrateState(raw: GameState): GameState {
  const portrait = asPortrait(raw.ruler?.portrait, "sultan-a");
  const favoriteId = raw.harem?.favoriteId ?? raw.members?.find((m) => m.role === "hatun" && m.alive)?.id ?? null;
  const members = (raw.members ?? []).map((m) =>
    fillMember(
      {
        ...m,
        portrait: asPortrait(m.portrait, portraitForRole(m.role, portrait)),
      },
      favoriteId,
    ),
  );
  const byId = new Map(members.map((m) => [m.id, m]));
  for (const m of members) {
    if (typeof (raw.members ?? []).find((x) => x.id === m.id)?.generation === "number") continue;
    if (m.role === "valide") m.generation = 0;
    else if (m.id === raw.ruler?.memberId || m.role === "sultan") m.generation = 1;
    else if (m.fatherId && byId.get(m.fatherId)) m.generation = (byId.get(m.fatherId)!.generation ?? 1) + 1;
    else if (m.role === "sehzade" || m.role === "sultan_kizi") m.generation = 2;
    else m.generation = 1;
  }
  const identity = raw.ruler?.identity ?? buildIdentity(portrait, raw.ruler.givenName, raw.ruler.reignStart ?? raw.year);
  if (identity.archetypeId !== portrait) {
    identity.archetypeId = portrait;
    identity.face = buildIdentity(portrait, raw.ruler.givenName, raw.year).face;
  }

  const harem = raw.harem ?? emptyHarem();
  if (!harem.bonds) harem.bonds = [];
  if (harem.favoriteId === undefined) harem.favoriteId = favoriteId;
  if (typeof harem.intrigue !== "number") harem.intrigue = 12;
  if (typeof harem.lastHalvetYear !== "number") harem.lastHalvetYear = 0;
  if (typeof harem.lastIntroduceYear !== "number") harem.lastIntroduceYear = 0;
  if (typeof harem.lastBirthYear !== "number") harem.lastBirthYear = 0;
  if (harem.scene === undefined) harem.scene = null;
  if (!harem.bonds.length && favoriteId) {
    const fav = members.find((m) => m.id === favoriteId);
    if (fav && fav.role === "hatun") {
      harem.bonds = [
        {
          id: nid("bond"),
          partnerId: fav.id,
          stage: "marriage",
          warmth: 70,
          consent: true,
          lastYear: raw.year - 1,
          married: true,
        },
      ];
      harem.favoriteId = fav.id;
    }
  }

  let next: GameState = {
    ...raw,
    version: STATE_VERSION,
    members,
    court: (raw.court ?? []).map((p, i) => ({
      id: p.id || `post_m${i}`,
      office: p.office,
      npcId: p.npcId ?? null,
      seat: p.seat,
      regionId: p.regionId,
    })),
    ruler: {
      ...raw.ruler,
      portrait,
      identity: {
        ...identity,
        archetypeId: portrait,
        givenName: raw.ruler.givenName,
        face: identity.face,
      },
      clothing: raw.ruler.clothing ?? "ceremonial",
      personality: raw.ruler.personality ?? personalityFrom(raw.ruler.traits ?? []),
      healthFlags: raw.ruler.healthFlags ?? { vigor: raw.ruler.health, fatigue: 20, constitution: "dinc" },
      reputation: raw.ruler.reputation ?? { court: 50, people: 50, ulema: 50, army: 50 },
      authority: raw.ruler.authority ?? { divan: 50, army: 50, harem: 50, ulema: 50 },
    },
    palace: raw.palace ?? { currentRoom: "taht", occupants: [], seenCinematics: [] },
    decisions: raw.decisions ?? [
      {
        id: nid("dec"),
        year: raw.ruler.reignStart ?? raw.year,
        kind: "culus",
        titleKey: "log.coronation.title",
      },
    ],
    courtTies:
      raw.courtTies ??
      [
        ...raw.npcs.map((n) => ({
          targetId: n.id,
          kind: "npc" as const,
          affinity: n.loyalty,
          trust: n.loyalty,
          lastMetYear: raw.year - 1,
        })),
        ...members
          .filter((m) => m.id !== raw.ruler.memberId)
          .map((m) => ({
            targetId: m.id,
            kind: "member" as const,
            affinity: m.role === "valide" ? 78 : m.role === "hatun" ? 70 : 60,
            trust: 65,
            lastMetYear: raw.year - 1,
          })),
      ],
    divan: raw.divan ?? emptyDivanState(raw.year),
    harem,
    reigns: raw.reigns ?? [],
    succession: raw.succession ?? null,
    siege: raw.siege ?? null,
  };

  next = ensureEconomy(next);
  next.economy = {
    ...next.economy,
    people: computePeople(next, next.economy.grainReserve),
  };
  next = ensureCourt(next, mulberry32((raw.seed ?? 1) + raw.year * 13));
  next = ensureReigns(next);
  next = hydrateSuccession(next);
  next = ensureMilitary(next);
  next = ensureSiege(next);
  next = ensureDiplomacy(next);
  next = ensureWorldClock(next);
  next = ensureHistory(next);
  next = ensureCrisis(next);
  next = ensureWardrobe(next);
  next = ensureGovernance(next);
  next = syncHistory(next, "migrate");

  const standing = standingFromWorld(next);
  next = {
    ...next,
    ruler: {
      ...next.ruler,
      healthFlags: { ...standing.healthFlags, fatigue: next.ruler.healthFlags.fatigue },
      reputation: standing.reputation,
      authority: standing.authority,
    },
    palace: {
      ...next.palace,
      occupants: placeOccupants(next),
    },
  };
  return next;
}
