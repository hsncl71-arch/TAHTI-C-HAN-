import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction, yearlyForecast } from "../world/engine.ts";
import { rebaseCampaignSeat } from "../world/seed.ts";
import { migrateState } from "../palace/migrate.ts";
import { inspectIdentity, sameSovereign } from "../palace/consistency.ts";
import { identitySrc, sovereignArchetype } from "../palace/identity.ts";
import { canRomance } from "../dynasty/bonds.ts";
import { isChild, isAdult, ADULT_AGE } from "../dynasty/age.ts";
import { generationCount } from "../dynasty/reigns.ts";
import { buildTree } from "../dynasty/tree.ts";
import { computeBudget, totalDebt, campaignCost } from "../economy/budget.ts";
import { computePeople } from "../economy/tick.ts";
import { hostPower, resolveBattle } from "../military/combat.ts";
import { fillArmy } from "../military/model.ts";
import { applyOfferResult } from "../diplomacy/apply.ts";
import { catchUpTo } from "../worldclock/catchup.ts";
import { CANON_FACTS, canonOwnersAt } from "../history/canon.ts";
import { cannedCounsel, counselSystemPrompt } from "../npc/counsel.ts";
import { parseGameAction, MAX_RAISE } from "../security/actions.ts";
import { isOwnerEmail, OWNER_EMAIL, roleForEmail, canGrantOwner, ownerFromClientClaim } from "../security/owner.ts";
import { armySpikeIllegal, authorizeAction, treasuryDeltaIllegal, hostHeadcount } from "../security/authority.ts";
import { isNonceShape } from "../security/replay.ts";
import { assertCatalogFair } from "../commerce/fairness.ts";
import { BUNDLE_APPLE, PACKAGE_GOOGLE } from "../commerce/catalog.ts";
import { STATE_VERSION, type GameState, type TacticId } from "../types.ts";
import { mulberry32 } from "../ids.ts";
import { drainModals, playYears } from "./play.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "fatih" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(user = "final-user"): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, user);
}

describe("final integration — connected systems", () => {
  it("every domain is present on a fresh reign and migrate keeps STATE_VERSION", () => {
    const s = fresh();
    assert.equal(s.version, STATE_VERSION);
    assert.ok(s.ruler.identity.archetypeId);
    assert.ok(s.palace.occupants.length);
    assert.ok(s.divan);
    assert.ok(s.harem);
    assert.ok(s.members.some((m) => m.role === "sehzade" || m.role === "hatun"));
    assert.ok(s.economy.people);
    assert.ok(s.army.janissary);
    assert.ok(s.army.navy >= 0);
    assert.ok(s.military);
    assert.ok(s.diplomacy.seatId);
    assert.ok(s.world.edicts);
    assert.ok(s.history.playerEvents.length);
    assert.ok(s.crisis);
    assert.ok(s.wardrobe);
    const migrated = migrateState({ ...s, version: 8 } as GameState);
    assert.equal(migrated.version, STATE_VERSION);
  });

  it("tickYear advances economy, army, dynasty, crisis, history and palace together", () => {
    let s = drainModals(fresh());
    const before = {
      year: s.year,
      treasury: s.treasury,
      grain: s.economy.grainReserve,
      occupants: s.palace.occupants.length,
      history: s.history.playerEvents.length,
    };
    s = playYears(s, 3);
    assert.equal(s.year, before.year + 3);
    assert.ok(s.economy.lastBudget);
    assert.ok(s.economy.people.prosperity >= 0);
    assert.ok(s.palace.occupants.length >= before.occupants - 2);
    assert.ok(s.history.lastSyncYear >= before.year);
    assert.ok(s.history.playerEvents.length >= before.history);
    const report = inspectIdentity(s);
    assert.equal(report.ok, true, report.failures.join("; "));
  });
});

