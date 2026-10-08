import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction, yearlyForecast } from "../world/engine.ts";
import { migrateState } from "../palace/migrate.ts";
import { holderOf, sitting } from "./offices.ts";
import { agendaByKey } from "./agenda.ts";
import { STATE_VERSION, type GameState } from "../types.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "hunkar" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "divan-user");
}

function clearEvents(s: GameState): GameState {
  let next = s;
  while (next.pendingEvents[0]) {
    const ev = next.pendingEvents[0];
    const choice = ev.key === "tahta_cikis" ? "adalet" : "pay";
    const tried = applyAction(next, { type: "RESOLVE_EVENT", eventId: ev.id, choiceId: choice });
    if (tried.state.pendingEvents[0]?.id === ev.id) {
      next = { ...next, pendingEvents: next.pendingEvents.slice(1) };
    } else {
      next = tried.state;
    }
  }
  return next;
}

describe("divan-ı hümayun", () => {
  it("seeds a full period court with politics stats", () => {
    const s = fresh();
    assert.equal(s.version, STATE_VERSION);
    assert.ok(holderOf(s, "sadrazam"));
    assert.ok(holderOf(s, "kazasker_rumeli"));
    assert.ok(holderOf(s, "yeniceri_agasi"));
    assert.ok(s.court.some((p) => p.office === "kubbe_vezir" && p.seat === 1));
    assert.ok(s.court.some((p) => p.office === "beylerbeyi" && p.regionId === "rumeli"));
    assert.equal(s.court.some((p) => p.office === "reisulkuttab"), false);
    const sad = holderOf(s, "sadrazam")!;
    assert.ok(sad.influence > 20);
    assert.ok(sad.wealth > 500);
    assert.ok(sad.rivals.length >= 1);
    assert.ok(sitting(s).length >= 10);
    const f = yearlyForecast(s);
    assert.ok(f.net > -4000, `net ${f.net}`);
  });

  it("HOLD_DIVAN opens a real agenda whose decision mutates the realm", () => {
    let s = clearEvents(fresh());
    const beforeTax = s.taxRate;
    const beforeTreasury = s.treasury;
    const beforeStab = s.stability;
    s = applyAction(s, { type: "HOLD_DIVAN" }).state;
    assert.equal(s.divan.sessionOpen, true);
    assert.ok(s.divan.agenda.length >= 3);
    const topics = new Set(s.divan.agenda.map((a) => a.topic));
    assert.ok(topics.size >= 3);
    const item = s.divan.agenda[0];
    assert.ok(item.votes.length >= 8);
    const choiceId = agendaByKey(item.key)?.choices[0].id;
    assert.ok(choiceId);
    s = applyAction(s, { type: "RESOLVE_DIVAN", itemId: item.id, choiceId }).state;
    assert.equal(s.divan.agenda.some((a) => a.id === item.id), false);
    assert.ok(
      s.taxRate !== beforeTax || s.treasury !== beforeTreasury || s.stability !== beforeStab || s.divan.minutes.length > 0,
    );
    assert.ok(s.divan.minutes.length >= 1);
  });

  it("resolves known agenda keys with concrete state change", () => {
    let s = clearEvents(fresh());
    s = applyAction(s, { type: "HOLD_DIVAN" }).state;
    const eco = s.divan.agenda.find((a) => a.key === "ekonomi_osr");
    if (eco) {
      const tax = s.taxRate;
      s = applyAction(s, { type: "RESOLVE_DIVAN", itemId: eco.id, choiceId: "raise" }).state;
      assert.ok(s.taxRate > tax);
    } else {
      const war = s.divan.agenda.find((a) => a.key === "savas_hudut");
      assert.ok(war);
      s = applyAction(s, { type: "RESOLVE_DIVAN", itemId: war!.id, choiceId: "escalate" }).state;
      assert.ok(s.relations.some((r) => r.treaty === "war") || s.prestige >= 45);
    }
  });

  it("appoint and dismiss move men and shock the realm", () => {
    let s = clearEvents(fresh());
    const post = s.court.find((p) => p.office === "defterdar")!;
    const oldId = post.npcId!;
    const candidate = s.npcs.find((n) => n.alive && n.id !== oldId && !s.court.some((p) => p.npcId === n.id))!;
    s = applyAction(s, { type: "APPOINT", office: "defterdar", npcId: candidate.id, postId: post.id }).state;
    assert.equal(s.court.find((p) => p.id === post.id)?.npcId, candidate.id);
    assert.equal(holderOf(s, "defterdar")?.id, candidate.id);
    const stab = s.stability;
    s = applyAction(s, { type: "DISMISS", postId: post.id }).state;
    assert.equal(s.court.find((p) => p.id === post.id)?.npcId, null);
    assert.ok(s.stability <= stab);
    const fired = s.npcs.find((n) => n.id === candidate.id)!;
    assert.ok(fired.loyalty < candidate.loyalty || fired.favor < 90);
  });

  it("a sitting sadrazam gains influence across years", () => {
    let s = clearEvents(fresh());
    const start = holderOf(s, "sadrazam")!.influence;
    for (let i = 0; i < 6; i += 1) {
      s = clearEvents(s);
      s = applyAction(s, { type: "ADVANCE_YEAR" }).state;
    }
    const sad = holderOf(s, "sadrazam")!;
    assert.ok(sad.influence > start, `influence ${sad.influence} vs ${start}`);
    assert.ok(sad.wealth > 800);
  });

  it("migrates a v2 snapshot into a living divan", () => {
    const s = fresh();
    const v2 = JSON.parse(JSON.stringify(s)) as GameState;
    (v2 as { version: number }).version = 2;
    delete (v2 as { divan?: unknown }).divan;
    v2.npcs = v2.npcs.map((n) => {
      const slim = { ...n } as GameState["npcs"][number];
      delete (slim as { influence?: number }).influence;
      delete (slim as { rivals?: string[] }).rivals;
      return slim;
    });
    v2.court = v2.court.map((p) => ({ office: p.office, npcId: p.npcId }) as GameState["court"][number]);
    const next = migrateState(v2);
    assert.equal(next.version, STATE_VERSION);
    assert.ok(next.divan);
    assert.ok(holderOf(next, "sadrazam"));
    assert.ok(holderOf(next, "yeniceri_agasi"));
    assert.ok(next.npcs[0].rivals);
    const twice = migrateState(next);
    assert.equal(twice.court.length, next.court.length);
  });

  it("unlocks reisülküttab in its historical window", () => {
    let s = clearEvents(fresh());
    s = { ...s, year: 1523, lastDivanYear: 1522, pendingEvents: [] };
    s = applyAction(s, { type: "ADVANCE_YEAR" }).state;
    s = clearEvents(s);
    assert.ok(s.court.some((p) => p.office === "reisulkuttab"), "reisülküttab should appear by 1524");
  });
});
