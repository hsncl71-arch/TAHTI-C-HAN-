import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction } from "../world/engine.ts";
import { migrateState } from "../palace/migrate.ts";
import { ADULT_AGE, isAdult, isChild } from "./age.ts";
import { actionAllowed, adultConsorts, canRomance, childrenInHarem } from "./bonds.ts";
import { INTIMATE_STEPS } from "./intimacy.ts";
import { heirScore, rankedHeirs } from "./princes.ts";
import { STATE_VERSION, type GameState } from "../types.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "fatih" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "dynasty-user");
}

describe("harem and dynasty life", () => {
  it("seeds an adult haseki bond and child princes outside romance", () => {
    const s = fresh();
    assert.equal(s.version, STATE_VERSION);
    const hatun = s.members.find((m) => m.role === "hatun");
    const heir = s.members.find((m) => m.role === "sehzade");
    const kizi = s.members.find((m) => m.role === "sultan_kizi");
    const valide = s.members.find((m) => m.role === "valide");
    assert.ok(hatun && heir && kizi && valide);
    assert.equal(isAdult(hatun, s.year), true);
    assert.equal(isChild(heir, s.year), true);
    assert.equal(isChild(kizi, s.year), true);
    assert.equal(canRomance(s, hatun.id), true);
    assert.equal(canRomance(s, heir.id), false);
    assert.equal(canRomance(s, kizi.id), false);
    assert.equal(canRomance(s, valide.id), false);
    assert.equal(s.harem.favoriteId, hatun.id);
    assert.equal(s.harem.bonds[0]?.stage, "marriage");
    assert.equal(s.harem.bonds[0]?.consent, true);
    assert.ok(childrenInHarem(s).length >= 2);
    assert.ok(adultConsorts(s).every((c) => s.year - c.birthYear >= ADULT_AGE));
  });

  it("rejects harem acts aimed at children, daughters, sons and the valide", () => {
    const s = fresh();
    const heir = s.members.find((m) => m.role === "sehzade")!;
    const kizi = s.members.find((m) => m.role === "sultan_kizi")!;
    const valide = s.members.find((m) => m.role === "valide")!;
    for (const id of [heir.id, kizi.id, valide.id]) {
      const next = applyAction(s, { type: "HAREM_ACT", partnerId: id, act: "kiss" }).state;
      assert.equal(next.harem.scene, null);
      assert.equal(next.harem.bonds.some((b) => b.partnerId === id), false);
      assert.equal(canRomance(s, id), false);
      assert.equal(actionAllowed(s, id, "meet"), false);
    }
  });

  it("lets an adult consort walk the implied intimacy path without a graphic act", () => {
    const s = fresh();
    const hatun = s.members.find((m) => m.role === "hatun")!;
    const kissed = applyAction(s, { type: "HAREM_ACT", partnerId: hatun.id, act: "kiss" }).state;
    assert.ok(kissed.harem.scene);
    assert.equal(kissed.harem.scene?.partnerId, hatun.id);
    assert.ok(INTIMATE_STEPS.includes(kissed.harem.scene!.step));
    assert.equal(["kiss", "closeness", "chamber", "veiled", "fade", "aftermath"].includes(kissed.harem.scene!.step), true);
    let cur = kissed;
    for (let i = 0; i < 8; i += 1) {
      if (!cur.harem.scene) break;
      cur = applyAction(cur, { type: "ADVANCE_SCENE" }).state;
    }
    assert.equal(cur.harem.scene, null);
    assert.ok(cur.ruler.portrait === s.ruler.portrait);
  });

  it("introduces only adult consorts", () => {
    const s = fresh();
    const next = applyAction(s, { type: "INTRODUCE_CONSORT" }).state;
    const newcomers = next.members.filter((m) => !s.members.some((x) => x.id === m.id));
    assert.equal(newcomers.length, 1);
    const w = newcomers[0];
    assert.equal(w.role, "hatun");
    assert.ok(isAdult(w, next.year));
    assert.equal(isChild(w, next.year), false);
    assert.equal(canRomance(next, w.id), true);
    assert.ok(next.year - w.birthYear >= 18);
  });

  it("grows an adult prince in a sanjak and blocks sanjak for children", () => {
    const s = fresh();
    const heir = s.members.find((m) => m.role === "sehzade")!;
    const blocked = applyAction(s, { type: "SANJAK", memberId: heir.id, provinceId: "edirne" }).state;
    assert.equal(blocked.members.find((m) => m.id === heir.id)?.location, heir.location);

    const aged: GameState = {
      ...s,
      year: s.year + 8,
      members: s.members.map((m) => (m.id === heir.id ? { ...m, birthYear: s.year + 8 - 17 } : m)),
    };
    assert.equal(isAdult(aged.members.find((m) => m.id === heir.id)!, aged.year), true);
    const drilled = applyAction(aged, { type: "DRILL_PRINCE", memberId: heir.id }).state;
    const after = drilled.members.find((m) => m.id === heir.id)!;
    assert.ok(after.military > heir.military);
    const sanjak = applyAction(drilled, { type: "SANJAK", memberId: heir.id, provinceId: "edirne" }).state;
    assert.equal(sanjak.members.find((m) => m.id === heir.id)?.location, "edirne");
  });

  it("ranks heirs by influence, not only age, once they are adult", () => {
    const s = fresh();
    const heir = s.members.find((m) => m.role === "sehzade")!;
    const extra = {
      ...heir,
      id: "m_rival",
      givenName: "Selim",
      birthYear: s.year - 18,
      influence: 80,
      military: 70,
      statecraft: 60,
      supporters: ["npc_x"],
    };
    const world: GameState = {
      ...s,
      members: [
        ...s.members.map((m) => (m.id === heir.id ? { ...m, birthYear: s.year - 17, influence: 10, military: 10, statecraft: 10 } : m)),
        extra,
      ],
    };
    const ranked = rankedHeirs(world);
    assert.equal(ranked[0].id, extra.id);
    assert.ok(heirScore(world, extra) > heirScore(world, world.members.find((m) => m.id === heir.id)!));
  });

  it("retire old harem on succession so stepmothers are not romance targets", () => {
    const s = fresh();
    const heir = s.members.find((m) => m.role === "sehzade")!;
    const hatun = s.members.find((m) => m.role === "hatun")!;
    const staged: GameState = {
      ...s,
      members: s.members.map((m) => (m.id === heir.id ? { ...m, birthYear: s.year - 18 } : m)),
      succession: {
        deceasedName: s.ruler.givenName,
        deceasedMemberId: s.ruler.memberId,
        heirMemberId: heir.id,
        heirName: heir.givenName,
        pretenders: [],
        phase: "open",
        tension: 20,
        yearOpened: s.year,
      },
    };
    const next = applyAction(staged, { type: "CONFIRM_SUCCESSION" }).state;
    const oldHatun = next.members.find((m) => m.id === hatun.id)!;
    assert.equal(canRomance(next, oldHatun.id), false);
    assert.equal(oldHatun.location === "eski_saray" || oldHatun.role === "valide", true);
    assert.equal(next.harem.bonds.length, 0);
    assert.equal(next.ruler.portrait, "sehzade");
  });

  it("migrate fills harem on a v3 snapshot", () => {
    const s = fresh();
    const raw = JSON.parse(JSON.stringify(s)) as GameState;
    delete (raw as { harem?: unknown }).harem;
    (raw as { version: number }).version = 3;
    const once = migrateState(raw);
    const twice = migrateState(once);
    assert.ok(once.harem);
    assert.equal(once.harem.favoriteId, twice.harem.favoriteId);
    assert.ok(once.members.every((m) => Array.isArray(m.supporters)));
    const child = once.members.find((m) => m.role === "sehzade")!;
    assert.equal(canRomance(once, child.id), false);
  });
});
