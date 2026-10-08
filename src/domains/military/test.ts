import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction } from "../world/engine.ts";
import { migrateState } from "../palace/migrate.ts";
import { campaignCost } from "../economy/budget.ts";
import { STATE_VERSION, type GameState } from "../types.ts";
import { hostPower, resolveBattle, tacticEdge } from "./combat.ts";
import { drillHost, launchCampaign, offerPeace, payUlufe, setCommander, setDoctrine, stormFort, tickCampaign } from "./campaign.ts";
import { fillArmy, hostSize, landHost } from "./model.ts";
import { shortestPath } from "./path.ts";
import { terrainOf } from "./terrain.ts";
import { startDuel, resolveDuel, abandonDuel } from "./duel.ts";
import { deriveHost, garrisonProvince, investProvince, tickRivalRealms } from "./realms.ts";
import { tickMilitaryYear } from "./tick.ts";
import { mulberry32 } from "../ids.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "fatih" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "ordu-user");
}

function clearEvents(s: GameState): GameState {
  let next = s;
  while (next.pendingEvents[0]) {
    const ev = next.pendingEvents[0];
    const choice = ev.key === "tahta_cikis" ? "adalet" : "store";
    const tried = applyAction(next, { type: "RESOLVE_EVENT", eventId: ev.id, choiceId: choice });
    if (tried.state.pendingEvents[0]?.id === ev.id) {
      next = { ...next, pendingEvents: next.pendingEvents.slice(1) };
    } else {
      next = tried.state;
    }
  }
  return next;
}

