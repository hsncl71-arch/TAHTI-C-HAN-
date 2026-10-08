import { clamp, nid, pick } from "@/domains/ids";
import type { FactionId, GameState, Npc, Office, Origin, PortraitKey } from "@/domains/types";
import { activeSeats, officeDef, officePortrait, postMatches, seatKey, type SeatSpec } from "@/domains/divan/offices";

const NAMES: Record<Origin, string[]> = {
  devsirme: ["Feridun Paşa", "İshak Paşa", "Mahmud Paşa", "Rüstem Bey", "Sokollu-zade Ali", "Gedik Ahmed"],
  ulema: ["Zeyrek Efendi", "Fenarizade Muhyiddin", "Müeyyedzade Abdurrahman", "Molla Hüsrev", "İbn Kemal-zade", "Çivizade Mehmed"],
  askeri: ["Hasan Paşa", "Davud Paşa", "Bali Bey", "Mihaloğlu Ali", "Evrenosoğlu İsa", "Turahanoğlu Ömer"],
  kalemiye: ["Cafer Çelebi", "Lütfi Bey", "Taci-zade Cafer", "Celalzade Mustafa", "Ramazzade Mehmed", "Koca Nişancı"],
  kapikulu: ["Mustafa Ağa", "Yusuf Ağa", "Kara Hüseyin Ağa", "Şahin Ağa", "Süleyman Ağa", "Firuz Ağa"],
  hanedan: ["Ömer Ağa", "Şehsuvar Bey", "Yakub Bey"],
};

export interface NpcDraft {
  name: string;
  office: Office;
  loyalty?: number;
  competence?: number;
  portrait?: PortraitKey;
  origin?: Origin;
  faction?: FactionId;
  influence?: number;
  wealth?: number;
  favor?: number;
  ambition?: number;
  birthYear?: number;
  tenureStart?: number;
  seat?: number;
  regionId?: string;
  rivals?: string[];
  allies?: string[];
}

export function hydrateNpc(raw: Partial<Npc> & Pick<Npc, "id" | "name" | "office" | "loyalty" | "competence" | "portrait" | "alive">, year: number): Npc {
  const def = officeDef(raw.office);
  return {
    id: raw.id,
    name: raw.name,
    office: raw.office,
    loyalty: clamp(raw.loyalty, 0, 100),
    competence: clamp(raw.competence, 1, 100),
    portrait: raw.portrait,
    alive: raw.alive,
    influence: clamp(raw.influence ?? Math.round(raw.competence * 0.48), 0, 100),
    wealth: Math.max(200, raw.wealth ?? 600 + raw.competence * 18),
    favor: clamp(raw.favor ?? raw.loyalty, 0, 100),
    ambition: clamp(raw.ambition ?? 35 + Math.round(raw.competence * 0.2), 0, 100),
    origin: raw.origin ?? def?.origin ?? "devsirme",
    faction: raw.faction ?? def?.faction ?? "divan",
    rivals: raw.rivals ?? [],
    allies: raw.allies ?? [],
    tenureStart: raw.tenureStart ?? year,
    birthYear: raw.birthYear ?? year - 42,
    seat: raw.seat,
    regionId: raw.regionId,
  };
}

export function makeNpc(draft: NpcDraft, year: number, rng?: () => number): Npc {
  const def = officeDef(draft.office);
  const roll = rng ?? (() => 0.5);
  const competence = draft.competence ?? 58 + Math.floor(roll() * 28);
  const loyalty = draft.loyalty ?? 58 + Math.floor(roll() * 22);
  return hydrateNpc(
    {
      id: nid("npc"),
      name: draft.name,
      office: draft.office,
      loyalty,
      competence,
      portrait: draft.portrait ?? officePortrait(draft.office),
      alive: true,
      origin: draft.origin ?? def?.origin,
      faction: draft.faction ?? def?.faction,
      influence: draft.influence,
      wealth: draft.wealth,
      favor: draft.favor ?? loyalty,
      ambition: draft.ambition ?? 40 + Math.floor(roll() * 30),
      birthYear: draft.birthYear ?? year - (38 + Math.floor(roll() * 18)),
      tenureStart: draft.tenureStart ?? year,
      seat: draft.seat,
      regionId: draft.regionId,
      rivals: draft.rivals,
      allies: draft.allies,
    },
    year,
  );
}

