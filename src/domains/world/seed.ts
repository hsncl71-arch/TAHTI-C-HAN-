import { instantiateProvinces, OSMANLI_SEAT, SEAT_CATALOG, seatById } from "@/domains/map/provinces";
import { hashSeed, mulberry32, nid } from "@/domains/ids";
import { buildIdentity, personalityFrom, standingFromWorld } from "@/domains/palace/identity";
import { placeOccupants } from "@/domains/palace/rooms";
import { seedCourt } from "@/domains/divan/statesmen";
import { emptyDivanState } from "@/domains/divan/session";
import { makeMember } from "@/domains/dynasty/member";
import { emptyHarem } from "@/domains/dynasty/bonds";
import { openReign } from "@/domains/dynasty/reigns";
import { emptyEconomy, ensureEconomy } from "@/domains/economy/model";
import { computePeople } from "@/domains/economy/tick";
import { emptyMilitary, ensureMilitary, fillArmy } from "@/domains/military/model";
import { emptyDiplomacy, ensureDiplomacy, fillRelation } from "@/domains/diplomacy/model";
import { defaultBond } from "@/domains/diplomacy/defaults";
import { seatTitle } from "@/domains/diplomacy/seats";
import { emptyWorldClock, ensureWorldClock } from "@/domains/worldclock/model";
import { emptyWardrobe } from "@/domains/commerce/wardrobe";
import { emptyHistory } from "@/domains/history/model";
import { emptyCrisis } from "@/domains/crisis/model";
import { ensureCrisis } from "@/domains/crisis/tick";
import { emptyGovernance, ensureGovernance } from "@/domains/governance/model";
import { syncHistory } from "@/domains/history/engine";
import {
  START_YEAR,
  STATE_VERSION,
  WORLD_ID,
  type CreateRulerInput,
  type GameState,
  type PortraitKey,
  type RulerStats,
  type TraitId,
} from "@/domains/types";

const MALE_HEIRS = ["Bayezid", "Selim", "Murad", "Cihangir", "Korkut", "Alemşah"];
const FEMALE_NAMES = ["Hatice", "Mihrimah", "Ayşe", "Fatma", "Beyhan"];

function statsFromTraits(traits: TraitId[], focus: CreateRulerInput["focus"]): RulerStats {
  const s: RulerStats = { adalet: 6, cesaret: 6, ilim: 6, siyaset: 6 };
  for (const t of traits) {
    if (t === "adalet" || t === "comertlik") s.adalet += 3;
    if (t === "cesaret") s.cesaret += 3;
    if (t === "ilim" || t === "zahid") s.ilim += 3;
    if (t === "siyaset") s.siyaset += 3;
  }
  if (focus === "fatih") s.cesaret += 2;
  if (focus === "kanuni") s.adalet += 2;
  if (focus === "hunkar") s.siyaset += 2;
  return s;
}

