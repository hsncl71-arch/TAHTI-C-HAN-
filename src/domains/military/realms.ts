import { clamp, mulberry32, nid } from "@/domains/ids";
import type { ChronicleEntry, GameState, Province, Realm } from "@/domains/types";
import { defendProvince } from "@/domains/military/campaign";
import { hostPower } from "@/domains/military/combat";
import { landHost } from "@/domains/military/model";
import { terrainOf, weatherOf } from "@/domains/military/terrain";
import { difficultyFactor, hateThreshold } from "@/domains/governance/model";

/**
 * Rival hosts. Seeded from each realm's capital so a reload never invents
 * a new army. The player host stays on GameState.army.
 */
export interface RealmHost {
  realmId: string;
  men: number;
  morale: number;
  treasury: number;
  strength: number;
}

function notice(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): ChronicleEntry {
  return { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
}

function pushLog(s: GameState, entry: ChronicleEntry): GameState {
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

export function realmSeed(s: GameState, realmId: string): number {
  let h = s.seed;
  for (let i = 0; i < realmId.length; i += 1) h = (h * 33 + realmId.charCodeAt(i)) >>> 0;
  return h;
}

export function deriveHost(s: GameState, realm: Realm): RealmHost {
  const lands = s.provinces.filter((p) => p.ownerId === realm.id);
  const men = Math.round(lands.reduce((a, p) => a + p.manpower * 0.42 + p.development * 90, 1800));
  const treasury = Math.round(lands.reduce((a, p) => a + p.taxBase * 18 + p.trade * 12, 4000));
  const rng = mulberry32(realmSeed(s, realm.id) + s.year * 17);
  const morale = 48 + Math.floor(rng() * 28);
  const strength = men * (0.72 + morale / 220) + lands.reduce((a, p) => a + p.fort * 280, 0);
  return { realmId: realm.id, men: Math.max(900, men), morale, treasury, strength };
}

function ownerName(s: GameState, id: string): string {
  if (id === s.realm.id) return s.realm.name;
  return s.foreign.find((f) => f.id === id)?.name ?? id;
}

function borderOf(provinces: Province[], owner: string, foe: string): Province[] {
  return provinces.filter(
    (p) => p.ownerId === owner && p.neighbors.some((n) => provinces.find((x) => x.id === n)?.ownerId === foe),
  );
}

function weakestBorder(provinces: Province[], owner: string): { foe: string; lands: Province[] } | null {
  const foes = new Map<string, Province[]>();
  for (const p of provinces) {
    if (p.ownerId !== owner) continue;
    for (const n of p.neighbors) {
      const other = provinces.find((x) => x.id === n);
      if (!other || other.ownerId === owner) continue;
      const list = foes.get(other.ownerId) ?? [];
      if (!list.some((x) => x.id === p.id)) list.push(p);
      foes.set(other.ownerId, list);
    }
  }
  let best: { foe: string; lands: Province[] } | null = null;
  for (const [foe, lands] of foes) {
    if (!best || lands.length < best.lands.length) best = { foe, lands };
  }
  return best;
}

function transfer(s: GameState, provinceId: string, to: string, loyalty: number, unrest: number): GameState {
  return {
    ...s,
    provinces: s.provinces.map((p) =>
      p.id === provinceId
        ? {
            ...p,
            ownerId: to,
            loyalty: clamp(loyalty, 8, 92),
            unrest: clamp(unrest, 0, 100),
            prosperity: clamp(p.prosperity - 6, 8, 100),
            fort: Math.max(1, p.fort - (to === s.realm.id ? 0 : 0)),
          }
        : p,
    ),
  };
}

function playerFieldPower(s: GameState, provinceId: string): number {
  const p = s.provinces.find((x) => x.id === provinceId);
  if (!p) return 1;
  const armyHere =
    s.army.provinceId === provinceId ||
    ((s.army.status === "idle" || s.army.status === "garrison") &&
      (s.army.provinceId === provinceId || s.army.provinceId === s.realm.capitalId));
  const host = hostPower(s, s.army, {
    terrain: terrainOf(p),
    weather: weatherOf(s.year, p),
    tactic: "hold_line",
    defender: true,
    fort: p.fort,
    doctrine: s.military.doctrine,
  });
  const garrison = p.manpower * 0.35 + p.fort * 700 + p.development * 40;
  return (armyHere && s.army.status !== "campaign" && s.army.status !== "siege" ? host.power * 0.42 : host.power * 0.08) + garrison;
}

/**
 * One rival acts each year. Decisions follow borders, treasury and relative strength —
 * not a coin flip. Wars flip land; peace years fortify, settle and sometimes raid.
 */
export function tickRivalRealms(s: GameState, rng: () => number): GameState {
  if (!s.foreign.length) return s;
  let next = s;
  const order = [...s.foreign].sort((a, b) => (realmSeed(s, a.id) % 97) - (realmSeed(s, b.id) % 97));
  const actor = order[s.year % order.length];
  if (!actor) return next;
  const host = deriveHost(next, actor);
  const lands = next.provinces.filter((p) => p.ownerId === actor.id);
  if (!lands.length) return next;

  const atWar = next.relations.find((r) => r.realmId === actor.id && r.treaty === "war");
  const border = weakestBorder(next.provinces, actor.id);

  if (atWar) {
    const mine = borderOf(next.provinces, actor.id, s.realm.id);
    const theirs = borderOf(next.provinces, s.realm.id, actor.id);
    if (theirs.length) {
      const target = [...theirs].sort((a, b) => a.fort + a.manpower / 4000 - (b.fort + b.manpower / 4000))[0];
      const def = playerFieldPower(next, target.id);
      const atk = host.strength * difficultyFactor(next) * (0.55 + host.morale / 250) * (0.92 + rng() * 0.16);
      const ratio = atk / Math.max(1, def);
      if (ratio >= 1.12 && host.men > 1400) {
        const defended = defendProvince(next, target.id, rng);
        next = defended.state;
        if (defended.lost) {
          next = transfer(next, target.id, actor.id, 46, 22);
          next = pushLog(next, notice(s, "sefer", "log.lost.title", "log.lost.body", { prov: target.nameKey, realm: actor.name }));
          next = {
            ...next,
            prestige: clamp(next.prestige - 4, 0, 100),
            relations: next.relations.map((r) =>
              r.realmId === actor.id ? { ...r, value: clamp(r.value - 8, -100, 100) } : r,
            ),
          };
        } else {
          next = pushLog(next, notice(s, "sefer", "log.held.title", "log.held.body", { prov: target.nameKey, realm: actor.name }));
        }
      } else if (ratio < 0.72 && mine.length && landHost(next.army) > 2000) {
        const back = [...mine].sort((a, b) => a.fort - b.fort)[0];
        const local = back.manpower + back.fort * 800;
        if (host.strength * 0.35 < local * 1.4 && rng() > 0.35) {
          next = transfer(next, back.id, s.realm.id, 48, 16);
          next = pushLog(next, notice(s, "sefer", "log.raid_win.title", "log.raid_win.body", { prov: back.nameKey, realm: actor.name }));
          next = { ...next, prestige: clamp(next.prestige + 3, 0, 100), treasury: next.treasury + Math.round(back.taxBase * 6) };
        }
      }
      if (ratio < 0.62) {
        next = {
          ...next,
          relations: next.relations.map((r) =>
            r.realmId === actor.id ? { ...r, value: clamp(r.value + 6, -100, 100) } : r,
          ),
        };
        next = pushLog(next, notice(s, "diplomasi", "log.ai_peace_seek.title", "log.ai_peace_seek.body", { realm: actor.name }));
      }
    }
    return next;
  }

  if (!border) {
    return develop(next, actor, lands, rng);
  }

  const foe = next.foreign.find((f) => f.id === border.foe) ?? (border.foe === s.realm.id ? null : null);
  const foeLands = next.provinces.filter((p) => p.ownerId === border.foe);
  const foeMen = foeLands.reduce((a, p) => a + p.manpower * 0.4, 0);
  const rel = next.relations.find((r) => r.realmId === actor.id);
  const hatesPlayer = border.foe === s.realm.id && (rel?.value ?? 0) < hateThreshold(actor.aiKey);
  const bold = actor.aiKey === "macar" || actor.aiKey === "akkoyunlu" || actor.aiKey === "memluk" ? 1.08 : actor.aiKey === "venedik" || actor.aiKey === "trabzon" ? 0.82 : 1;
  const hungry = host.strength * bold * difficultyFactor(next) > foeMen * 1.35 && host.treasury > 6000 && lands.length >= 2;

  if (border.foe !== s.realm.id && (hungry || (rng() > 0.62 && host.strength > foeMen))) {
    const prey = [...foeLands]
      .filter((p) => p.neighbors.some((n) => lands.some((l) => l.id === n)))
      .sort((a, b) => a.fort - b.fort)[0];
    if (prey && prey.fort <= 3) {
      const def = prey.manpower * 0.5 + prey.fort * 900 + prey.development * 50;
      const atk = host.strength * 0.62 * (0.9 + rng() * 0.2);
      if (atk > def * 1.05) {
        next = transfer(next, prey.id, actor.id, 44, 20);
        const foeName = foe?.name ?? ownerName(s, border.foe);
        next = pushLog(next, notice(s, "sefer", "log.ai_conquest.title", "log.ai_conquest.body", { prov: prey.nameKey, realm: actor.name, foe: foeName }));
        return next;
      }
    }
  }

  if (hatesPlayer && hungry && border.foe === s.realm.id) {
    next = {
      ...next,
      relations: next.relations.map((r) =>
        r.realmId === actor.id ? { ...r, treaty: "war", tradePact: false, value: clamp(r.value - 12, -100, 100) } : r,
      ),
    };
    next = pushLog(next, notice(s, "diplomasi", "log.ai_war.title", "log.ai_war.body", { realm: actor.name }));
    return next;
  }

  if (rng() > (actor.aiKey === "kirim" ? 0.62 : 0.78) && border.foe === s.realm.id && (rel?.treaty === "peace" || rel?.treaty === "truce")) {
    const edge = borderOf(next.provinces, s.realm.id, actor.id).sort((a, b) => a.fort - b.fort)[0];
    if (edge && host.men > 2200) {
      const loot = Math.round(edge.taxBase * (2 + rng() * 3));
      next = {
        ...next,
        provinces: next.provinces.map((p) =>
          p.id === edge.id
            ? { ...p, unrest: clamp(p.unrest + 6, 0, 100), prosperity: clamp(p.prosperity - 4, 8, 100), grain: clamp(p.grain - 5, 4, 100) }
            : p,
        ),
        relations: next.relations.map((r) =>
          r.realmId === actor.id ? { ...r, value: clamp(r.value - 6, -100, 100) } : r,
        ),
        treasury: Math.max(-30000, next.treasury - Math.min(loot, 400)),
      };
      next = pushLog(next, notice(s, "sefer", "log.raid.title", "log.raid.body", { prov: edge.nameKey, realm: actor.name }));
      return next;
    }
  }

  return develop(next, actor, lands, rng);
}

function develop(s: GameState, _actor: Realm, lands: Province[], rng: () => number): GameState {
  const weak = [...lands].sort((a, b) => a.fort + a.development / 10 - (b.fort + b.development / 10))[0];
  if (!weak) return s;
  const unrest = lands.filter((p) => p.unrest > 40);
  if (unrest.length && rng() > 0.4) {
    const p = unrest[0];
    return {
      ...s,
      provinces: s.provinces.map((x) =>
        x.id === p.id ? { ...x, unrest: clamp(x.unrest - 8, 0, 100), loyalty: clamp(x.loyalty + 4, 0, 100) } : x,
      ),
    };
  }
  if (weak.fort < 4 && rng() > 0.45) {
    return {
      ...s,
      provinces: s.provinces.map((x) => (x.id === weak.id ? { ...x, fort: Math.min(5, x.fort + 1) } : x)),
    };
  }
  return {
    ...s,
    provinces: s.provinces.map((x) =>
      x.id === weak.id
        ? {
            ...x,
            development: clamp(x.development + 1, 1, 30),
            prosperity: clamp(x.prosperity + 2, 8, 100),
            agriculture: clamp(x.agriculture + 1, 4, 100),
          }
        : x,
    ),
  };
}

export function garrisonProvince(s: GameState, provinceId: string): GameState | null {
  const p = s.provinces.find((x) => x.id === provinceId);
  if (!p || p.ownerId !== s.realm.id) return null;
  if (s.army.status === "campaign" || s.army.status === "siege") return null;
  const cost = 350 + p.fort * 40;
  if (s.treasury < cost) return null;
  return pushLog(
    {
      ...s,
      treasury: Math.round(s.treasury - cost),
      army: { ...s.army, status: "garrison", provinceId },
      provinces: s.provinces.map((x) =>
        x.id === provinceId
          ? { ...x, loyalty: clamp(x.loyalty + 6, 0, 100), unrest: clamp(x.unrest - 8, 0, 100), fort: Math.min(5, x.fort + (x.fort < 4 ? 1 : 0)) }
          : x,
      ),
      ledger: [{ id: nid("led"), year: s.year, kind: "gider", amount: -cost, noteKey: "ledger.garrison" }, ...s.ledger].slice(0, 80),
    },
    notice(s, "sefer", "log.garrison.title", "log.garrison.body", { prov: p.nameKey }),
  );
}

export function investProvince(s: GameState, provinceId: string): GameState | null {
  const p = s.provinces.find((x) => x.id === provinceId);
  if (!p || p.ownerId !== s.realm.id) return null;
  const cost = 500 + p.development * 40;
  if (s.treasury < cost) return null;
  if (p.development >= 28) return null;
  return pushLog(
    {
      ...s,
      treasury: Math.round(s.treasury - cost),
      provinces: s.provinces.map((x) =>
        x.id === provinceId
          ? {
              ...x,
              development: clamp(x.development + 1, 1, 30),
              taxBase: Math.round(x.taxBase + 8 + x.trade * 0.04),
              prosperity: clamp(x.prosperity + 3, 8, 100),
              agriculture: clamp(x.agriculture + 2, 4, 100),
              production: clamp(x.production + 2, 4, 100),
              manpower: Math.round(x.manpower + 60),
              unrest: clamp(x.unrest - 2, 0, 100),
            }
          : x,
      ),
      prestige: clamp(s.prestige + 1, 0, 100),
      ledger: [{ id: nid("led"), year: s.year, kind: "gider", amount: -cost, noteKey: "ledger.invest" }, ...s.ledger].slice(0, 80),
    },
    notice(s, "imar", "log.invest.title", "log.invest.body", { prov: p.nameKey }),
  );
}

export function sootheProvince(s: GameState, provinceId: string): GameState | null {
  const p = s.provinces.find((x) => x.id === provinceId);
  if (!p || p.ownerId !== s.realm.id) return null;
  const cost = 280;
  if (s.treasury < cost) return null;
  return {
    ...s,
    treasury: Math.round(s.treasury - cost),
    piety: clamp(s.piety + 1, 0, 100),
    provinces: s.provinces.map((x) =>
      x.id === provinceId ? { ...x, loyalty: clamp(x.loyalty + 8, 0, 100), unrest: clamp(x.unrest - 10, 0, 100) } : x,
    ),
    ledger: [{ id: nid("led"), year: s.year, kind: "gider", amount: -cost, noteKey: "ledger.soothe" }, ...s.ledger].slice(0, 80),
  };
}