describe("final integration — ruler life and 100 years", () => {
  it("a century turns without GAME OVER and hands the realm to heirs", () => {
    let s = drainModals(fresh());
    const startYear = s.year;
    const startRuler = s.ruler.id;
    const startTreasury = s.treasury;
    s = playYears(s, 100);
    assert.equal(s.year, startYear + 100);
    assert.ok(s.ruler.givenName.length > 1);
    assert.ok(s.ruler.birthYear < s.year);
    assert.ok(s.year - s.ruler.birthYear >= 14);
    assert.ok(s.reigns.length >= 1);
    assert.ok(generationCount(s) >= 1);
    const tree = buildTree(s);
    assert.ok(tree.length >= 3);
    assert.ok(s.treasury > -30_000 && s.treasury < 82_000, `treasury ${s.treasury}`);
    assert.ok(s.provinces.some((p) => p.ownerId === s.realm.id));
    assert.ok(Array.isArray(s.relations));
    if (s.ruler.id !== startRuler) {
      assert.ok(s.reigns.some((r) => r.endYear != null));
      assert.ok(s.history.playerEvents.some((e) => e.kind === "succession" || e.kind === "coronation"));
    }
    const report = inspectIdentity(s);
    assert.equal(report.ok, true, report.failures.join("; "));
    assert.ok(startTreasury !== undefined);
  });

  it("the same sovereign keeps face DNA across rooms until succession", () => {
    let s = drainModals(fresh());
    const before = s;
    for (const room of ["taht", "divan", "harem", "hazine", "hasoda", "bahce", "elci", "sehzade", "askeri"] as const) {
      s = applyAction(s, { type: "VISIT_ROOM", room }).state;
      assert.equal(sameSovereign(before, s), true);
      assert.equal(sovereignArchetype(s), "sultan-a");
      assert.ok(identitySrc(s.ruler.portrait, "idle").includes("sultan-a"));
    }
  });
});

describe("final integration — harem adult gate", () => {
  it("children never enter romance and intimate scenes stay veiled", () => {
    const s = drainModals(fresh());
    const kids = s.members.filter((m) => isChild(m, s.year));
    for (const k of kids) {
      assert.equal(canRomance(s, k.id), false, k.givenName);
    }
    const sehzade = s.members.filter((m) => m.role === "sehzade");
    for (const p of sehzade) {
      if (!isAdult(p, s.year)) assert.equal(canRomance(s, p.id), false);
    }
    const valide = s.members.find((m) => m.role === "valide");
    if (valide) assert.equal(canRomance(s, valide.id), false);
    assert.equal(ADULT_AGE >= 16, true);
  });
});

describe("final integration — alternative history", () => {
  it("canon Belgrade 1456 is not applied to the living map", () => {
    let s = drainModals(fresh());
    s = playYears(s, 8);
    assert.notEqual(canonOwnersAt(1456).belgrad, undefined);
    assert.notEqual(s.provinces.find((p) => p.id === "belgrad")?.ownerId, s.realm.id);
    const fact = CANON_FACTS.find((f) => f.id === "siege_1456_belgrad");
    assert.ok(fact);
    assert.ok(fact!.sources.length >= 1);
    const missed = s.history.divergences.some((d) => d.canonId === "siege_1456_belgrad" || d.kind === "missed");
    assert.ok(missed || s.year < 1456);
  });
});

describe("final integration — economy stress", () => {
  it("100 independent realms stay inside treasury bounds over 25 years", () => {
    const treasuries: number[] = [];
    let bankrupt = 0;
    let rich = 0;
    for (let i = 0; i < 100; i += 1) {
      let s = drainModals(createInitialState({ ...INPUT, traits: [...INPUT.traits] }, `realm-${i}`));
      if (i % 7 === 0) s = applyAction(s, { type: "SET_TAX", rate: 0.22 }).state;
      if (i % 5 === 0) s = applyAction(s, { type: "RAISE_TROOPS", kind: "janissary", count: 400 }).state;
      s = playYears(s, 25);
      const t = s.treasury;
      treasuries.push(t);
      if (t < 0) bankrupt += 1;
      if (t > 80_000) rich += 1;
      assert.ok(Number.isFinite(t));
      assert.ok(t > -40_000 && t < 82_000, `realm ${i} treasury ${t}`);
      const people = computePeople(s, s.economy.grainReserve);
      assert.ok(people.taxPressure >= 0 && people.taxPressure <= 100);
      assert.ok(s.economy.lastBudget);
    }
    const avg = treasuries.reduce((a, n) => a + n, 0) / treasuries.length;
    assert.ok(avg < 80_000, `avg ${avg}`);
    assert.ok(avg > 1_000, `avg ${avg}`);
    const sample = drainModals(fresh());
    const b = computeBudget(sample);
    assert.ok(b.totalExpense > 0);
    assert.ok(campaignCost(sample) > 0);
  });
});