export function createInitialState(input: CreateRulerInput, userId: string): GameState {
  const seed = hashSeed(`${userId}:${input.givenName}:${input.dynastyName}:${START_YEAR}`);
  const rng = mulberry32(seed);
  const realmId = nid("realm");
  const stats = statsFromTraits(input.traits, input.focus);
  const birthYear = START_YEAR - 28;
  const portrait: PortraitKey =
    input.portrait === "sultan-a" || input.portrait === "sultan-b" || input.portrait === "sultan-c"
      ? input.portrait
      : "sultan-a";
  const seat = seatById(input.seatId ?? OSMANLI_SEAT);
  const capital = seat.capitalId;
  const sultan = makeMember({
    givenName: input.givenName,
    gender: "m",
    role: "sultan",
    birthYear,
    stats,
    location: capital,
    portrait,
    influence: 80,
    military: 40,
    statecraft: 45,
    generation: 1,
  });
  const valide = makeMember({
    givenName: "Hüma",
    gender: "f",
    role: "valide",
    birthYear: START_YEAR - 56,
    location: capital,
    portrait: "valide",
    influence: 74,
    statecraft: 60,
    generation: 0,
  });
  const hatun = makeMember({
    givenName: "Gülbahar",
    gender: "f",
    role: "hatun",
    birthYear: START_YEAR - 26,
    location: capital,
    portrait: "hatun",
    spouseId: sultan.id,
    favorite: true,
    haremRank: "haseki",
    influence: 48,
    generation: 1,
  });
  const heir = makeMember({
    givenName: MALE_HEIRS[seed % MALE_HEIRS.length],
    gender: "m",
    role: "sehzade",
    birthYear: START_YEAR - 9,
    location: capital,
    portrait: "sehzade",
    fatherId: sultan.id,
    motherId: hatun.id,
    education: "seyfiye",
    military: 12,
    statecraft: 10,
    influence: 18,
    generation: 2,
  });
  const kizi = makeMember({
    givenName: FEMALE_NAMES[(seed >> 3) % FEMALE_NAMES.length],
    gender: "f",
    role: "sultan_kizi",
    birthYear: START_YEAR - 7,
    location: capital,
    portrait: "hatun",
    fatherId: sultan.id,
    motherId: hatun.id,
    influence: 10,
    generation: 2,
  });

  const { npcs, court } = seedCourt(START_YEAR, seed, rng);

  const provinces = instantiateProvinces(realmId, seat.id);
  const foreign = SEAT_CATALOG.filter((r) => r.id !== seat.id).map((r) => ({
    id: r.id,
    name: r.name,
    adjective: r.adjective,
    capitalId: r.capitalId,
    color: r.color,
    religion: r.religion,
    culture: r.culture,
    isPlayer: false,
    aiKey: r.aiKey,
  }));

  const realmName = seat.id === OSMANLI_SEAT && input.focus === "hunkar" ? "Devlet-i Âliyye" : seat.name;
  const identity = buildIdentity(portrait, input.givenName, START_YEAR);
  const harem = emptyHarem();
  harem.favoriteId = hatun.id;
  harem.bonds = [
    {
      id: nid("bond"),
      partnerId: hatun.id,
      stage: "marriage",
      warmth: 72,
      consent: true,
      lastYear: START_YEAR - 1,
      married: true,
    },
  ];

  let state: GameState = {
    version: STATE_VERSION,
    seed,
    worldId: WORLD_ID,
    year: START_YEAR,
    tick: 0,
    taxRate: 0.12,
    treasury: 14000,
    prestige: 45,
    piety: 55,
    stability: 58,
    realm: {
      id: realmId,
      name: realmName,
      adjective: seat.adjective,
      capitalId: capital,
      color: seat.color,
      religion: seat.religion,
      culture: seat.culture,
      isPlayer: true,
      aiKey: seat.aiKey,
    },
    ruler: {
      id: nid("ruler"),
      memberId: sultan.id,
      givenName: input.givenName,
      title: seatTitle(seat.id),
      dynastyName: input.dynastyName,
      gender: "m",
      birthYear,
      health: 82,
      traits: input.traits,
      stats,
      portrait,
      reignStart: START_YEAR,
      identity,
      clothing: "ceremonial",
      healthFlags: { vigor: 82, fatigue: 18, constitution: "dinc" },
      reputation: { court: 55, people: 50, ulema: 55, army: 52 },
      authority: { divan: 58, army: 54, harem: 60, ulema: 55 },
      personality: personalityFrom(input.traits),
    },
    dynastyId: nid("dyn"),
    members: [sultan, valide, hatun, heir, kizi],
    court,
    npcs,
    provinces,
    foreign,
    relations: foreign.map((r) => {
      const seedBond = defaultBond(seat.id, r.id);
      return fillRelation(
        {
          realmId: r.id,
          value: seedBond.value,
          treaty: seedBond.treaty,
          tradePact: false,
          coalitionAgainst: null,
        },
        r.id,
      );
    }),
    army: fillArmy(
      {
        janissary: 8000,
        sipahi: 12000,
        azab: 9000,
        akinji: 4200,
        topcu: 40,
        navy: 30,
        levend: 1800,
        morale: 72,
        provinceId: capital,
        status: "idle",
        drill: 58,
        experience: 44,
        supply: 74,
        pay: 70,
      },
      capital,
    ),
    campaign: null,
    siege: null,
    military: emptyMilitary(),
    buildings: { cami: 2, medrese: 1, kervansaray: 1, tersane: 1, hisar: 2 },
    pendingEvents: [
      {
        id: nid("ev"),
        key: "tahta_cikis",
        year: START_YEAR,
        payload: { name: input.givenName },
      },
    ],
    chronicle: [
      {
        id: nid("ch"),
        year: START_YEAR,
        kind: "saltanat",
        titleKey: "log.coronation.title",
        bodyKey: "log.coronation.body",
        vars: { name: input.givenName, dynasty: input.dynastyName, city: capital },
      },
    ],
    ledger: [
      {
        id: nid("led"),
        year: START_YEAR,
        kind: "hazine",
        amount: 14000,
        noteKey: "ledger.opening",
      },
    ],
    succession: null,
    reigns: [],
    lastDivanYear: START_YEAR - 1,
    focus: input.focus,
    palace: { currentRoom: "taht", occupants: [], seenCinematics: [] },
    decisions: [
      {
        id: nid("dec"),
        year: START_YEAR,
        kind: "culus",
        titleKey: "log.coronation.title",
        room: "taht",
      },
    ],
    courtTies: [
      ...npcs.map((n) => ({
        targetId: n.id,
        kind: "npc" as const,
        affinity: n.loyalty,
        trust: n.favor,
        lastMetYear: START_YEAR - 1,
      })),
      ...[valide, hatun, heir, kizi].map((m) => ({
        targetId: m.id,
        kind: "member" as const,
        affinity: m.role === "valide" ? 80 : m.role === "hatun" ? 72 : 62,
        trust: 68,
        lastMetYear: START_YEAR - 1,
      })),
    ],
    divan: emptyDivanState(START_YEAR),
    harem,
    economy: emptyEconomy(),
    diplomacy: emptyDiplomacy(seat.id),
    world: emptyWorldClock(Date.now()),
    history: emptyHistory(),
    crisis: emptyCrisis(),
    wardrobe: emptyWardrobe(),
    governance: emptyGovernance(provinces),
  };
  const standing = standingFromWorld(state);
  state.ruler = {
    ...state.ruler,
    healthFlags: { ...standing.healthFlags, fatigue: 18 },
    reputation: standing.reputation,
    authority: standing.authority,
  };
  state.palace = { ...state.palace, occupants: placeOccupants(state) };
  state = ensureEconomy(state);
  state.economy = {
    ...state.economy,
    people: computePeople(state, state.economy.grainReserve),
    lastBudget: null,
  };
  state = ensureMilitary(state);
  state = ensureDiplomacy(state);
  state = ensureWorldClock(state);
  state = ensureCrisis(state);
  state = ensureGovernance(state);
  return syncHistory(openReign(state), "seed");
}