export function pickName(origin: Origin, used: Set<string>, rng: () => number): string {
  const pool = NAMES[origin].filter((n) => !used.has(n));
  const source = pool.length ? pool : NAMES[origin];
  let name = pick(rng, source);
  if (used.has(name)) name = `${name.split(" ")[0]} ${pick(rng, ["Paşa", "Bey", "Efendi", "Ağa"])}`;
  used.add(name);
  return name;
}

function link(a: Npc, b: Npc, kind: "rival" | "ally") {
  if (a.id === b.id) return;
  const key = kind === "rival" ? "rivals" : "allies";
  if (!a[key].includes(b.id)) a[key] = [...a[key], b.id];
  if (!b[key].includes(a.id)) b[key] = [...b[key], a.id];
}

export function weaveFactions(npcs: Npc[]): Npc[] {
  const byOffice = (office: Office) => npcs.find((n) => n.office === office && n.alive);
  const sad = byOffice("sadrazam");
  const def = byOffice("defterdar");
  const nis = byOffice("nisanci");
  const kap = byOffice("kaptan");
  const aga = byOffice("yeniceri_agasi");
  const sey = byOffice("seyhulislam");
  const kr = byOffice("kazasker_rumeli");
  const ka = byOffice("kazasker_anadolu");
  const kubbe = npcs.filter((n) => n.office === "kubbe_vezir" && n.alive);
  const beys = npcs.filter((n) => n.office === "beylerbeyi" && n.alive);
  if (sad && def) link(sad, def, "rival");
  if (sad && nis) link(sad, nis, "ally");
  if (def && kr) link(def, kr, "ally");
  if (aga && kap) link(aga, kap, "rival");
  if (sey && ka) link(sey, ka, "ally");
  if (sey && kr) link(sey, kr, "rival");
  if (kubbe[0] && kubbe[1]) link(kubbe[0], kubbe[1], "rival");
  if (kubbe[0] && sad) link(kubbe[0], sad, "ally");
  if (beys[0] && beys[1]) link(beys[0], beys[1], "rival");
  if (aga && sad) link(aga, sad, "rival");
  return npcs;
}

export function seedCourt(year: number, seed: number, rng: () => number): { npcs: Npc[]; court: GameState["court"] } {
  const used = new Set<string>();
  const named: NpcDraft[] = [
    { name: "Feridun Paşa", office: "sadrazam", loyalty: 72, competence: 78, ambition: 62 },
    { name: "Zeyrek Efendi", office: "seyhulislam", loyalty: 80, competence: 84, ambition: 28, origin: "ulema" },
    { name: "Salih Paşa", office: "kaptan", loyalty: 68, competence: 90, ambition: 55, origin: "askeri" },
    { name: "Cafer Çelebi", office: "defterdar", loyalty: 70, competence: 76, ambition: 48, origin: "kalemiye" },
    { name: "Lütfi Bey", office: "nisanci", loyalty: 74, competence: 71, ambition: 40, origin: "kalemiye" },
    { name: "Müeyyedzade Abdurrahman", office: "kazasker_rumeli", loyalty: 76, competence: 82, origin: "ulema" },
    { name: "Fenarizade Muhyiddin", office: "kazasker_anadolu", loyalty: 73, competence: 79, origin: "ulema" },
    { name: "Mustafa Ağa", office: "yeniceri_agasi", loyalty: 64, competence: 74, ambition: 70, origin: "kapikulu" },
    { name: "İshak Paşa", office: "kubbe_vezir", loyalty: 69, competence: 73, seat: 1, ambition: 58 },
    { name: "Mahmud Paşa", office: "kubbe_vezir", loyalty: 66, competence: 81, seat: 2, ambition: 64 },
    { name: "Hasan Paşa", office: "beylerbeyi", loyalty: 67, competence: 75, regionId: "rumeli", origin: "askeri" },
    { name: "Davud Paşa", office: "beylerbeyi", loyalty: 65, competence: 72, regionId: "anadolu", origin: "askeri" },
    { name: "Ömer Ağa", office: "musahib", loyalty: 66, competence: 60, ambition: 35, origin: "hanedan" },
  ];
  for (const d of named) used.add(d.name);

  const seats = activeSeats(year);
  const npcs: Npc[] = named.map((d) => makeNpc(d, year, rng));
  const court: GameState["court"] = [];

  for (const spec of seats) {
    let npc = npcs.find((n) => n.alive && matchesSpec(n, spec) && !court.some((c) => c.npcId === n.id));
    if (!npc) {
      const def = officeDef(spec.office);
      npc = makeNpc(
        {
          name: pickName(def?.origin ?? "devsirme", used, rng),
          office: spec.office,
          seat: spec.seat,
          regionId: spec.regionId,
        },
        year,
        rng,
      );
      npcs.push(npc);
    }
    npc.seat = spec.seat;
    npc.regionId = spec.regionId;
    npc.office = spec.office;
    court.push({
      id: nid("post"),
      office: spec.office,
      npcId: npc.id,
      seat: spec.seat,
      regionId: spec.regionId,
    });
  }

  for (let i = 0; i < 3; i += 1) {
    const origin: Origin = pick(rng, ["devsirme", "kalemiye", "askeri", "kapikulu"]);
    npcs.push(
      makeNpc(
        {
          name: pickName(origin, used, rng),
          office: "musahib",
          origin,
          competence: 50 + Math.floor(rng() * 20),
          loyalty: 55 + Math.floor(rng() * 20),
        },
        year,
        rng,
      ),
    );
  }

  weaveFactions(npcs);
  void seed;
  return { npcs, court };
}

