import { clamp } from "@/domains/ids";
import {
  BUILDING_COST,
  DIP_KINDS,
  DOCTRINES,
  PALACE_ROOMS,
  SIEGE_ACTIONS,
  TACTICS,
  TROOP_KINDS,
  type AudienceTopic,
  type BondAction,
  type Building,
  type DipKind,
  type DipTerms,
  type DoctrineId,
  type GameAction,
  type GameSpeed,
  type InvestKind,
  type Office,
  type PalaceRoomId,
  type PeaceDemand,
  type ReformId,
  type SiegeActionId,
  type StandingEdicts,
  type TacticId,
  type Treaty,
  type TroopKind,
} from "@/domains/types";
import { DIVAN_OFFICES } from "@/domains/divan/offices";
import { LOAN_MAX, LOAN_MIN, TARIFF_MAX, TARIFF_MIN, TAX_MAX, TAX_MIN } from "@/domains/economy/model";
import { isCosmeticSlot } from "@/domains/commerce/model";

export const MAX_RAISE = 2500;
export const MAX_GIFT = 50_000;
export const MIN_GIFT = 100;
export const MAX_RELIEF = 8_000;
export const ACTION_TYPES: GameAction["type"][] = [
  "ADVANCE_YEAR",
  "RESOLVE_EVENT",
  "APPOINT",
  "DISMISS",
  "SET_TAX",
  "RAISE_TROOPS",
  "DISBAND",
  "LAUNCH_CAMPAIGN",
  "RECALL_ARMY",
  "GIFT",
  "TREATY",
  "SET_TRADE_PACT",
  "SET_COALITION",
  "DIP_OFFER",
  "DIP_RESPOND",
  "DIP_WITHDRAW",
  "EDUCATE",
  "SANJAK",
  "BUILD",
  "GARRISON",
  "INVEST_PROVINCE",
  "SOOTHE_PROVINCE",
  "SET_TAX_BAND",
  "INVEST_KIND",
  "SUPPRESS_REVOLT",
  "REFORM",
  "SPY_REALM",
  "PEACE_TERMS",
  "SET_DIFFICULTY",
  "SET_SPEED",
  "SET_IRONMAN",
  "TUTORIAL_STEP",
  "HOLD_DIVAN",
  "RESOLVE_DIVAN",
  "CLOSE_DIVAN",
  "CONFIRM_SUCCESSION",
  "BACK_PRETENDER",
  "VISIT_ROOM",
  "AUDIENCE",
  "MARK_CINEMATIC",
  "HAREM_ACT",
  "ADVANCE_SCENE",
  "SKIP_SCENE",
  "FAVOR_CONSORT",
  "INTRODUCE_CONSORT",
  "DRILL_PRINCE",
  "CULTIVATE",
  "SET_TARIFF",
  "BORROW",
  "REPAY",
  "GRAIN_RELIEF",
  "SET_COMMANDER",
  "SET_DOCTRINE",
  "SET_TACTIC",
  "DRILL_HOST",
  "PAY_ULUFE",
  "STORM_FORT",
  "SIEGE_ACTION",
  "ADVANCE_SIEGE_CINEMA",
  "SKIP_SIEGE_CINEMA",
  "OFFER_PEACE",
  "START_DUEL",
  "RESOLVE_DUEL",
  "SET_EDICTS",
  "COMMISSION_WORK",
  "MARK_NOTICE",
  "MARK_NOTICES_READ",
  "EQUIP_COSMETIC",
];

const TYPE_SET = new Set<string>(ACTION_TYPES);
const TROOP_SET = new Set<string>(TROOP_KINDS);
const TACTIC_SET = new Set<string>(TACTICS);
const DOCTRINE_SET = new Set<string>(DOCTRINES);
const SIEGE_SET = new Set<string>(SIEGE_ACTIONS);
const DIP_SET = new Set<string>(DIP_KINDS);
const ROOM_SET = new Set<string>(PALACE_ROOMS);
const OFFICE_SET = new Set<string>(DIVAN_OFFICES);
const BUILDING_SET = new Set<string>(Object.keys(BUILDING_COST));
const TREATY_SET = new Set(["peace", "truce", "alliance", "war"]);
const BOND_SET = new Set(["meet", "court", "kiss", "private_time", "marry", "halvet"]);
const EDU_SET = new Set(["seyfiye", "ilmiye", "kalemiye"]);
const DEBT_SET = new Set(["galata", "ulema_vakif", "timar"]);
const TOPIC_SET = new Set(["hal", "nasihat", "sir", "dilek"]);
const HOLDER_SET = DEBT_SET;

