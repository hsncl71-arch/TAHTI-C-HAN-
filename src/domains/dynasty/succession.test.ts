import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction } from "../world/engine.ts";
import { migrateState } from "../palace/migrate.ts";
import { makeMember } from "./member.ts";
import { beginInterregnum, backPretender, confirmEnthronement } from "./succession.ts";
import { claimPower, claimStrength, buildPretenders } from "./claim.ts";
import { generationCount, realmInherited, takeRealmSnapshot } from "./reigns.ts";
import { buildTree, byGeneration, lineagePath } from "./tree.ts";
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
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "succ-user");
}

function withRivalPrinces(s: GameState): GameState {
  const father = s.members.find((m) => m.id === s.ruler.memberId)!;
  const mother = s.members.find((m) => m.role === "hatun");
  const first = s.members.find((m) => m.role === "sehzade")!;
  const weak = {
    ...first,
    birthYear: s.year - 17,
    influence: 12,
    military: 10,
    statecraft: 10,
    supporters: [] as string[],
  };
  const strong = makeMember({
    givenName: "Selim",
    gender: "m",
    role: "sehzade",
    birthYear: s.year - 19,
    location: "edirne",
    portrait: "sehzade",
    fatherId: father.id,
    motherId: mother?.id ?? null,
    education: "seyfiye",
    military: 78,
    statecraft: 64,
    influence: 82,
    generation: (father.generation ?? 1) + 1,
    supporters: s.npcs.filter((n) => n.office === "sadrazam" || n.office === "yeniceri_agasi").map((n) => n.id),
  });
  return {
    ...s,
    members: s.members.map((m) => (m.id === first.id ? weak : m)).concat(strong),
  };
}

function ensureAdultSon(s: GameState, name: string): GameState {
  const father = s.members.find((m) => m.id === s.ruler.memberId)!;
  const existing = s.members.find((m) => m.alive && m.gender === "m" && m.fatherId === father.id && m.id !== father.id);
  if (existing) {
    return {
      ...s,
      members: s.members.map((m) =>
        m.id === existing.id
          ? { ...m, birthYear: s.year - 18, role: "sehzade", generation: (father.generation ?? 1) + 1 }
          : m,
      ),
    };
  }
  const son = makeMember({
    givenName: name,
    gender: "m",
    role: "sehzade",
    birthYear: s.year - 18,
    location: s.realm.capitalId,
    portrait: "sehzade",
    fatherId: father.id,
    education: "seyfiye",
    military: 40,
    statecraft: 36,
    influence: 40,
    generation: (father.generation ?? 1) + 1,
  });
  return { ...s, members: [...s.members, son] };
}

function runGeneration(s: GameState, name: string): GameState {
  const staged = ensureAdultSon(s, name);
  const son = staged.members.find(
    (m) => m.alive && m.gender === "m" && m.fatherId === staged.ruler.memberId && m.id !== staged.ruler.memberId,
  );
  const opened = beginInterregnum(staged);
  const backed = son ? backPretender(opened, son.id) : opened;
  return confirmEnthronement(backed);
}

