import type { CourtPost, FactionId, GameState, Npc, Office, Origin, PortraitKey } from "@/domains/types";

export interface OfficeDef {
  office: Office;
  fromYear: number;
  unique: boolean;
  rank: number;
  stipend: number;
  influenceRate: number;
  faction: FactionId;
  origin: Origin;
  portrait: PortraitKey;
  seatsAt: (year: number) => number;
  regions?: { id: string; fromYear: number }[];
}

export const OFFICE_DEFS: OfficeDef[] = [
  {
    office: "sadrazam",
    fromYear: 1299,
    unique: true,
    rank: 1,
    stipend: 220,
    influenceRate: 3.4,
    faction: "divan",
    origin: "devsirme",
    portrait: "vizier",
    seatsAt: () => 1,
  },
  {
    office: "seyhulislam",
    fromYear: 1424,
    unique: true,
    rank: 2,
    stipend: 160,
    influenceRate: 1.6,
    faction: "ulema",
    origin: "ulema",
    portrait: "ulema",
    seatsAt: () => 1,
  },
  {
    office: "defterdar",
    fromYear: 1360,
    unique: true,
    rank: 3,
    stipend: 140,
    influenceRate: 1.8,
    faction: "hazine",
    origin: "kalemiye",
    portrait: "vizier",
    seatsAt: () => 1,
  },
  {
    office: "nisanci",
    fromYear: 1360,
    unique: true,
    rank: 4,
    stipend: 120,
    influenceRate: 1.4,
    faction: "divan",
    origin: "kalemiye",
    portrait: "vizier",
    seatsAt: () => 1,
  },
  {
    office: "kazasker_rumeli",
    fromYear: 1363,
    unique: true,
    rank: 5,
    stipend: 130,
    influenceRate: 1.3,
    faction: "ulema",
    origin: "ulema",
    portrait: "ulema",
    seatsAt: () => 1,
  },
  {
    office: "kazasker_anadolu",
    fromYear: 1363,
    unique: true,
    rank: 6,
    stipend: 120,
    influenceRate: 1.2,
    faction: "ulema",
    origin: "ulema",
    portrait: "ulema",
    seatsAt: () => 1,
  },
  {
    office: "kaptan",
    fromYear: 1453,
    unique: true,
    rank: 7,
    stipend: 150,
    influenceRate: 1.7,
    faction: "derya",
    origin: "askeri",
    portrait: "kaptan",
    seatsAt: () => 1,
  },
  {
    office: "yeniceri_agasi",
    fromYear: 1363,
    unique: true,
    rank: 8,
    stipend: 140,
    influenceRate: 2.1,
    faction: "ocak",
    origin: "kapikulu",
    portrait: "kaptan",
    seatsAt: () => 1,
  },
  {
    office: "kubbe_vezir",
    fromYear: 1453,
    unique: false,
    rank: 9,
    stipend: 110,
    influenceRate: 1.5,
    faction: "divan",
    origin: "devsirme",
    portrait: "vizier",
    seatsAt: (year) => (year >= 1560 ? 4 : year >= 1520 ? 3 : 2),
  },
  {
    office: "beylerbeyi",
    fromYear: 1362,
    unique: false,
    rank: 10,
    stipend: 130,
    influenceRate: 1.6,
    faction: "eyalet",
    origin: "askeri",
    portrait: "vizier",
    seatsAt: () => 0,
    regions: [
      { id: "rumeli", fromYear: 1362 },
      { id: "anadolu", fromYear: 1393 },
      { id: "misir", fromYear: 1517 },
      { id: "budin", fromYear: 1541 },
    ],
  },
  {
    office: "reisulkuttab",
    fromYear: 1524,
    unique: true,
    rank: 11,
    stipend: 100,
    influenceRate: 1.4,
    faction: "divan",
    origin: "kalemiye",
    portrait: "vizier",
    seatsAt: () => 1,
  },
];

export const DIVAN_OFFICES: Office[] = OFFICE_DEFS.map((d) => d.office);

export function officeDef(office: Office): OfficeDef | undefined {
  return OFFICE_DEFS.find((d) => d.office === office);
}

export function isDivanOffice(office: Office): boolean {
  return OFFICE_DEFS.some((d) => d.office === office);
}

export interface SeatSpec {
  office: Office;
  seat?: number;
  regionId?: string;
}

export function activeSeats(year: number): SeatSpec[] {
  const out: SeatSpec[] = [];
  for (const def of OFFICE_DEFS) {
    if (year < def.fromYear) continue;
    if (def.regions) {
      for (const r of def.regions) {
        if (year >= r.fromYear) out.push({ office: def.office, regionId: r.id });
      }
      continue;
    }
    const seats = def.seatsAt(year);
    if (def.unique || seats <= 1) {
      out.push({ office: def.office });
    } else {
      for (let i = 1; i <= seats; i += 1) out.push({ office: def.office, seat: i });
    }
  }
  return out;
}

export function seatKey(spec: SeatSpec): string {
  if (spec.regionId) return `${spec.office}:${spec.regionId}`;
  if (spec.seat) return `${spec.office}:${spec.seat}`;
  return spec.office;
}

export function postMatches(post: CourtPost, spec: SeatSpec): boolean {
  if (post.office !== spec.office) return false;
  if (spec.regionId) return post.regionId === spec.regionId;
  if (spec.seat) return post.seat === spec.seat;
  return !post.regionId && !post.seat;
}

export function holderOf(s: GameState, office: Office, spec?: { seat?: number; regionId?: string }): Npc | undefined {
  const post = s.court.find((p) => {
    if (p.office !== office || !p.npcId) return false;
    if (spec?.seat) return p.seat === spec.seat;
    if (spec?.regionId) return p.regionId === spec.regionId;
    return true;
  });
  if (!post?.npcId) return s.npcs.find((n) => n.office === office && n.alive);
  return s.npcs.find((n) => n.id === post.npcId && n.alive);
}

export function sitting(s: GameState): { post: CourtPost; npc: Npc }[] {
  const out: { post: CourtPost; npc: Npc }[] = [];
  for (const post of s.court) {
    if (!post.npcId) continue;
    const npc = s.npcs.find((n) => n.id === post.npcId && n.alive);
    if (npc) out.push({ post, npc });
  }
  return out;
}

export function vacantPosts(s: GameState): CourtPost[] {
  return s.court.filter((p) => !p.npcId);
}

export function npcPost(s: GameState, npcId: string): CourtPost | undefined {
  return s.court.find((p) => p.npcId === npcId);
}

export function stipendOf(office: Office): number {
  return officeDef(office)?.stipend ?? 80;
}

export function courtStipendTotal(s: GameState): number {
  return s.court.reduce((a, p) => a + (p.npcId ? stipendOf(p.office) : 24), 0);
}

export function officePortrait(office: Office): PortraitKey {
  return officeDef(office)?.portrait ?? "vizier";
}