describe("final integration — combat balance", () => {
  it("headcount alone does not decide hundreds of battles", () => {
    const base = drainModals(fresh());
    const rng = mulberry32(42);
    let eliteWins = 0;
    let rabbleWins = 0;
    const tactics: TacticId[] = ["center", "flank", "artillery", "cavalry_charge", "hold_line", "feint"];
    for (let i = 0; i < 240; i += 1) {
    const eliteArmy = fillArmy({
          ...base.army,
          janissary: 800,
          sipahi: 600,
          azab: 200,
          akinji: 200,
          topcu: 12,
          navy: 0,
          levend: 0,
          morale: 88,
          drill: 80,
          experience: 70,
          supply: 85,
          pay: 80,
        }, base.army.provinceId);
      const rabbleArmy = fillArmy({
          ...base.army,
          janissary: 2200,
          sipahi: 1400,
          azab: 1800,
          akinji: 400,
          topcu: 4,
          navy: 0,
          levend: 0,
          morale: 28,
          drill: 18,
          experience: 12,
          supply: 22,
          pay: 20,
        }, base.army.provinceId);
      const elite: GameState = {
        ...base,
        army: eliteArmy,
        ruler: { ...base.ruler, stats: { ...base.ruler.stats, cesaret: 16 } },
      };
      const rabble: GameState = {
        ...base,
        army: rabbleArmy,
        ruler: { ...base.ruler, stats: { ...base.ruler.stats, cesaret: 6 } },
      };
      const tactic = tactics[i % tactics.length];
      const e = resolveBattle(elite, {
        kind: "field",
        provinceId: elite.army.provinceId,
        tacticAtk: tactic,
        tacticDef: "hold_line",
        defenderFort: 2,
        defenderManpower: 1400,
        rng,
      });
      const r = resolveBattle(rabble, {
        kind: "field",
        provinceId: rabble.army.provinceId,
        tacticAtk: tactic,
        tacticDef: "hold_line",
        defenderFort: 2,
        defenderManpower: 1400,
        rng,
      });
      if (e.report.result === "win") eliteWins += 1;
      if (r.report.result === "win") rabbleWins += 1;
    }
    assert.ok(eliteWins > rabbleWins, `elite ${eliteWins} vs rabble ${rabbleWins}`);
    const hill = hostPower(base, { ...base.army, sipahi: 2000, janissary: 200 }, {
      terrain: "mountain",
      weather: "fair",
      tactic: "cavalry_charge",
    }).power;
    const inf = hostPower(base, { ...base.army, sipahi: 200, janissary: 2000 }, {
      terrain: "mountain",
      weather: "fair",
      tactic: "hold_line",
    }).power;
    assert.ok(inf > hill * 0.6);
  });
});