function str(v: unknown, max = 80): string {
  return String(v ?? "").trim().slice(0, max);
}

function int(v: unknown, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error("bad_number");
  return clamp(Math.round(n), min, max);
}

function bool(v: unknown): boolean {
  return v === true;
}

function id(v: unknown, max = 64): string {
  const s = str(v, max);
  if (!s) throw new Error("bad_id");
  return s;
}

export function parseGameAction(input: unknown): GameAction {
  if (!input || typeof input !== "object") throw new Error("bad_action");
  const raw = input as Record<string, unknown>;
  const kind = str(raw.type, 40);
  if (!TYPE_SET.has(kind)) throw new Error("unknown_action");
  const type = kind as GameAction["type"];
  switch (type) {
    case "ADVANCE_YEAR":
    case "RECALL_ARMY":
    case "HOLD_DIVAN":
    case "CLOSE_DIVAN":
    case "CONFIRM_SUCCESSION":
    case "ADVANCE_SCENE":
    case "SKIP_SCENE":
    case "INTRODUCE_CONSORT":
    case "DRILL_HOST":
    case "PAY_ULUFE":
    case "STORM_FORT":
    case "ADVANCE_SIEGE_CINEMA":
    case "SKIP_SIEGE_CINEMA":
    case "MARK_NOTICES_READ":
      return { type };
    case "RESOLVE_EVENT":
      return { type, eventId: id(raw.eventId), choiceId: str(raw.choiceId, 32) };
    case "APPOINT": {
      const office = str(raw.office, 24);
      if (!OFFICE_SET.has(office)) throw new Error("bad_office");
      return { type, office: office as Office, npcId: id(raw.npcId), postId: raw.postId ? str(raw.postId, 64) : undefined };
    }
    case "DISMISS":
      return { type, postId: id(raw.postId) };
    case "SET_TAX": {
      const rate = Number(raw.rate);
      if (!Number.isFinite(rate)) throw new Error("bad_number");
      return { type, rate: clamp(rate, TAX_MIN, TAX_MAX) };
    }
    case "RAISE_TROOPS":
    case "DISBAND": {
      const kind = str(raw.kind, 16);
      if (!TROOP_SET.has(kind)) throw new Error("bad_troop");
      return { type, kind: kind as TroopKind, count: int(raw.count, 1, MAX_RAISE) };
    }
    case "LAUNCH_CAMPAIGN":
      return { type, provinceId: id(raw.provinceId, 40) };
    case "GIFT":
      return { type, realmId: id(raw.realmId, 40), amount: int(raw.amount, MIN_GIFT, MAX_GIFT) };
    case "TREATY": {
      const treaty = str(raw.treaty, 16);
      if (!TREATY_SET.has(treaty)) throw new Error("bad_treaty");
      return { type, realmId: id(raw.realmId, 40), treaty: treaty as Treaty };
    }
    case "SET_TRADE_PACT":
      return { type, realmId: id(raw.realmId, 40), on: bool(raw.on) };
    case "SET_COALITION":
      return { type, realmId: id(raw.realmId, 40), against: raw.against ? str(raw.against, 40) : null };
    case "DIP_OFFER": {
      const kind = str(raw.kind, 16);
      if (!DIP_SET.has(kind)) throw new Error("bad_dip");
      const terms = (raw.terms ?? {}) as DipTerms;
      return {
        type,
        realmId: id(raw.realmId, 40),
        kind: kind as DipKind,
        terms: {
          tribute: int(terms.tribute ?? 0, 0, MAX_GIFT),
          durationYears: int(terms.durationYears ?? 5, 1, 30),
          againstRealmId: terms.againstRealmId ? str(terms.againstRealmId, 40) : null,
          note: str(terms.note, 240),
        },
      };
    }
    case "DIP_RESPOND":
      return { type, offerId: id(raw.offerId), accept: bool(raw.accept) };
    case "DIP_WITHDRAW":
      return { type, offerId: id(raw.offerId) };
    case "EDUCATE": {
      const track = str(raw.track, 16);
      if (!EDU_SET.has(track)) throw new Error("bad_edu");
      return { type, memberId: id(raw.memberId), track: track as "seyfiye" | "ilmiye" | "kalemiye" };
    }
    case "SANJAK":
      return { type, memberId: id(raw.memberId), provinceId: id(raw.provinceId, 40) };
    case "GARRISON":
    case "INVEST_PROVINCE":
    case "SOOTHE_PROVINCE":
    case "SUPPRESS_REVOLT":
      return { type, provinceId: id(raw.provinceId, 40) };
    case "SET_TAX_BAND": {
      const band = str(raw.band, 16);
      if (band !== "dusuk" && band !== "normal" && band !== "yuksek" && band !== "harp") throw new Error("bad_tax");
      return { type, band };
    }
    case "INVEST_KIND": {
      const kind = str(raw.kind, 16);
      const invests: InvestKind[] = ["pazar", "yol", "liman", "depo", "kislak", "tarim", "sur"];
      if (!invests.includes(kind as InvestKind)) throw new Error("bad_invest");
      return { type, provinceId: id(raw.provinceId, 40), kind: kind as InvestKind };
    }
    case "REFORM": {
      const reform = str(raw.reform, 16);
      const reforms: ReformId[] = ["askeri", "mali", "idari", "diplomasi", "derya"];
      if (!reforms.includes(reform as ReformId)) throw new Error("bad_reform");
      return { type, reform: reform as ReformId };
    }
    case "SPY_REALM":
      return { type, realmId: id(raw.realmId, 40) };
    case "PEACE_TERMS": {
      const demand = str(raw.demand, 16);
      const demands: PeaceDemand[] = ["status", "gold", "province", "tribute"];
      if (!demands.includes(demand as PeaceDemand)) throw new Error("bad_peace");
      return {
        type,
        realmId: id(raw.realmId, 40),
        demand: demand as PeaceDemand,
        provinceId: raw.provinceId ? id(raw.provinceId, 40) : undefined,
      };
    }
    case "SET_DIFFICULTY": {
      const difficulty = str(raw.difficulty, 16);
      if (difficulty !== "kolay" && difficulty !== "nizam" && difficulty !== "zor" && difficulty !== "cihan") throw new Error("bad_difficulty");
      return { type, difficulty };
    }
    case "SET_SPEED": {
      const speed = str(raw.speed, 16);
      if (speed !== "dur" && speed !== "normal" && speed !== "hizli") throw new Error("bad_speed");
      return { type, speed: speed as GameSpeed };
    }
    case "SET_IRONMAN":
      return { type, on: bool(raw.on) };
    case "TUTORIAL_STEP":
      return { type, step: int(raw.step, 0, 10) };
    case "BUILD":
    case "COMMISSION_WORK": {
      const building = str(raw.building, 24);
      if (!BUILDING_SET.has(building)) throw new Error("bad_building");
      return { type, building: building as Building };
    }
    case "RESOLVE_DIVAN":
      return { type, itemId: id(raw.itemId), choiceId: str(raw.choiceId, 32) };
    case "BACK_PRETENDER":
    case "FAVOR_CONSORT":
    case "DRILL_PRINCE":
      return { type, memberId: id(raw.memberId) };
    case "VISIT_ROOM": {
      const room = str(raw.room, 24);
      if (!ROOM_SET.has(room)) throw new Error("bad_room");
      return { type, room: room as PalaceRoomId };
    }
    case "AUDIENCE": {
      const topic = str(raw.topic, 16);
      if (!TOPIC_SET.has(topic)) throw new Error("bad_topic");
      return { type, characterId: id(raw.characterId), topic: topic as AudienceTopic };
    }
    case "MARK_CINEMATIC":
    case "MARK_NOTICE":
      return { type, id: id(raw.id) };
    case "HAREM_ACT": {
      const act = str(raw.act, 16);
      if (!BOND_SET.has(act)) throw new Error("bad_bond");
      return { type, partnerId: id(raw.partnerId), act: act as BondAction };
    }
    case "CULTIVATE":
      return { type, memberId: id(raw.memberId), npcId: id(raw.npcId) };
    case "SET_TARIFF":
      return { type, rate: clamp(Number(raw.rate), TARIFF_MIN, TARIFF_MAX) };
    case "BORROW": {
      const holder = str(raw.holder, 24);
      if (!HOLDER_SET.has(holder)) throw new Error("bad_holder");
      return { type, holder: holder as "galata" | "ulema_vakif" | "timar", amount: int(raw.amount, LOAN_MIN, LOAN_MAX) };
    }
    case "REPAY":
      return { type, loanId: id(raw.loanId), amount: int(raw.amount, 1, LOAN_MAX) };
    case "GRAIN_RELIEF":
      return { type, amount: int(raw.amount, 50, MAX_RELIEF) };
    case "SET_COMMANDER":
      return {
        type,
        npcId: raw.npcId ? str(raw.npcId, 64) : undefined,
        memberId: raw.memberId ? str(raw.memberId, 64) : undefined,
      };
    case "SET_DOCTRINE": {
      const doctrine = str(raw.doctrine, 16);
      if (!DOCTRINE_SET.has(doctrine)) throw new Error("bad_doctrine");
      return { type, doctrine: doctrine as DoctrineId };
    }
    case "SET_TACTIC": {
      const tactic = str(raw.tactic, 24);
      if (!TACTIC_SET.has(tactic)) throw new Error("bad_tactic");
      return { type, tactic: tactic as TacticId };
    }
    case "SIEGE_ACTION": {
      const action = str(raw.action, 16);
      if (!SIEGE_SET.has(action)) throw new Error("bad_siege");
      return { type, action: action as SiegeActionId };
    }
    case "OFFER_PEACE":
      return { type, realmId: id(raw.realmId, 40) };
    case "START_DUEL":
      return {
        type,
        peerId: str(raw.peerId, 80) || "ai",
        peerName: str(raw.peerName, 40) || "Serdar",
        provinceId: str(raw.provinceId, 40),
        seed: 0,
        host: bool(raw.host),
        duelId: id(raw.duelId, 80),
      };
    case "RESOLVE_DUEL": {
      const tactic = str(raw.tactic, 24);
      if (!TACTIC_SET.has(tactic)) throw new Error("bad_tactic");
      return { type, tactic: tactic as TacticId, foeTactic: "hold_line" };
    }
    case "SET_EDICTS": {
      const e = (raw.edicts ?? {}) as Record<string, unknown>;
      const edicts: Partial<StandingEdicts> = {};
      const onAttack = str(e.onAttack, 24);
      const offensive = str(e.offensive, 24);
      const peace = str(e.peace, 24);
      const famine = str(e.famine, 16);
      const ulufe = str(e.ulufe, 16);
      const debt = str(e.debt, 24);
      const tax = str(e.tax, 24);
      const trade = str(e.trade, 24);
      const warOffer = str(e.warOffer, 16);
      const works = str(e.works, 16);
      if (onAttack === "defend_walls" || onAttack === "sally" || onAttack === "ask") edicts.onAttack = onAttack;
      if (offensive === "never" || offensive === "hold_campaign") edicts.offensive = offensive;
      if (peace === "ask" || peace === "accept_if_losing" || peace === "refuse") edicts.peace = peace;
      if (famine === "relief" || famine === "ask" || famine === "endure") edicts.famine = famine;
      if (ulufe === "pay" || ulufe === "ask" || ulufe === "refuse") edicts.ulufe = ulufe;
      if (debt === "no_borrow" || debt === "borrow_if_empty" || debt === "ask") edicts.debt = debt;
      if (tax === "hold" || tax === "ease_if_unrest") edicts.tax = tax;
      if (trade === "accept_friends" || trade === "ask" || trade === "refuse") edicts.trade = trade;
      if (warOffer === "ask" || warOffer === "refuse") edicts.warOffer = warOffer;
      if (works === "none" || works === "caravan") edicts.works = works;
      return { type, edicts };
    }
    case "EQUIP_COSMETIC": {
      const slot = str(raw.slot, 16);
      if (!isCosmeticSlot(slot)) throw new Error("bad_slot");
      return { type, slot, itemId: str(raw.itemId, 40) || "default" };
    }
    default:
      throw new Error("unknown_action");
  }
}

export const HOT_ACTIONS = new Set<GameAction["type"]>([
  "RAISE_TROOPS",
  "DISBAND",
  "GIFT",
  "BORROW",
  "GRAIN_RELIEF",
  "LAUNCH_CAMPAIGN",
  "SIEGE_ACTION",
  "STORM_FORT",
  "RESOLVE_DUEL",
  "START_DUEL",
  "DIP_OFFER",
  "TREATY",
  "ADVANCE_YEAR",
  "EQUIP_COSMETIC",
]);