function matchesSpec(n: Npc, spec: SeatSpec): boolean {
  if (n.office !== spec.office) return false;
  if (spec.regionId) return n.regionId === spec.regionId;
  if (spec.seat) return n.seat === spec.seat;
  return true;
}

export function ensureCourt(s: GameState, rng: () => number): GameState {
  const used = new Set(s.npcs.map((n) => n.name));
  const npcs = s.npcs.map((n) => hydrateNpc(n, s.year));
  let court = s.court.map((p, i) => ({
    id: p.id || nid("post"),
    office: p.office,
    npcId: p.npcId ?? null,
    seat: p.seat,
    regionId: p.regionId,
    _i: i,
  }));

  const seats = activeSeats(s.year);
  for (const spec of seats) {
    const exists = court.find((p) => postMatches(p, spec));
    if (exists) continue;
    const def = officeDef(spec.office);
    const npc = makeNpc(
      {
        name: pickName(def?.origin ?? "devsirme", used, rng),
        office: spec.office,
        seat: spec.seat,
        regionId: spec.regionId,
        loyalty: 62,
        competence: 68,
      },
      s.year,
      rng,
    );
    npcs.push(npc);
    court.push({
      id: nid("post"),
      office: spec.office,
      npcId: npc.id,
      seat: spec.seat,
      regionId: spec.regionId,
      _i: court.length,
    });
  }

  const keyed = new Set(seats.map(seatKey));
  court = court.filter((p) => {
    if (p.office === "valide" || p.office === "musahib") return false;
    return keyed.has(seatKey({ office: p.office, seat: p.seat, regionId: p.regionId })) || OFFICE_KEEP.has(p.office);
  });

  const woven = court.some((p) => {
    const n = npcs.find((x) => x.id === p.npcId);
    return n && n.rivals.length > 0;
  });
  if (!woven) weaveFactions(npcs);

  return {
    ...s,
    npcs,
    court: court.map(({ id, office, npcId, seat, regionId }) => ({ id, office, npcId, seat, regionId })),
  };
}

const OFFICE_KEEP = new Set<Office>([
  "sadrazam",
  "seyhulislam",
  "kaptan",
  "defterdar",
  "nisanci",
  "kazasker_rumeli",
  "kazasker_anadolu",
  "yeniceri_agasi",
  "kubbe_vezir",
  "beylerbeyi",
  "reisulkuttab",
]);

export function unemployed(s: GameState): Npc[] {
  const seated = new Set(s.court.map((p) => p.npcId).filter(Boolean) as string[]);
  return s.npcs.filter((n) => n.alive && !seated.has(n.id));
}
