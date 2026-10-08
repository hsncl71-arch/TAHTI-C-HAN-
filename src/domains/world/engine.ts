import { eventByKey, spawnYearEvents } from "@/domains/events/catalog";
import { clamp, mulberry32, nid } from "@/domains/ids";
import type {
  ActionResult,
  AudienceTopic,
  Building,
  ChronicleEntry,
  DecisionRecord,
  GameAction,
  GameState,
  TroopKind,
} from "@/domains/types";
import { BUILDING_COST, MS_PER_YEAR, START_YEAR, TROOP_COST } from "@/domains/types";
import { regaliaForRoom, standingFromWorld } from "@/domains/palace/identity";
import { placeOccupants } from "@/domains/palace/rooms";
import { migrateState } from "@/domains/palace/migrate";
import { tickPolitics } from "@/domains/divan/politics";
import { appointToPost, closeDivan, dismissPost, expireDivan, holdDivan, resolveDivanItem } from "@/domains/divan/session";
import { ensureCourt } from "@/domains/divan/statesmen";
import { applyBondAction, actionOpensScene, canRomance, setFavorite } from "@/domains/dynasty/bonds";
import { advanceScene, skipScene, startScene } from "@/domains/dynasty/intimacy";
import { cultivatePrince, drillPrince } from "@/domains/dynasty/princes";
import { introduceConsort, tickDynastyYear } from "@/domains/dynasty/politics";
import { isAdult } from "@/domains/dynasty/age";
import { beginInterregnum, backPretender, confirmEnthronement } from "@/domains/dynasty/succession";
import { ensureReigns } from "@/domains/dynasty/reigns";
import { campaignCost, computeBudget, totalDebt } from "@/domains/economy/budget";
import { canBorrow, openLoan, repayLoan } from "@/domains/economy/credit";
import { applyGrainRelief, setTariff, tickEconomyYear } from "@/domains/economy/tick";
import { ensureEconomy } from "@/domains/economy/model";
import { hostPower } from "@/domains/military/combat";
import {
  drillHost,
  launchCampaign,
  offerPeace,
  payUlufe,
  retreatHost,
  resolveSiegeAction,
  setCommander,
  setDoctrine,
  stormFort,
} from "@/domains/military/campaign";
import { resolveDuel, setLiveTactic, startDuel } from "@/domains/military/duel";
import { ensureMilitary } from "@/domains/military/model";
import { reachableIds } from "@/domains/military/path";
import { advanceSiegeCinema, dismissSiegeCinema, ensureSiege } from "@/domains/military/siege";
import { terrainOf, weatherOf } from "@/domains/military/terrain";
import { tickMilitaryYear } from "@/domains/military/tick";
import { tickRivalRealms, garrisonProvince, investProvince, sootheProvince } from "@/domains/military/realms";
import { tickGovernanceYear } from "@/domains/governance/tick";
import { enactReform, investKind, proposePeace, setTaxBand, spyRealm, suppressRevolt } from "@/domains/governance/actions";
import { bandFromRate, ensureGovernance } from "@/domains/governance/model";
import { dropOffer, ensureDiplomacy, isPlayerHeld } from "@/domains/diplomacy/model";
import { tickAiDiplomacy, aiAcceptsOffer } from "@/domains/diplomacy/ai";
import { applyOfferResult, localTreatyAllowed, queueOutgoingOffer, resolveQueuedOffer, setRelation } from "@/domains/diplomacy/apply";
import type { DipKind } from "@/domains/types";
import { validateOffer } from "@/domains/diplomacy/offers";
import { clampTerms } from "@/domains/diplomacy/world";
import { bumpSim, ensureWorldClock, markAllNoticesRead, markNoticeRead, patchEdicts, setPaused } from "@/domains/worldclock/model";
import { haltReason, applyRoutineEdicts } from "@/domains/worldclock/edicts";
import { commissionWork } from "@/domains/worldclock/works";
import { syncHistory } from "@/domains/history/engine";
import { crisisByKey } from "@/domains/crisis/catalog";
import { recordCrisis } from "@/domains/crisis/model";
import { tickCrisisYear } from "@/domains/crisis/tick";
import { ensureWardrobe, equipWardrobe } from "@/domains/commerce/wardrobe";
import { isCosmeticSlot } from "@/domains/commerce/model";