describe("final integration — two-player diplomacy and war", () => {
  it("alliance, trade, peace and war keep both seats in the same treaty", () => {
    const a0 = drainModals(fresh("player-a"));
    const b0 = drainModals(rebaseCampaignSeat(createInitialState({ ...INPUT, traits: [...INPUT.traits], givenName: "Marco" }, "player-b"), "venedik"));
    const terms = { tribute: 0, durationYears: 8, againstRealmId: null, note: "ahidname" };
    let a = applyOfferResult(a0, "alliance", "osmanli", "venedik", terms, true);
    let b = applyOfferResult(b0, "alliance", "osmanli", "venedik", terms, true);
    assert.equal(a.relations.find((r) => r.realmId === "venedik")?.treaty, "alliance");
    assert.equal(b.relations.find((r) => r.realmId === "osmanli")?.treaty, "alliance");
    a = applyOfferResult(a, "trade", "osmanli", "venedik", terms, true);
    b = applyOfferResult(b, "trade", "osmanli", "venedik", terms, true);
    assert.equal(a.relations.find((r) => r.realmId === "venedik")?.tradePact, true);
    assert.equal(b.relations.find((r) => r.realmId === "osmanli")?.tradePact, true);
    a = applyOfferResult(a, "war", "osmanli", "venedik", terms, true);
    b = applyOfferResult(b, "war", "osmanli", "venedik", terms, true);
    assert.equal(a.relations.find((r) => r.realmId === "venedik")?.treaty, "war");
    assert.equal(b.relations.find((r) => r.realmId === "osmanli")?.treaty, "war");
    a = applyOfferResult(a, "peace", "osmanli", "venedik", { ...terms, tribute: 400 }, true);
    b = applyOfferResult(b, "peace", "osmanli", "venedik", { ...terms, tribute: 400 }, true);
    assert.equal(a.relations.find((r) => r.realmId === "venedik")?.treaty, "peace");
    assert.equal(b.relations.find((r) => r.realmId === "osmanli")?.treaty, "peace");
    assert.ok(a.treasury < a0.treasury || b.treasury > b0.treasury);
  });

  it("server-side battle result is computed from hosts, not the client", () => {
    const s = drainModals(fresh());
    const before = hostHeadcount(s);
    const res = resolveBattle(s, {
      kind: "field",
      provinceId: s.army.provinceId,
      tacticAtk: "center",
      tacticDef: "flank",
      defenderFort: 3,
      defenderManpower: 900,
      rng: mulberry32(7),
    });
    assert.ok(res.report.atkPower > 0);
    assert.ok(res.report.defPower > 0);
    assert.ok(["win", "loss", "stalemate", "retreat"].includes(res.report.result));
    const withDuel = {
      ...s,
      military: {
        ...s.military,
        pendingDuel: {
          id: "duel_test",
          peerId: "player-b",
          peerName: "Marco",
          provinceId: s.army.provinceId,
          phase: "live" as const,
          selfTactic: "flank" as const,
          foeTactic: "center" as const,
          seed: 1,
          host: true,
        },
      },
    };
    const authorized = authorizeAction(withDuel, { type: "RESOLVE_DUEL", tactic: "flank", foeTactic: "center" }, { now: Date.now(), peerTactic: "hold_line" });
    assert.equal(authorized.type, "RESOLVE_DUEL");
    if (authorized.type === "RESOLVE_DUEL") assert.equal(authorized.foeTactic, "hold_line");
    assert.equal(armySpikeIllegal(before, before + 5000, { type: "GIFT", realmId: "venedik", amount: 100 }), true);
  });
});

describe("final integration — persistent world", () => {
  it("catch-up advances or honestly halts without handing the realm to an LLM", () => {
    let s = drainModals(fresh());
    s = {
      ...s,
      world: {
        ...s.world,
        lastSimAt: Date.now() - s.world.msPerYear * 4,
        edicts: {
          ...s.world.edicts,
          onAttack: "defend_walls",
          offensive: "never",
          peace: "refuse",
          famine: "relief",
          ulufe: "pay",
          debt: "no_borrow",
          tax: "hold",
          trade: "refuse",
          warOffer: "refuse",
          works: "none",
        },
      },
    };
    const start = s.year;
    const res = catchUpTo(s, Date.now());
    assert.ok(res.years >= 0);
    assert.ok(res.state.year >= start);
    if (res.halted) assert.ok(res.reason);
    else assert.ok(res.years >= 1);
    assert.ok(res.state.economy);
    assert.ok(res.state.world);
  });
});