export function rebaseCampaignSeat(s: GameState, seatId: string): GameState {
  const seat = seatById(seatId);
  const realmId = s.realm.id;
  const provinces = instantiateProvinces(realmId, seatId);
  const foreign = SEAT_CATALOG.filter((r) => r.id !== seatId).map((r) => ({
    id: r.id,
    name: r.name,
    adjective: r.adjective,
    capitalId: r.capitalId,
    color: r.color,
    religion: r.religion,
    culture: r.culture,
    isPlayer: false,
    aiKey: r.aiKey,
  }));
  const relations = foreign.map((r) => {
    const seedBond = defaultBond(seatId, r.id);
    return fillRelation({ realmId: r.id, value: seedBond.value, treaty: seedBond.treaty }, r.id);
  });
  const rebased = ensureDiplomacy({
    ...s,
    realm: {
      ...s.realm,
      name: seat.name,
      adjective: seat.adjective,
      capitalId: seat.capitalId,
      color: seat.color,
      religion: seat.religion,
      culture: seat.culture,
      aiKey: seat.aiKey,
      isPlayer: true,
    },
    ruler: { ...s.ruler, title: seatTitle(seatId) },
    provinces,
    foreign,
    relations,
    army: { ...s.army, provinceId: seat.capitalId, status: "idle" },
    campaign: null,
    siege: null,
    diplomacy: { seatId, seats: s.diplomacy?.seats ?? [], pending: [] },
    history: emptyHistory(),
  });
  return syncHistory(ensureGovernance(rebased), "seed");
}