function notice(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): ChronicleEntry {
  return { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
}

function pushLog(s: GameState, entry: ChronicleEntry): GameState {
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

function pushDecision(s: GameState, partial: Omit<DecisionRecord, "id" | "year">): GameState {
  const rec: DecisionRecord = { id: nid("dec"), year: s.year, room: s.palace?.currentRoom, ...partial };
  return { ...s, decisions: [rec, ...(s.decisions ?? [])].slice(0, 48) };
}

function syncPalace(s: GameState): GameState {
  const standing = standingFromWorld(s);
  return {
    ...s,
    ruler: {
      ...s.ruler,
      healthFlags: {
        ...standing.healthFlags,
        fatigue: s.ruler.healthFlags?.fatigue ?? standing.healthFlags.fatigue,
      },
      reputation: standing.reputation,
      authority: standing.authority,
    },
    palace: { ...s.palace, occupants: placeOccupants(s) },
  };
}

function liftPause(s: GameState): GameState {
  if (!s.world?.paused) return s;
  return haltReason(s) ? s : setPaused(s, null);
}

function spend(s: GameState, amount: number, noteKey: string): GameState {
  return {
    ...s,
    treasury: Math.round(s.treasury - amount),
    ledger: [{ id: nid("led"), year: s.year, kind: amount >= 0 ? "gider" : "gelir", amount: -amount, noteKey }, ...s.ledger].slice(0, 80),
  };
}

function aiTick(s: GameState, rng: () => number): GameState {
  const next = tickAiDiplomacy(s, rng);
  return tickRivalRealms(next, rng);
}

function deathCheck(s: GameState, rng: () => number): GameState {
  const age = s.year - s.ruler.birthYear;
  let health = s.ruler.health - (age > 50 ? 3 : 1) - (rng() > 0.92 ? 12 : 0);
  health = clamp(health, 1, 100);
  const deathChance = age < 45 ? 0.02 : age < 55 ? 0.06 : age < 65 ? 0.14 : 0.28;
  const dies = health <= 8 || rng() < deathChance * (1.2 - health / 120);
  if (!dies) {
    const fatigue = clamp((s.ruler.healthFlags?.fatigue ?? 20) + (age > 50 ? 3 : 1), 0, 100);
    return {
      ...s,
      ruler: {
        ...s.ruler,
        health,
        healthFlags: { ...s.ruler.healthFlags, vigor: health, fatigue },
      },
    };
  }

  let next = beginInterregnum(s);
  return next;
}

function confirmSuccession(s: GameState): GameState {
  const next = confirmEnthronement(s);
  const logged = pushDecision(next, { kind: "succession", titleKey: "log.succession.title", room: "taht" });
  return syncPalace(logged);
}

function raise(s: GameState, kind: TroopKind, count: number): GameState {
  const n = Math.min(2500, Math.max(0, Math.round(count)));
  const cost = TROOP_COST[kind] * n;
  if (!Number.isFinite(n) || s.treasury < cost || n <= 0) return s;
  const next = spend(s, cost, "ledger.raise");
  return { ...next, army: { ...next.army, [kind]: next.army[kind] + n } };
}

function disband(s: GameState, kind: TroopKind, count: number): GameState {
  const have = s.army[kind];
  const n = Math.min(count, have);
  if (n <= 0) return s;
  return { ...s, army: { ...s.army, [kind]: have - n, morale: clamp(s.army.morale - 1, 10, 100) } };
}

function visitRoom(s: GameState, room: GameState["palace"]["currentRoom"]): GameState {
  const clothing = regaliaForRoom(room);
  let fatigue = s.ruler.healthFlags.fatigue;
  if (room === "hasoda" || room === "bahce") fatigue = clamp(fatigue - 6, 0, 100);
  if (room === "askeri" || room === "divan") fatigue = clamp(fatigue + 1, 0, 100);
  const next: GameState = {
    ...s,
    ruler: {
      ...s.ruler,
      clothing,
      healthFlags: { ...s.ruler.healthFlags, fatigue },
    },
    palace: { ...s.palace, currentRoom: room },
  };
  return syncPalace(next);
}

function holdAudience(s: GameState, characterId: string, topic: AudienceTopic): GameState {
  const delta = topic === "dilek" ? 6 : topic === "sir" ? 4 : topic === "nasihat" ? 3 : 2;
  const courtTies = (s.courtTies ?? []).map((t) =>
    t.targetId === characterId
      ? { ...t, affinity: clamp(t.affinity + delta, 0, 100), trust: clamp(t.trust + (topic === "sir" ? 5 : 2), 0, 100), lastMetYear: s.year }
      : t,
  );
  const has = courtTies.some((t) => t.targetId === characterId);
  const filled = has
    ? courtTies
    : [...courtTies, { targetId: characterId, kind: "npc" as const, affinity: 50 + delta, trust: 50, lastMetYear: s.year }];
  let next: GameState = {
    ...s,
    courtTies: filled,
    prestige: clamp(s.prestige + 1, 0, 100),
    npcs: s.npcs.map((n) => n.id === characterId ? { ...n, favor: clamp(n.favor + delta, 0, 100), loyalty: clamp(n.loyalty + Math.round(delta / 2), 0, 100) } : n),
  };
  const member = s.members.find((m) => m.id === characterId);
  if (member && member.role === "valide") {
    next = {
      ...next,
      members: next.members.map((m) => m.id === member.id ? { ...m, influence: clamp(m.influence + 3, 0, 100) } : m),
    };
  }
  if (topic === "dilek" && s.treasury >= 200) next = spend(next, 200, "ledger.coronation_gift");
  next = pushDecision(next, { kind: "audience", titleKey: "audience.met", choiceId: topic });
  const npc = s.npcs.find((n) => n.id === characterId);
  const name = npc?.name ?? member?.givenName ?? s.ruler.givenName;
  return pushLog(syncPalace(next), notice(s, "saray", "log.audience.title", "log.audience.body", { name, topic }));
}

function payCampaign(s: GameState, cost: number): GameState {
  if (cost <= 0) return s;
  if (s.treasury >= cost) return spend(s, cost, "ledger.campaign");
  const shortfall = cost - Math.max(0, s.treasury);
  const borrow = Math.max(500, Math.ceil(shortfall / 100) * 100);
  let next = s;
  if (canBorrow(s, "galata", borrow)) next = openLoan(s, "galata", borrow);
  return spend(next, cost, "ledger.campaign");
}

function tickYear(s: GameState): ActionResult {
  const rng = mulberry32(s.seed + s.year * 9973 + s.tick);
  const notices: ChronicleEntry[] = [];
  let next = expireDivan({ ...s, year: s.year + 1, tick: s.tick + 1 });
  next = ensureReigns(next);
  next = ensureEconomy(next);
  next = ensureMilitary(next);
  next = ensureSiege(next);

  next = ensureDiplomacy(next);
  next = applyRoutineEdicts(next);
  next = tickEconomyYear(next, rng);
  next = tickGovernanceYear(next);
  const budget = next.economy.lastBudget;
  const income = budget?.totalIncome ?? 0;
  const upkeep = budget?.totalExpense ?? 0;

  next = tickPolitics(next, rng);
  next = ensureCourt(next, rng);
  next = tickDynastyYear(next, rng);
  next = tickMilitaryYear(next, rng);
  next = aiTick(next, rng);
  next = deathCheck(next, rng);
  next = syncPalace(next);
  next = tickCrisisYear(next, rng);

  if (!next.succession) {
    const spawned = spawnYearEvents(next, rng);
    next = { ...next, pendingEvents: [...next.pendingEvents, ...spawned] };
  }

  const yearLog = notice(next, "yil", "log.year.title", "log.year.body", { year: next.year, income, upkeep });
  next = pushLog(next, yearLog);
  notices.push(yearLog);
  return { state: next, notices };
}

export function ownedProvinces(s: GameState) {
  return s.provinces.filter((p) => p.ownerId === s.realm.id);
}

export function neighborTargets(s: GameState) {
  const from = s.army?.provinceId || s.realm.capitalId;
  const reach = reachableIds(s.provinces, from);
  return s.provinces.filter((p) => reach.has(p.id) && p.id !== from);
}

export function yearlyForecast(s: GameState) {
  const budget = computeBudget(s);
  const here = s.provinces.find((p) => p.id === s.army.provinceId) ?? s.provinces[0];
  const terrain = here ? terrainOf(here) : "plain";
  const weather = here ? weatherOf(s.year, here) : "fair";
  const { power } = hostPower(s, s.army, {
    terrain,
    weather,
    tactic: s.military?.liveOrders ?? "center",
    siege: s.army.status === "siege",
    naval: s.campaign?.phase === "naval",
  });
  return {
    income: budget.totalIncome,
    upkeep: budget.totalExpense,
    net: budget.net,
    power: Math.round(power),
    budget,
    debt: totalDebt(s),
    campaignCost: campaignCost(s),
  };
}

function applyActionInner(state: GameState, action: GameAction): ActionResult {
  state = migrateState(state);
  state = ensureDiplomacy(state);
  state = ensureWorldClock(state);
  state = ensureWardrobe(state);
  if (state.succession && action.type !== "CONFIRM_SUCCESSION" && action.type !== "BACK_PRETENDER" && action.type !== "EQUIP_COSMETIC") {
    return { state, notices: [] };
  }
  if (state.harem?.scene && action.type !== "ADVANCE_SCENE" && action.type !== "SKIP_SCENE" && action.type !== "CONFIRM_SUCCESSION" && action.type !== "EQUIP_COSMETIC") {
    return { state, notices: [] };
  }
  if (
    state.siege?.cinema &&
    action.type !== "ADVANCE_SIEGE_CINEMA" &&
    action.type !== "SKIP_SIEGE_CINEMA" &&
    action.type !== "MARK_CINEMATIC" &&
    action.type !== "EQUIP_COSMETIC"
  ) {
    return { state, notices: [] };
  }
  if (
    state.military?.pendingDuel &&
    action.type !== "SET_TACTIC" &&
    action.type !== "RESOLVE_DUEL" &&
    action.type !== "START_DUEL" &&
    action.type !== "MARK_CINEMATIC" &&
    action.type !== "EQUIP_COSMETIC"
  ) {
    return { state, notices: [] };
  }
  switch (action.type) {
    case "ADVANCE_YEAR": {
      if (state.pendingEvents.length) return { state, notices: [] };
      const ticked = tickYear(state);
      return { state: bumpSim(ticked.state, 1), notices: ticked.notices };
    }
    case "RESOLVE_EVENT": {
      const ev = state.pendingEvents.find((e) => e.id === action.eventId);
      const def = ev ? eventByKey(ev.key) : undefined;
      const choice = def?.choices.find((c) => c.id === action.choiceId);
      if (!ev || !def || !choice) return { state, notices: [] };
      const rng = mulberry32(state.seed + state.year + ev.id.length * 13);
      let next = choice.apply(state, rng);
      next = { ...next, pendingEvents: next.pendingEvents.filter((e) => e.id !== ev.id) };
      const crisis = crisisByKey(ev.key);
      if (crisis) next = recordCrisis(next, crisis.kind, ev.key, choice.id);
      next = pushDecision(next, { kind: def.key, titleKey: def.titleKey, choiceId: choice.id });
      return { state: liftPause(syncPalace(next)), notices: next.chronicle.slice(0, 1) };
    }
    case "APPOINT": {
      const res = appointToPost(state, action);
      return { state: syncPalace(pushDecision(res.state, { kind: "appoint", titleKey: "log.appoint.title", choiceId: action.office, room: "divan" })), notices: res.notices };
    }
    case "DISMISS": {
      const res = dismissPost(state, action.postId);
      return { state: syncPalace(pushDecision(res.state, { kind: "dismiss", titleKey: "log.dismiss.title", room: "divan" })), notices: res.notices };
    }
    case "SET_TAX": {
      const rate = clamp(action.rate, 0.04, 0.24);
      const band = bandFromRate(rate);
      const g = ensureGovernance(state);
      return { state: { ...g, taxRate: rate, governance: { ...g.governance, taxBand: band } }, notices: [] };
    }
    case "SET_TARIFF": {
      return { state: setTariff(state, action.rate), notices: [] };
    }
    case "BORROW": {
      if (!canBorrow(state, action.holder, action.amount)) return { state, notices: [] };
      const next = openLoan(state, action.holder, action.amount);
      const logged = pushLog(next, notice(state, "hazine", "log.loan.title", "log.loan.body", { holder: action.holder, amount: action.amount }));
      return { state: pushDecision(logged, { kind: "borrow", titleKey: "log.loan.title", choiceId: action.holder, room: "hazine" }), notices: logged.chronicle.slice(0, 1) };
    }
    case "REPAY": {
      const before = totalDebt(state);
      const next = repayLoan(state, action.loanId, action.amount);
      if (totalDebt(next) === before) return { state, notices: [] };
      return { state: next, notices: [] };
    }
    case "GRAIN_RELIEF": {
      const next = applyGrainRelief(state, action.amount);
      if (next.treasury === state.treasury) return { state, notices: [] };
      const logged = pushLog(next, notice(state, "hazine", "log.relief.title", "log.relief.body", { amount: action.amount }));
      return { state: pushDecision(logged, { kind: "relief", titleKey: "log.relief.title", room: "hazine" }), notices: logged.chronicle.slice(0, 1) };
    }
    case "RAISE_TROOPS":
      return { state: raise(state, action.kind, action.count), notices: [] };
    case "DISBAND":
      return { state: disband(state, action.kind, action.count), notices: [] };
    case "LAUNCH_CAMPAIGN": {
      if (state.army.status === "campaign" || state.army.status === "siege") return { state, notices: [] };
      const launched = launchCampaign(state, action.provinceId);
      if (!launched) return { state, notices: [] };
      const cost = campaignCost(state);
      const paid = payCampaign(launched, cost);
      const next: GameState = {
        ...paid,
        prestige: clamp(paid.prestige + 2, 0, 100),
      };
      const target = next.provinces.find((p) => p.id === action.provinceId);
      const logged = pushLog(next, notice(state, "sefer", "log.march.title", "log.march.body", { prov: target?.nameKey ?? "" }));
      return { state: pushDecision(logged, { kind: "march", titleKey: "log.march.title", room: "askeri" }), notices: logged.chronicle.slice(0, 1) };
    }
    case "RECALL_ARMY": {
      if (!state.campaign) return { state, notices: [] };
      const rng = mulberry32(state.seed + state.year * 19 + state.tick);
      return { state: retreatHost(state, rng, false), notices: [] };
    }
    case "SET_COMMANDER": {
      const next = setCommander(state, action.npcId, action.memberId);
      return { state: next, notices: [] };
    }
    case "SET_DOCTRINE": {
      return { state: setDoctrine(state, action.doctrine), notices: [] };
    }
    case "SET_TACTIC": {
      return { state: setLiveTactic(state, action.tactic), notices: [] };
    }
    case "DRILL_HOST": {
      const next = drillHost(state);
      if (next.treasury === state.treasury) return { state, notices: [] };
      return { state: next, notices: [] };
    }
    case "PAY_ULUFE": {
      const next = payUlufe(state);
      if (next.treasury === state.treasury) return { state, notices: [] };
      return { state: next, notices: [] };
    }
    case "STORM_FORT": {
      const rng = mulberry32(state.seed + state.year * 23 + state.tick + 7);
      const next = stormFort(state, rng);
      return { state: next, notices: next.chronicle.slice(0, 1) };
    }
    case "SIEGE_ACTION": {
      const rng = mulberry32(state.seed + state.year * 23 + state.tick + action.action.length * 11);
      const next = resolveSiegeAction(state, action.action, rng);
      return { state: next, notices: next.chronicle.slice(0, 1) };
    }
    case "ADVANCE_SIEGE_CINEMA":
      return { state: advanceSiegeCinema(state), notices: [] };
    case "SKIP_SIEGE_CINEMA":
      return { state: dismissSiegeCinema(state), notices: [] };
    case "OFFER_PEACE": {
      const next = offerPeace(state, action.realmId);
      return { state: next, notices: next.chronicle.slice(0, 1) };
    }
    case "START_DUEL": {
      const next = startDuel(state, action);
      return { state: next, notices: [] };
    }
    case "RESOLVE_DUEL": {
      const rng = mulberry32(state.military.pendingDuel?.seed ?? state.seed + state.year);
      const next = resolveDuel(state, action.tactic, action.foeTactic, rng);
      return { state: next, notices: next.chronicle.slice(0, 1) };
    }
    case "GIFT": {
      if (state.treasury < action.amount || action.amount < 100) return { state, notices: [] };
      const next = spend(state, action.amount, "ledger.gift");
      const rel = next.relations.map((r) => r.realmId === action.realmId ? { ...r, value: clamp(r.value + Math.round(action.amount / 80), -100, 100) } : r);
      return { state: { ...next, relations: rel }, notices: [] };
    }
    case "TREATY": {
      if (!localTreatyAllowed(state, action.realmId, action.treaty)) return { state, notices: [] };
      const prev = state.relations.find((r) => r.realmId === action.realmId);
      const broke = prev?.treaty === "alliance" && action.treaty === "war";
      const base = ensureGovernance(state);
      const rel = state.relations.map((r) =>
        r.realmId === action.realmId
          ? {
              ...r,
              treaty: action.treaty,
              tradePact: action.treaty === "war" ? false : r.tradePact,
              value: action.treaty === "alliance" ? clamp(r.value + 12, -100, 100) : action.treaty === "war" ? clamp(r.value - 20, -100, 100) : r.value,
            }
          : r,
      );
      const stamped = broke
        ? { ...base, relations: rel, prestige: clamp(base.prestige - 8, 0, 100), governance: { ...base.governance, brokenPacts: base.governance.brokenPacts + 1 } }
        : { ...base, relations: rel };
      const logged = pushLog(stamped, notice(state, "diplomasi", "log.treaty.title", "log.treaty.body", { treaty: action.treaty, realm: action.realmId }));
      return { state: pushDecision(logged, { kind: "treaty", titleKey: "log.treaty.title", choiceId: action.treaty, room: "elci" }), notices: logged.chronicle.slice(0, 1) };
    }
    case "SET_TRADE_PACT": {
      if (isPlayerHeld(state, action.realmId)) return { state, notices: [] };
      return { state: setRelation(state, action.realmId, { tradePact: action.on, valueDelta: action.on ? 4 : -2 }), notices: [] };
    }
    case "SET_COALITION": {
      if (isPlayerHeld(state, action.realmId)) return { state, notices: [] };
      return { state: setRelation(state, action.realmId, { coalitionAgainst: action.against, treaty: action.against ? "alliance" : undefined }), notices: [] };
    }
    case "DIP_OFFER": {
      const check = validateOffer(state, action.realmId, action.kind, action.terms);
      if (!check.ok) return { state, notices: [] };
      const terms = clampTerms(check.terms);
      const from = state.diplomacy.seatId;
      const to = action.realmId;
      const held = isPlayerHeld(state, to);
      if (action.kind === "war" || action.kind === "envoy" || !held) {
        const rng = mulberry32(state.seed + state.year * 31 + to.length * 17 + action.kind.length);
        const accepted = action.kind === "war" || action.kind === "envoy" || aiAcceptsOffer(state, to, action.kind, terms, rng);
        const next = applyOfferResult(state, action.kind, from, to, terms, accepted);
        return { state: pushDecision(next, { kind: "dip", titleKey: "log.offer_sent.title", choiceId: action.kind, room: "elci" }), notices: next.chronicle.slice(0, 1) };
      }
      const offer = {
        id: nid("off"),
        fromSeat: from,
        toSeat: to,
        kind: action.kind as DipKind,
        terms,
        status: "pending" as const,
        year: state.year,
        fromRuler: state.ruler.givenName,
        fromRealm: state.realm.name,
      };
      const next = queueOutgoingOffer(state, offer);
      return { state: pushDecision(next, { kind: "dip", titleKey: "log.offer_sent.title", choiceId: action.kind, room: "elci" }), notices: next.chronicle.slice(0, 1) };
    }
    case "DIP_RESPOND": {
      const next = resolveQueuedOffer(state, action.offerId, action.accept);
      return { state: liftPause(next), notices: next.chronicle.slice(0, 1) };
    }
    case "DIP_WITHDRAW": {
      const offer = state.diplomacy.pending.find((o) => o.id === action.offerId && o.fromSeat === state.diplomacy.seatId);
      if (!offer) return { state, notices: [] };
      return { state: dropOffer(state, action.offerId), notices: [] };
    }
    case "EDUCATE": {
      const members = state.members.map((m) => m.id === action.memberId ? { ...m, education: action.track, stats: { ...m.stats, [action.track === "seyfiye" ? "cesaret" : action.track === "ilmiye" ? "ilim" : "siyaset"]: clamp((action.track === "seyfiye" ? m.stats.cesaret : action.track === "ilmiye" ? m.stats.ilim : m.stats.siyaset) + 2, 1, 20) } } : m);
      return { state: { ...state, members }, notices: [] };
    }
    case "SANJAK": {
      const member = state.members.find((m) => m.id === action.memberId);
      if (!member || !isAdult(member, state.year)) return { state, notices: [] };
      const owned = ownedProvinces(state).some((p) => p.id === action.provinceId);
      if (!owned) return { state, notices: [] };
      const members = state.members.map((m) =>
        m.id === action.memberId
          ? { ...m, location: action.provinceId, statecraft: clamp(m.statecraft + 3, 0, 100), influence: clamp(m.influence + 4, 0, 100) }
          : m,
      );
      return { state: { ...state, members, stability: clamp(state.stability + 2, 0, 100) }, notices: [] };
    }
    case "GARRISON": {
      const next = garrisonProvince(state, action.provinceId);
      if (!next) return { state, notices: [] };
      return { state: pushDecision(next, { kind: "garrison", titleKey: "log.garrison.title", room: "askeri" }), notices: next.chronicle.slice(0, 1) };
    }
    case "INVEST_PROVINCE": {
      const next = investProvince(state, action.provinceId);
      if (!next) return { state, notices: [] };
      return { state: pushDecision(next, { kind: "invest", titleKey: "log.invest.title", room: "hazine" }), notices: next.chronicle.slice(0, 1) };
    }
    case "SOOTHE_PROVINCE": {
      const next = sootheProvince(state, action.provinceId);
      if (!next) return { state, notices: [] };
      return { state: next, notices: [] };
    }
    case "SET_TAX_BAND": {
      const next = setTaxBand(state, action.band);
      return { state: next, notices: next.chronicle.slice(0, 1) };
    }
    case "INVEST_KIND": {
      const next = investKind(state, action.provinceId, action.kind);
      if (!next) return { state, notices: [] };
      return { state: next, notices: next.chronicle.slice(0, 1) };
    }
    case "SUPPRESS_REVOLT": {
      const next = suppressRevolt(state, action.provinceId);
      if (!next) return { state, notices: [] };
      return { state: next, notices: next.chronicle.slice(0, 1) };
    }
    case "REFORM": {
      const next = enactReform(state, action.reform);
      if (!next) return { state, notices: [] };
      return { state: next, notices: next.chronicle.slice(0, 1) };
    }
    case "SPY_REALM": {
      const rng = mulberry32(state.seed + state.year * 41 + action.realmId.length * 13);
      const next = spyRealm(state, action.realmId, rng);
      if (!next) return { state, notices: [] };
      return { state: next, notices: next.chronicle.slice(0, 1) };
    }
    case "PEACE_TERMS": {
      const next = proposePeace(state, action.realmId, action.demand, action.provinceId);
      if (!next) return { state, notices: [] };
      return { state: next, notices: next.chronicle.slice(0, 1) };
    }
    case "SET_DIFFICULTY": {
      const g = ensureGovernance(state);
      return { state: { ...g, governance: { ...g.governance, difficulty: action.difficulty } }, notices: [] };
    }
    case "SET_SPEED": {
      const g = ensureGovernance(state);
      const speed = action.speed;
      const ms = speed === "hizli" ? Math.round(MS_PER_YEAR / 2) : MS_PER_YEAR;
      const paused = speed === "dur";
      return {
        state: {
          ...g,
          governance: { ...g.governance, speed },
          world: {
            ...g.world,
            msPerYear: ms,
            paused,
            pauseReason: paused ? "speed" : g.world.pauseReason === "speed" ? null : g.world.pauseReason,
            lastSimAt: Date.now(),
          },
        },
        notices: [],
      };
    }
    case "SET_IRONMAN": {
      const g = ensureGovernance(state);
      if (g.governance.ironman && !action.on) return { state, notices: [] };
      if (action.on && (g.year !== START_YEAR || g.governance.conquests > 0)) return { state, notices: [] };
      return { state: { ...g, governance: { ...g.governance, ironman: action.on } }, notices: [] };
    }
    case "TUTORIAL_STEP": {
      const g = ensureGovernance(state);
      const step = clamp(Math.round(action.step), 0, 10);
      return { state: { ...g, governance: { ...g.governance, tutorialStep: step } }, notices: [] };
    }
    case "BUILD": {
      const cost = BUILDING_COST[action.building];
      if (state.treasury < cost) return { state, notices: [] };
      const next = spend(state, cost, "ledger.build");
      const buildings = { ...next.buildings, [action.building]: next.buildings[action.building] + 1 };
      let piety = next.piety;
      let prestige = next.prestige;
      let provinces = next.provinces;
      if (action.building === "cami" || action.building === "medrese") piety = clamp(piety + 8, 0, 100);
      if (action.building === "hisar" || action.building === "tersane") prestige = clamp(prestige + 4, 0, 100);
      if (action.building === "kervansaray") {
        provinces = provinces.map((p) => p.ownerId === next.realm.id ? { ...p, trade: clamp(p.trade + 4, 8, 100) } : p);
      }
      if (action.building === "hisar") {
        provinces = provinces.map((p) => p.ownerId === next.realm.id ? { ...p, unrest: clamp(p.unrest - 3, 0, 100) } : p);
      }
      const logged = pushLog({ ...next, buildings, piety, prestige, provinces }, notice(state, "imar", "log.build.title", "log.build.body", { building: action.building }));
      return { state: logged, notices: logged.chronicle.slice(0, 1) };
    }
    case "HOLD_DIVAN": {
      const res = holdDivan(state);
      return { state: syncPalace(pushDecision(res.state, { kind: "divan", titleKey: "log.divan.title", room: "divan" })), notices: res.notices };
    }
    case "RESOLVE_DIVAN": {
      const res = resolveDivanItem(state, action.itemId, action.choiceId);
      return { state: syncPalace(pushDecision(res.state, { kind: "divan_item", titleKey: "log.divan.title", choiceId: action.choiceId, room: "divan" })), notices: res.notices };
    }
    case "CLOSE_DIVAN": {
      const res = closeDivan(state);
      return { state: syncPalace(res.state), notices: res.notices };
    }
    case "BACK_PRETENDER":
      return { state: backPretender(state, action.memberId), notices: [] };
    case "CONFIRM_SUCCESSION": {
      const next = confirmSuccession(state);
      return { state: liftPause(next), notices: next.chronicle.slice(0, 1) };
    }
    case "VISIT_ROOM":
      return { state: visitRoom(state, action.room), notices: [] };
    case "AUDIENCE": {
      const next = holdAudience(state, action.characterId, action.topic);
      return { state: next, notices: next.chronicle.slice(0, 1) };
    }
    case "MARK_CINEMATIC": {
      if (state.palace.seenCinematics.includes(action.id)) return { state, notices: [] };
      return {
        state: { ...state, palace: { ...state.palace, seenCinematics: [...state.palace.seenCinematics, action.id] } },
        notices: [],
      };
    }
    case "HAREM_ACT": {
      if (!canRomance(state, action.partnerId)) return { state, notices: [] };
      let next = applyBondAction(state, action.partnerId, action.act);
      const partner = next.members.find((m) => m.id === action.partnerId);
      if (actionOpensScene(action.act)) next = startScene(next, action.partnerId, action.act);
      next = pushDecision(next, { kind: "harem", titleKey: `harem.act.${action.act}`, choiceId: action.act, room: "harem" });
      const logged = pushLog(syncPalace(next), notice(state, "harem", `log.harem.${action.act}.title`, `log.harem.${action.act}.body`, { name: partner?.givenName ?? "" }));
      return { state: logged, notices: logged.chronicle.slice(0, 1) };
    }
    case "ADVANCE_SCENE": {
      const res = advanceScene(state);
      return { state: res.state, notices: [] };
    }
    case "SKIP_SCENE": {
      return { state: skipScene(state), notices: [] };
    }
    case "FAVOR_CONSORT": {
      const next = setFavorite(state, action.memberId);
      const name = next.members.find((m) => m.id === action.memberId)?.givenName ?? "";
      const logged = pushLog(syncPalace(next), notice(state, "harem", "log.harem.favor.title", "log.harem.favor.body", { name }));
      return { state: pushDecision(logged, { kind: "favor", titleKey: "log.harem.favor.title", room: "harem" }), notices: logged.chronicle.slice(0, 1) };
    }
    case "INTRODUCE_CONSORT": {
      const rng = mulberry32(state.seed + state.year * 17 + state.tick);
      const next = introduceConsort(state, rng);
      return { state: syncPalace(next), notices: next.chronicle.slice(0, 1) };
    }
    case "DRILL_PRINCE": {
      const next = drillPrince(state, action.memberId);
      return { state: next, notices: [] };
    }
    case "CULTIVATE": {
      const next = cultivatePrince(state, action.memberId, action.npcId);
      return { state: next, notices: [] };
    }
    case "SET_EDICTS": {
      const next = patchEdicts(state, action.edicts);
      const logged = pushDecision(next, { kind: "edict", titleKey: "nizam.saved", room: "divan" });
      return { state: logged, notices: [] };
    }
    case "COMMISSION_WORK": {
      if (state.world.edicts.offensive === "never" && action.building === "tersane") {
        /* still allowed — yards are not a war declaration */
      }
      const next = commissionWork(state, action.building);
      if (next.treasury === state.treasury) return { state, notices: [] };
      const logged = pushLog(next, notice(state, "imar", "log.work.start.title", "log.work.start.body", { building: action.building }));
      return { state: pushDecision(logged, { kind: "work", titleKey: "log.work.start.title", room: "hazine" }), notices: logged.chronicle.slice(0, 1) };
    }
    case "MARK_NOTICE":
      return { state: markNoticeRead(state, action.id), notices: [] };
    case "MARK_NOTICES_READ":
      return { state: markAllNoticesRead(state), notices: [] };
    case "EQUIP_COSMETIC": {
      if (!isCosmeticSlot(action.slot)) return { state, notices: [] };
      const next = equipWardrobe(state, action.slot, action.itemId);
      if (next === state) return { state, notices: [] };
      return {
        state: pushDecision(next, { kind: "wardrobe", titleKey: "shop.equipped", room: "taht" }),
        notices: [],
      };
    }
    default:
      return { state, notices: [] };
  }
}

export function applyAction(state: GameState, action: GameAction): ActionResult {
  const result = applyActionInner(state, action);
  return { notices: result.notices, state: syncHistory(result.state, action.type) };
}

export function buildingLabel(b: Building): string {
  return b;
}