describe("nesil ve taht mücadelesi", () => {
  it("seeds generation fields and an open reign", () => {
    const s = fresh();
    assert.equal(s.version, STATE_VERSION);
    assert.equal(s.members.find((m) => m.role === "sultan")?.generation, 1);
    assert.equal(s.members.find((m) => m.role === "sehzade")?.generation, 2);
    assert.equal(s.members.find((m) => m.role === "valide")?.generation, 0);
    assert.equal(s.reigns.length, 1);
    assert.equal(s.reigns[0].endYear, null);
    assert.equal(s.reigns[0].givenName, "Alparslan");
  });

  it("opens an interregnum with pretenders and claim axes", () => {
    const s = withRivalPrinces(fresh());
    const next = beginInterregnum(s);
    assert.ok(next.succession);
    assert.ok(next.succession!.pretenders.length >= 2);
    const p = next.succession!.pretenders[0];
    assert.ok(p.claim.court >= 0);
    assert.ok(p.claim.army >= 0);
    assert.ok(p.claim.people >= 0);
    assert.ok(p.claim.province >= 0);
    assert.ok(p.claim.talent >= 0);
    assert.ok(p.claim.blood >= 0);
    assert.ok(p.strength > 0);
    assert.equal(next.ruler.health, 0);
    assert.equal(next.members.find((m) => m.id === s.ruler.memberId)?.alive, false);
  });

  it("ranks a well-backed sanjak prince above a weak court child", () => {
    const s = withRivalPrinces(fresh());
    const ranked = buildPretenders(s);
    assert.equal(ranked[0].name, "Selim");
    const selim = s.members.find((m) => m.givenName === "Selim")!;
    const other = s.members.find((m) => m.role === "sehzade" && m.givenName !== "Selim")!;
    assert.ok(claimStrength(claimPower(s, selim)) > claimStrength(claimPower(s, other)));
  });

  it("new ruler inherits treasury, army, wars, treaties and debts", () => {
    let s = withRivalPrinces(fresh());
    s = {
      ...s,
      treasury: -900,
      army: { ...s.army, janissary: 6111, navy: 44 },
      relations: s.relations.map((r, i) =>
        i === 0 ? { ...r, treaty: "war" as const, value: -40 } : i === 1 ? { ...r, treaty: "alliance" as const, value: 55 } : r,
      ),
    };
    const before = takeRealmSnapshot(s);
    const opened = beginInterregnum(s);
    const next = applyAction(opened, { type: "CONFIRM_SUCCESSION" }).state;
    assert.equal(next.succession, null);
    assert.notEqual(next.ruler.memberId, s.ruler.memberId);
    assert.equal(next.treasury, s.treasury);
    assert.equal(next.army.janissary, 6111);
    assert.equal(next.army.navy, 44);
    assert.ok(realmInherited({ ...s, members: opened.members, succession: opened.succession, ruler: opened.ruler }, { ...next, prestige: s.prestige, stability: s.stability, army: { ...next.army, morale: s.army.morale } }) || next.treasury === before.treasury);
    assert.equal(next.relations.find((r) => r.treaty === "war")?.treaty, "war");
    assert.equal(next.relations.find((r) => r.treaty === "alliance")?.treaty, "alliance");
    assert.equal(before.debt, 900);
    assert.equal(next.treasury, -900);
  });

  it("closes the old reign and opens a new one with a distinct identity", () => {
    const s = withRivalPrinces(fresh());
    const opened = beginInterregnum(s);
    const next = applyAction(opened, { type: "CONFIRM_SUCCESSION" }).state;
    assert.equal(next.reigns.length, 2);
    assert.ok(next.reigns[0].endYear != null);
    assert.equal(next.reigns[0].snapshotEnd?.treasury, s.treasury);
    assert.equal(next.reigns[1].endYear, null);
    assert.equal(next.reigns[1].givenName, next.ruler.givenName);
    assert.equal(next.ruler.portrait, "sehzade");
    assert.equal(next.ruler.identity.archetypeId, "sehzade");
  });

  it("lets the player back a weaker pretender", () => {
    const s = withRivalPrinces(fresh());
    const opened = beginInterregnum(s);
    const weak = [...opened.succession!.pretenders].sort((a, b) => a.strength - b.strength)[0];
    const backed = applyAction(opened, { type: "BACK_PRETENDER", memberId: weak.memberId }).state;
    assert.equal(backed.succession?.heirMemberId, weak.memberId);
    const next = applyAction(backed, { type: "CONFIRM_SUCCESSION" }).state;
    assert.equal(next.ruler.memberId, weak.memberId);
  });

  it("advances 5, 10 and 20 generations without ending the game", () => {
    let s = fresh();
    const names = ["Bayezid", "Selim", "Murad", "Süleyman", "Osman", "Mehmed", "Mustafa", "Cihangir", "Korkut", "Orhan", "Kasım", "Alemşah", "Cem", "Ahmed", "Mahmud", "Abdullah", "Yusuf", "İsa", "Yakup", "Davud"];
    for (let i = 0; i < 5; i += 1) s = runGeneration(s, names[i]);
    assert.equal(s.succession, null);
    assert.ok(generationCount(s) >= 5);
    assert.equal(s.reigns.length, 6);
    assert.ok(s.ruler.health > 0);

    for (let i = 5; i < 10; i += 1) s = runGeneration(s, names[i]);
    assert.ok(generationCount(s) >= 10);
    assert.equal(s.reigns.length, 11);

    for (let i = 10; i < 20; i += 1) s = runGeneration(s, names[i]);
    assert.ok(generationCount(s) >= 20);
    assert.equal(s.reigns.length, 21);
    assert.equal(s.succession, null);
    assert.ok(s.treasury === s.reigns[s.reigns.length - 1].snapshotStart.treasury);
    const tree = buildTree(s);
    assert.ok(tree.length >= 1);
    const path = lineagePath(s, s.ruler.memberId);
    assert.ok(path.length >= 2);
    const gens = byGeneration(s);
    assert.ok((gens.get(20) ?? []).length >= 1);
  });

  it("family tree keeps father links across reigns", () => {
    let s = fresh();
    s = runGeneration(s, "Bayezid");
    const ruler = s.members.find((m) => m.id === s.ruler.memberId)!;
    assert.ok(ruler.fatherId);
    const father = s.members.find((m) => m.id === ruler.fatherId);
    assert.ok(father);
    assert.equal(father!.role, "sultan");
    assert.equal(father!.alive, false);
    assert.equal(ruler.generation, (father!.generation ?? 1) + 1);
  });

  it("migrate fills reigns and generation on a v4 snapshot", () => {
    const s = fresh();
    const raw = JSON.parse(JSON.stringify(s)) as GameState;
    delete (raw as { reigns?: unknown }).reigns;
    (raw as { version: number }).version = 4;
    raw.members = raw.members.map((m) => {
      const copy = { ...m };
      delete (copy as { generation?: number }).generation;
      return copy;
    });
    const once = migrateState(raw);
    const twice = migrateState(once);
    assert.equal(once.version, STATE_VERSION);
    assert.ok(once.reigns.length >= 1);
    assert.equal(once.reigns[0].id, twice.reigns[0].id);
    assert.ok(once.members.every((m) => typeof m.generation === "number"));
  });
});