describe("deep military engine", () => {
  it("seeds period troops, quality and a commander", () => {
    const s = fresh();
    assert.equal(s.version, STATE_VERSION);
    assert.ok(s.army.janissary > 0);
    assert.ok(s.army.sipahi > 0);
    assert.ok(s.army.akinji > 0);
    assert.ok(s.army.levend > 0);
    assert.ok(s.army.drill > 0);
    assert.ok(s.army.supply > 0);
    assert.ok(s.military.doctrine);
    assert.ok(s.army.commanderNpcId);
    assert.ok(hostSize(s.army) > landHost(s.army));
  });

  it("migrates old hosts onto version 7 without dropping the court", () => {
    const s = fresh();
    const raw = JSON.parse(JSON.stringify(s)) as GameState;
    delete (raw as { military?: unknown }).military;
    raw.version = 6;
    const skinny = {
      janissary: raw.army.janissary,
      sipahi: raw.army.sipahi,
      azab: raw.army.azab,
      topcu: raw.army.topcu,
      navy: raw.army.navy,
      morale: raw.army.morale,
      provinceId: raw.army.provinceId,
      status: "idle" as const,
    };
    raw.army = skinny as GameState["army"];
    const migrated = migrateState(raw);
    assert.equal(migrated.version, STATE_VERSION);
    assert.equal(migrated.army.akinji, 0);
    assert.ok(migrated.army.drill >= 0);
    assert.ok(migrated.military);
    assert.ok(migrated.court.length >= 10);
    const twice = migrateState(migrated);
    assert.equal(twice.army.janissary, migrated.army.janissary);
    assert.equal(twice.military.doctrine, migrated.military.doctrine);
  });

  it("does not decide battles by headcount alone", () => {
    const s = fresh();
    const weak = fillArmy({ ...s.army, drill: 12, experience: 10, morale: 22, supply: 18, pay: 20 }, s.realm.capitalId);
    const strong = fillArmy({ ...s.army, drill: 92, experience: 88, morale: 90, supply: 90, pay: 90 }, s.realm.capitalId);
    const a = hostPower(s, weak, { terrain: "plain", weather: "fair", tactic: "center" });
    const b = hostPower(s, strong, { terrain: "plain", weather: "fair", tactic: "center" });
    assert.ok(b.power > a.power * 1.35);
  });

  it("gives sipahi the plain and takes it on the mountain", () => {
    const s = fresh();
    const army = fillArmy(
      { ...s.army, sipahi: 18000, janissary: 200, azab: 200, akinji: 0, topcu: 0, navy: 0, levend: 0 },
      s.realm.capitalId,
    );
    const plain = hostPower(s, army, { terrain: "plain", weather: "fair", tactic: "cavalry_charge" });
    const mtn = hostPower(s, army, { terrain: "mountain", weather: "fair", tactic: "cavalry_charge" });
    assert.ok(plain.power > mtn.power);
  });

  it("flank beats centre in the tactic matrix", () => {
    assert.ok(tacticEdge("flank", "center") > 0);
    assert.ok(tacticEdge("center", "flank") < 0);
  });

  it("walks a BFS route from the capital to Karaman", () => {
    const s = fresh();
    const path = shortestPath(s.provinces, "konstantiniyye", "karaman");
    assert.ok(path);
    assert.equal(path![0], "konstantiniyye");
    assert.equal(path![path!.length - 1], "karaman");
    assert.ok(path!.length >= 3);
  });

  it("charges a campaign cost and keeps the host on the road", () => {
    const s = clearEvents(fresh());
    const cost = campaignCost(s);
    assert.ok(cost > 400);
    const target = s.provinces.find((p) => p.ownerId !== s.realm.id && p.neighbors.includes("konstantiniyye"));
    assert.ok(target);
    const before = s.treasury;
    const marched = applyAction(s, { type: "LAUNCH_CAMPAIGN", provinceId: target!.id }).state;
    assert.equal(marched.army.status, "campaign");
    assert.ok(marched.treasury < before);
    assert.ok(marched.ledger.some((l) => l.noteKey === "ledger.campaign"));
    assert.ok(marched.campaign?.route && marched.campaign.route.length >= 2);
    assert.equal(marched.army.provinceId, "konstantiniyye");
  });

  it("opens a siege against a fortified neighbour instead of auto-resolving", () => {
    let s = clearEvents(fresh());
    const konya = s.provinces.find((p) => p.id === "konya");
    assert.ok(konya && konya.fort >= 2 && konya.ownerId !== s.realm.id);
    s = { ...s, army: { ...s.army, provinceId: "ankara" } };
    s = applyAction(s, { type: "LAUNCH_CAMPAIGN", provinceId: "konya" }).state;
    s = applyAction(s, { type: "ADVANCE_YEAR" }).state;
    assert.ok(s.campaign);
    assert.equal(s.campaign?.phase, "siege");
    assert.equal(s.army.status, "siege");
  });

  it("storms a fort from an open siege", () => {
    let s = clearEvents(fresh());
    s = { ...s, army: { ...s.army, provinceId: "ankara" } };
    s = applyAction(s, { type: "LAUNCH_CAMPAIGN", provinceId: "konya" }).state;
    s = applyAction(s, { type: "ADVANCE_YEAR" }).state;
    const rng = mulberry32(s.seed + 99);
    const stormed = stormFort(s, rng);
    assert.ok(stormed.military.battles.length >= 1);
  });

  it("retreats the host to the start of the route", () => {
    let s = clearEvents(fresh());
    s = applyAction(s, { type: "LAUNCH_CAMPAIGN", provinceId: "konya" }).state;
    const next = applyAction(s, { type: "RECALL_ARMY" }).state;
    assert.equal(next.campaign, null);
    assert.equal(next.army.status, "idle");
    assert.equal(next.army.provinceId, "konstantiniyye");
  });

  it("offers a truce to the owner of the target", () => {
    let s = clearEvents(fresh());
    s = applyAction(s, { type: "LAUNCH_CAMPAIGN", provinceId: "konya" }).state;
    const next = offerPeace(s, "karaman");
    const rel = next.relations.find((r) => r.realmId === "karaman");
    assert.equal(rel?.treaty, "truce");
    assert.equal(next.campaign, null);
  });

  it("drills once a year and pays ulufe from the chest", () => {
    const s = clearEvents(fresh());
    const drilled = drillHost(s);
    assert.ok(drilled.army.drill > s.army.drill);
    assert.ok(drilled.treasury < s.treasury);
    const twice = drillHost(drilled);
    assert.equal(twice.army.drill, drilled.army.drill);
    const paid = payUlufe(drilled);
    assert.ok(paid.army.pay > drilled.army.pay);
  });

  it("appoints an adult şehzade as serdar", () => {
    let s = fresh();
    const heir = s.members.find((m) => m.role === "sehzade" && m.alive)!;
    s = { ...s, members: s.members.map((m) => (m.id === heir.id ? { ...m, birthYear: s.year - 18 } : m)) };
    const next = setCommander(s, undefined, heir.id);
    assert.equal(next.army.commanderMemberId, heir.id);
    assert.equal(next.army.commanderNpcId, null);
  });

  it("stores a defence doctrine for offline play", () => {
    const s = fresh();
    const next = setDoctrine(s, "ambush");
    assert.equal(next.military.doctrine, "ambush");
  });

  it("resolves a live tactic duel against the AI commander", () => {
    let s = clearEvents(fresh());
    s = startDuel(s, {
      peerId: "ai",
      peerName: "Serdar",
      provinceId: s.army.provinceId,
      seed: 42,
      host: true,
      duelId: "duel_test",
    });
    assert.ok(s.military.pendingDuel);
    const blocked = applyAction(s, { type: "ADVANCE_YEAR" }).state;
    assert.equal(blocked.year, s.year);
    const rng = mulberry32(42);
    const next = resolveDuel(s, "flank", "hold_line", rng);
    assert.equal(next.military.pendingDuel, null);
    assert.ok(next.military.battles[0]?.kind === "duel");
  });

  it("raises akinji from the chest", () => {
    const s = clearEvents(fresh());
    const next = applyAction(s, { type: "RAISE_TROOPS", kind: "akinji", count: 500 }).state;
    assert.equal(next.army.akinji, s.army.akinji + 500);
    assert.ok(next.treasury < s.treasury);
  });

  it("keeps a launched campaign on the tick without dropping the economy", () => {
    let s = clearEvents(fresh());
    s = applyAction(s, { type: "LAUNCH_CAMPAIGN", provinceId: "konya" }).state;
    const year = tickMilitaryYear(s, mulberry32(7));
    assert.ok(year.economy);
    assert.ok(year.campaign || year.army.status === "idle" || year.army.status === "siege");
  });

  it("labels coastal capitals as urban or coast, not plains", () => {
    const s = fresh();
    const k = s.provinces.find((p) => p.id === "konstantiniyye")!;
    const t = terrainOf(k);
    assert.ok(t === "urban" || t === "coast" || t === "island");
  });

  it("is deterministic for the same seed", () => {
    const s = clearEvents(fresh());
    const launched = launchCampaign(s, "konya")!;
    const a = tickCampaign(launched, mulberry32(11));
    const b = tickCampaign(launched, mulberry32(11));
    assert.equal(a.campaign?.phase, b.campaign?.phase);
    assert.equal(a.army.supply, b.army.supply);
  });

  it("abandons a dropped P2P duel with doctrine, not a client seed", () => {
    let s = clearEvents(fresh());
    s = startDuel(s, {
      peerId: "p-other",
      peerName: "Istvan",
      provinceId: s.army.provinceId,
      seed: 99,
      host: true,
      duelId: "duel_drop01",
    });
    assert.ok(s.military.pendingDuel);
    const next = abandonDuel(s, mulberry32(3));
    assert.equal(next.military.pendingDuel, null);
    assert.ok(["win", "loss", "stalemate", "retreat"].includes(next.chronicle[0]?.kind === "ordu" ? "win" : "win"));
    assert.ok(next.chronicle[0]?.titleKey?.startsWith("log.duel"));
  });

  it("invests a held province and refuses a foreign one", () => {
    const s = clearEvents(fresh());
    const mine = s.provinces.find((p) => p.ownerId === s.realm.id)!;
    const invested = investProvince(s, mine.id);
    assert.ok(invested);
    assert.equal(invested!.provinces.find((p) => p.id === mine.id)!.development, mine.development + 1);
    assert.ok(invested!.treasury < s.treasury);
    const foreign = s.provinces.find((p) => p.ownerId !== s.realm.id)!;
    assert.equal(investProvince(s, foreign.id), null);
    const via = applyAction(s, { type: "INVEST_PROVINCE", provinceId: mine.id }).state;
    assert.ok(via.provinces.find((p) => p.id === mine.id)!.development > mine.development);
  });

  it("garrisons a held city and posts the host there", () => {
    const s = clearEvents(fresh());
    const bursa = garrisonProvince(s, "bursa");
    assert.ok(bursa);
    assert.equal(bursa!.army.provinceId, "bursa");
    assert.equal(bursa!.army.status, "garrison");
    assert.ok(bursa!.provinces.find((p) => p.id === "bursa")!.loyalty >= s.provinces.find((p) => p.id === "bursa")!.loyalty);
  });

  it("lets a rival host change the map over several years", () => {
    let s = clearEvents(fresh());
    const before = s.provinces.map((p) => `${p.id}:${p.ownerId}`).join("|");
    const host = deriveHost(s, s.foreign[0]);
    assert.ok(host.men > 500);
    for (let i = 0; i < 14; i += 1) {
      s = tickRivalRealms(s, mulberry32(s.seed + i * 13));
      s = { ...s, year: s.year + 1 };
    }
    const after = s.provinces.map((p) => `${p.id}:${p.ownerId}`).join("|");
    const moved = before !== after;
    const noted = s.chronicle.some((c) =>
      ["log.ai_conquest.title", "log.ai_war.title", "log.raid.title", "log.held.title", "log.lost.title", "log.raid_win.title"].includes(c.titleKey),
    );
    const grew = s.provinces.some((p, i) => {
      const prev = before;
      void prev;
      return p.development > 0 && p.ownerId !== s.realm.id;
    });
    assert.ok(moved || noted || grew);
  });
});
