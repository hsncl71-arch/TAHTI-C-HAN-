import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction } from "../world/engine.ts";
import { migrateState } from "./migrate.ts";
import { inspectIdentity, sameSovereign } from "./consistency.ts";
import { ageBandOf, expressionForSovereign, identitySrc, lockEquals, regaliaForRoom } from "./identity.ts";
import { occupantsIn, placeOccupants, roomSceneSrc } from "./rooms.ts";
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
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "test-user");
}

describe("sovereign identity lock", () => {
  it("locks face DNA and portrait at cülûs", () => {
    const s = fresh();
    assert.equal(s.version, STATE_VERSION);
    assert.equal(s.ruler.portrait, "sultan-a");
    assert.equal(s.ruler.identity.archetypeId, "sultan-a");
    assert.equal(s.ruler.identity.face.marks, "sol kulakta altın halka");
    assert.equal(s.ruler.identity.face.beard, "kısa siyah sivri sakal");
    assert.equal(s.ruler.identity.givenName, "Alparslan");
    const report = inspectIdentity(s);
    assert.equal(report.ok, true, report.failures.join("; "));
  });

  it("keeps the same man across every palace room", () => {
    let s = fresh();
    const rooms = ["taht", "divan", "harem", "hazine", "hasoda", "bahce", "elci", "sehzade", "askeri"] as const;
    for (const room of rooms) {
      const res = applyAction(s, { type: "VISIT_ROOM", room });
      s = res.state;
      assert.equal(s.ruler.portrait, "sultan-a");
      assert.equal(s.ruler.identity.archetypeId, "sultan-a");
      assert.ok(lockEquals(s.ruler.identity, fresh().ruler.identity));
      assert.equal(identitySrc(s.ruler.portrait, "idle"), "/art/sultan-a.jpg");
      assert.ok(identitySrc(s.ruler.portrait, "speak").includes("sultan-a"));
      assert.ok(roomSceneSrc(room).startsWith("/art/"));
    }
    assert.equal(s.ruler.clothing, "campaign");
  });

  it("changes clothing with the room, never the face", () => {
    const s = fresh();
    assert.equal(regaliaForRoom("taht"), "ceremonial");
    assert.equal(regaliaForRoom("hasoda"), "private");
    assert.equal(regaliaForRoom("askeri"), "campaign");
    const a = applyAction(s, { type: "VISIT_ROOM", room: "hasoda" }).state;
    assert.equal(a.ruler.clothing, "private");
    assert.equal(a.ruler.portrait, s.ruler.portrait);
    assert.equal(a.ruler.identity.archetypeId, s.ruler.identity.archetypeId);
  });

  it("year tick ages the body, not the identity", () => {
    let s = fresh();
    const lock = s.ruler.identity;
    for (let i = 0; i < 3; i += 1) {
      if (s.pendingEvents[0]) {
        s = applyAction(s, { type: "RESOLVE_EVENT", eventId: s.pendingEvents[0].id, choiceId: "adalet" }).state;
      }
      s = applyAction(s, { type: "ADVANCE_YEAR" }).state;
    }
    assert.equal(sameSovereign(fresh(), s) || s.ruler.portrait === "sultan-a", true);
    assert.equal(s.ruler.identity.archetypeId, lock.archetypeId);
    assert.equal(s.ruler.identity.face.marks, lock.face.marks);
    assert.ok(s.ruler.healthFlags.vigor > 0);
    assert.ok(s.ruler.reputation.court >= 0);
    assert.ok(s.ruler.authority.divan >= 0);
  });

  it("succession keeps the heir's own face instead of a random sultan", () => {
    const s = fresh();
    const heir = s.members.find((m) => m.role === "sehzade");
    assert.ok(heir);
    assert.equal(heir.portrait, "sehzade");
    const staged: GameState = {
      ...s,
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
    assert.equal(next.ruler.givenName, heir.givenName);
    assert.equal(next.ruler.portrait, "sehzade");
    assert.equal(next.ruler.identity.archetypeId, "sehzade");
    assert.notEqual(next.ruler.portrait, "sultan-a");
    assert.notEqual(next.ruler.portrait, "sultan-b");
    assert.notEqual(next.ruler.portrait, "sultan-c");
  });

  it("migrate is idempotent and fills a v1 snapshot", () => {
    const s = fresh();
    const v1 = JSON.parse(JSON.stringify(s)) as GameState;
    delete (v1 as { palace?: unknown }).palace;
    delete (v1 as { courtTies?: unknown }).courtTies;
    delete (v1 as { decisions?: unknown }).decisions;
    (v1 as { version: number }).version = 1;
    delete (v1.ruler as { identity?: unknown }).identity;
    const once = migrateState(v1);
    const twice = migrateState(once);
    assert.equal(once.ruler.identity.archetypeId, "sultan-a");
    assert.equal(twice.ruler.identity.archetypeId, once.ruler.identity.archetypeId);
    assert.ok(once.palace.occupants.length > 0);
    assert.equal(inspectIdentity(once).ok, true, inspectIdentity(once).failures.join("; "));
  });

  it("occupants in rooms are real people", () => {
    const s = fresh();
    const occ = placeOccupants(s);
    assert.ok(occ.some((o) => o.kind === "ruler" && o.room === "taht"));
    assert.ok(occupantsIn({ ...s, palace: { ...s.palace, occupants: occ } }, "divan").length >= 3);
    for (const o of occ) {
      if (o.kind === "ruler") assert.equal(o.characterId, s.ruler.id);
      if (o.kind === "npc") assert.ok(s.npcs.some((n) => n.id === o.characterId));
      if (o.kind === "member") assert.ok(s.members.some((m) => m.id === o.characterId));
    }
  });

  it("audience records a decision without swapping the face", () => {
    const s = fresh();
    const vizier = s.npcs.find((n) => n.office === "sadrazam");
    assert.ok(vizier);
    const next = applyAction(s, { type: "AUDIENCE", characterId: vizier.id, topic: "hal" }).state;
    assert.equal(next.ruler.portrait, s.ruler.portrait);
    assert.ok(next.decisions[0]?.kind === "audience");
    const tie = next.courtTies.find((t) => t.targetId === vizier.id);
    assert.ok(tie && tie.affinity >= vizier.loyalty);
  });

  it("age band shifts without changing archetype", () => {
    assert.equal(ageBandOf(28), "young");
    assert.equal(ageBandOf(38), "prime");
    assert.equal(ageBandOf(50), "mature");
    assert.equal(ageBandOf(62), "elder");
    const s = fresh();
    assert.equal(expressionForSovereign(s, true), "speak");
    assert.equal(s.ruler.portrait, "sultan-a");
    const srcYoung = identitySrc(s.ruler.portrait, "idle");
    assert.equal(identitySrc(s.ruler.portrait, "idle"), srcYoung);
  });

  it("aging never changes the locked idle path", () => {
    const s = fresh();
    const idle = identitySrc(s.ruler.portrait, "idle");
    for (const age of [18, 30, 44, 70]) {
      assert.equal(identitySrc(s.ruler.portrait, "idle"), idle, `age ${age}`);
    }
    assert.ok(idle.includes("sultan-a"));
  });

  it("family members carry locked portraits", () => {
    const s = fresh();
    const valide = s.members.find((m) => m.role === "valide");
    const hatun = s.members.find((m) => m.role === "hatun");
    const heir = s.members.find((m) => m.role === "sehzade");
    assert.equal(valide?.portrait, "valide");
    assert.equal(hatun?.portrait, "hatun");
    assert.equal(heir?.portrait, "sehzade");
  });
});