describe("final integration — AI NPC and cost", () => {
  it("canned counsel reads live treasury and never invents a combat result", () => {
    const s = drainModals(fresh());
    const text = cannedCounsel(s, "sadrazam", "tr");
    assert.ok(text.includes(String(Math.round(s.treasury))));
    assert.match(text, /Hünkârım|hazine|Divan/i);
    const prompt = counselSystemPrompt(s, "defterdar", "tr");
    assert.match(prompt, /do not invent treasury, army or treaty numbers/i);
    const kaptan = cannedCounsel(s, "kaptan", "tr");
    assert.ok(kaptan.includes(String(s.army.navy)));
  });
});

describe("final integration — owner, security, store ids", () => {
  it("OWNER mailbox is locked and cheats are rejected", () => {
    assert.equal(isOwnerEmail(OWNER_EMAIL), true);
    assert.equal(roleForEmail("spy@example.com"), "player");
    assert.equal(canGrantOwner(OWNER_EMAIL, "spy@example.com"), false);
    assert.throws(() => ownerFromClientClaim(true));
    assert.throws(() => parseGameAction({ type: "SET_GOLD", amount: 9e9 }));
    const raise = parseGameAction({ type: "RAISE_TROOPS", kind: "janissary", count: 9e9 });
    assert.equal(raise.type, "RAISE_TROOPS");
    if (raise.type === "RAISE_TROOPS") assert.equal(raise.count, MAX_RAISE);
    const s = fresh();
    assert.equal(treasuryDeltaIllegal(s.treasury, s.treasury + 50_000, { type: "GIFT", realmId: "venedik", amount: 100 }), true);
    assert.equal(isNonceShape("abc"), false);
    assert.equal(isNonceShape("nonce_12345678"), true);
    assertCatalogFair();
    assert.equal(BUNDLE_APPLE, "com.tahticihan.app");
    assert.equal(PACKAGE_GOOGLE, "com.tahticihan.app");
  });
});

describe("final integration — new player loop", () => {
  it("coronation → divan → tax → troops → diplomacy → year → succession path stays playable", () => {
    let s = fresh();
    assert.ok(s.pendingEvents.some((e) => e.key === "tahta_cikis"));
    s = drainModals(s);
    s = applyAction(s, { type: "HOLD_DIVAN" }).state;
    s = applyAction(s, { type: "SET_TAX", rate: 0.11 }).state;
    s = applyAction(s, { type: "RAISE_TROOPS", kind: "sipahi", count: 80 }).state;
    s = applyAction(s, { type: "DIP_OFFER", realmId: "karaman", kind: "envoy", terms: { tribute: 0, durationYears: 5, againstRealmId: null, note: "selam" } }).state;
    s = applyAction(s, { type: "SET_DOCTRINE", doctrine: "hold" }).state;
    s = playYears(s, 5);
    const f = yearlyForecast(s);
    assert.ok(Number.isFinite(f.net));
    assert.ok(totalDebt(s) >= 0);
    assert.equal(s.succession, null);
    assert.ok(s.ruler.health > 0);
  });
});

describe("final integration — save/load and works", () => {
  it("round-trips JSON mid-century without losing identity or treasury", () => {
    let s = drainModals(fresh());
    s = playYears(s, 40);
    const snap = JSON.parse(JSON.stringify(s)) as GameState;
    let loaded = migrateState(snap);
    assert.equal(loaded.year, s.year);
    assert.equal(loaded.treasury, s.treasury);
    assert.equal(loaded.ruler.id, s.ruler.id);
    assert.equal(loaded.ruler.identity.archetypeId, s.ruler.identity.archetypeId);
    assert.equal(loaded.ruler.identity.face.marks, s.ruler.identity.face.marks);
    loaded = playYears(loaded, 5);
    assert.equal(loaded.year, s.year + 5);
    assert.ok(Number.isFinite(loaded.treasury));
    assert.equal(inspectIdentity(loaded).ok, true, inspectIdentity(loaded).failures.join("; "));
  });

  it("ADVANCE_YEAR completes due works the same way catch-up does", () => {
    let s = drainModals(fresh());
    s = applyAction(s, { type: "COMMISSION_WORK", building: "kervansaray" }).state;
    const before = s.buildings.kervansaray;
    s = playYears(s, 2);
    assert.ok(s.buildings.kervansaray >= before + 1);
  });
});
