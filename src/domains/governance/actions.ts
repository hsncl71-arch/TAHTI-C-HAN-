import { clamp, nid } from "@/domains/ids";
import type { ChronicleEntry, GameState, InvestKind, PeaceDemand, ReformId, TaxBand } from "@/domains/types";
import { deriveHost } from "@/domains/military/realms";
import {
  INVEST_KINDS,
  REFORM_IDS,
  TAX_BAND_RATE,
  ensureGovernance,
  populationOf,
} from "@/domains/governance/model";

function notice(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): ChronicleEntry {
  return { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
}

function pushLog(s: GameState, entry: ChronicleEntry): GameState {
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

function spend(s: GameState, amount: number, noteKey: string): GameState {
  return {
    ...s,
    treasury: Math.round(s.treasury - amount),
    ledger: [{ id: nid("led"), year: s.year, kind: "gider", amount: -amount, noteKey }, ...s.ledger].slice(0, 80),
  };
}

const REFORM_COST = 1600;

export function setTaxBand(s: GameState, band: TaxBand): GameState {
  const next = ensureGovernance(s);
  const rate = TAX_BAND_RATE[band];
  const income = Math.round((rate / 0.12 - 1) * 100);
  const loyalty = band === "dusuk" ? 2 : band === "normal" ? 0 : band === "yuksek" ? -3 : -5;
  const logged = pushLog(
    { ...next, taxRate: rate, governance: { ...next.governance, taxBand: band } },
    notice(s, "hazine", "log.taxband.title", "log.taxband.body", { band, income, loyalty }),
  );
  return logged;
}

export function investKind(s: GameState, provinceId: string, kind: InvestKind): GameState | null {
  if (!INVEST_KINDS.includes(kind)) return null;
  const next = ensureGovernance(s);
  const p = next.provinces.find((x) => x.id === provinceId);
  if (!p || p.ownerId !== next.realm.id) return null;
  const have = next.governance.works[provinceId]?.[kind] ?? 0;
  if (have >= 3) return null;
  if (kind === "sur" && p.fort >= 5) return null;
  if (kind === "liman" && p.region === "orta_avrupa") return null;
  const cost = kind === "liman" || kind === "sur" ? 860 : kind === "yol" || kind === "kislak" ? 700 : 540;
  if (next.treasury < cost) return null;
  const paid = spend(next, cost, "ledger.invest");
  const works = {
    ...paid.governance.works,
    [provinceId]: { ...paid.governance.works[provinceId], [kind]: have + 1 },
  };
  const provinces = paid.provinces.map((x) => {
    if (x.id !== provinceId) return x;
    if (kind === "pazar") return { ...x, trade: clamp(x.trade + 5, 4, 100), customs: clamp(x.customs + 3, 0, 100), prosperity: clamp(x.prosperity + 2, 8, 100) };
    if (kind === "yol") return { ...x, trade: clamp(x.trade + 3, 4, 100), development: clamp(x.development + 1, 1, 30) };
    if (kind === "liman") {
      return {
        ...x,
        port: x.port === "none" ? ("harbor" as const) : x.port,
        customs: clamp(x.customs + 5, 0, 100),
        trade: clamp(x.trade + 4, 4, 100),
      };
    }
    if (kind === "depo") return { ...x, grain: clamp(x.grain + 10, 4, 100), agriculture: clamp(x.agriculture + 2, 4, 100) };
    if (kind === "kislak") return { ...x, manpower: x.manpower + 140, unrest: clamp(x.unrest - 3, 0, 100) };
    if (kind === "tarim") return { ...x, agriculture: clamp(x.agriculture + 6, 4, 100), grain: clamp(x.grain + 6, 4, 100) };
    return { ...x, fort: Math.min(5, x.fort + 1), unrest: clamp(x.unrest - 4, 0, 100) };
  });
  return pushLog(
    { ...paid, provinces, governance: { ...paid.governance, works } },
    notice(s, "imar", "log.invest_kind.title", "log.invest_kind.body", { prov: p.nameKey, kind }),
  );
}

export function suppressRevolt(s: GameState, provinceId: string): GameState | null {
  const next = ensureGovernance(s);
  const p = next.provinces.find((x) => x.id === provinceId);
  if (!p || p.ownerId !== next.realm.id || p.unrest < 32) return null;
  if (next.army.status === "campaign" || next.army.status === "siege") return null;
  const cost = 320 + Math.round(p.unrest * 4);
  if (next.treasury < cost) return null;
  const paid = spend(next, cost, "ledger.soothe");
  const garrisoned = paid.army.provinceId === provinceId || paid.army.status === "garrison";
  const cut = garrisoned ? 16 : 11;
  return pushLog(
    {
      ...paid,
      stability: clamp(paid.stability + 2, 0, 100),
      provinces: paid.provinces.map((x) =>
        x.id === provinceId
          ? { ...x, unrest: clamp(x.unrest - cut, 0, 100), loyalty: clamp(x.loyalty + 7, 5, 100) }
          : x,
      ),
    },
    notice(s, "isyan", "log.suppress.title", "log.suppress.body", { prov: p.nameKey, n: cut }),
  );
}

export function enactReform(s: GameState, reform: ReformId): GameState | null {
  if (!REFORM_IDS.includes(reform)) return null;
  const next = ensureGovernance(s);
  if (next.governance.reforms.includes(reform)) return null;
  if (reform === "derya" && next.army.navy < 8 && next.buildings.tersane < 1) return null;
  if (next.treasury < REFORM_COST) return null;
  let paid = spend(next, REFORM_COST, "ledger.reform");
  const reforms = [...paid.governance.reforms, reform];
  if (reform === "askeri") {
    paid = {
      ...paid,
      army: { ...paid.army, drill: clamp(paid.army.drill + 4, 0, 100), morale: clamp(paid.army.morale + 3, 10, 100) },
    };
  }
  if (reform === "idari") {
    paid = {
      ...paid,
      stability: clamp(paid.stability + 4, 0, 100),
      provinces: paid.provinces.map((p) =>
        p.ownerId === paid.realm.id ? { ...p, unrest: clamp(p.unrest - 2, 0, 100) } : p,
      ),
    };
  }
  if (reform === "diplomasi") {
    paid = {
      ...paid,
      relations: paid.relations.map((r) =>
        r.treaty === "war" ? r : { ...r, value: clamp(r.value + 4, -100, 100) },
      ),
      prestige: clamp(paid.prestige + 2, 0, 100),
    };
  }
  if (reform === "derya") {
    paid = {
      ...paid,
      provinces: paid.provinces.map((p) =>
        p.ownerId === paid.realm.id && p.port !== "none" ? { ...p, trade: clamp(p.trade + 3, 4, 100) } : p,
      ),
    };
  }
  return pushLog(
    { ...paid, governance: { ...paid.governance, reforms } },
    notice(s, "divan", "log.reform.title", "log.reform.body", { reform }),
  );
}

export function spyRealm(s: GameState, realmId: string, rng: () => number): GameState | null {
  const next = ensureGovernance(s);
  const foe = next.foreign.find((f) => f.id === realmId);
  if (!foe) return null;
  if (next.governance.lastSpyYear === next.year) return null;
  const cost = 420;
  if (next.treasury < cost) return null;
  const paid = spend(next, cost, "ledger.spy");
  const host = deriveHost(paid, foe);
  const success = rng() > 0.32;
  if (!success) {
    return pushLog(
      {
        ...paid,
        prestige: clamp(paid.prestige - 2, 0, 100),
        governance: { ...paid.governance, lastSpyYear: paid.year },
      },
      notice(s, "casus", "log.spy_fail.title", "log.spy_fail.body", { realm: foe.name }),
    );
  }
  const noise = 0.82 + rng() * 0.36;
  const intel = {
    year: paid.year,
    men: Math.round((host.men * noise) / 100) * 100,
    treasury: Math.round((host.treasury * noise) / 100) * 100,
    confidence: Math.round(clamp(70 + (rng() - 0.5) * 24, 40, 92)),
  };
  return pushLog(
    {
      ...paid,
      governance: {
        ...paid.governance,
        lastSpyYear: paid.year,
        spy: { ...paid.governance.spy, [realmId]: intel },
      },
    },
    notice(s, "casus", "log.spy.title", "log.spy.body", { realm: foe.name, men: intel.men, n: intel.confidence }),
  );
}

function borderProvince(s: GameState, provinceId: string, foe: string): boolean {
  const p = s.provinces.find((x) => x.id === provinceId);
  if (!p || p.ownerId !== foe) return false;
  return p.neighbors.some((n) => s.provinces.find((x) => x.id === n)?.ownerId === s.realm.id);
}

export function proposePeace(s: GameState, realmId: string, demand: PeaceDemand, provinceId?: string): GameState | null {
  const next = ensureGovernance(s);
  const rel = next.relations.find((r) => r.realmId === realmId);
  const foe = next.foreign.find((f) => f.id === realmId);
  if (!rel || !foe || rel.treaty !== "war") return null;
  const score = Math.round(next.governance.warScore[realmId] ?? 0);
  const name = foe.name;

  const acceptStatus = score > -25;
  const acceptGold = score >= 14;
  const acceptTribute = score >= 8;
  const acceptLand = score >= 28 && Boolean(provinceId) && borderProvince(next, provinceId!, realmId);

  const ok =
    demand === "status" ? acceptStatus : demand === "gold" ? acceptGold : demand === "tribute" ? acceptTribute : acceptLand;

  if (!ok) {
    return pushLog(next, notice(s, "diplomasi", "log.peace_refuse.title", "log.peace_refuse.body", { realm: name, demand, score }));
  }

  let state: GameState = {
    ...next,
    relations: next.relations.map((r) =>
      r.realmId === realmId ? { ...r, treaty: "truce", value: clamp(r.value + 8, -100, 100) } : r,
    ),
    governance: {
      ...next.governance,
      peaces: next.governance.peaces + 1,
      warScore: { ...next.governance.warScore, [realmId]: Math.round(score * 0.35) },
    },
    campaign:
      next.campaign && next.provinces.find((p) => p.id === next.campaign?.targetProvinceId)?.ownerId === realmId
        ? null
        : next.campaign,
    army:
      next.campaign && next.provinces.find((p) => p.id === next.campaign?.targetProvinceId)?.ownerId === realmId
        ? { ...next.army, status: "idle" }
        : next.army,
  };

  if (demand === "gold") {
    const gold = clamp(score * 90, 400, 4200);
    state = {
      ...state,
      treasury: state.treasury + gold,
      ledger: [{ id: nid("led"), year: state.year, kind: "gelir", amount: gold, noteKey: "ledger.loot" }, ...state.ledger].slice(0, 80),
    };
  }
  if (demand === "tribute") {
    state = {
      ...state,
      governance: {
        ...state.governance,
        tributes: { ...state.governance.tributes, [realmId]: { amount: 380, until: state.year + 4 } },
      },
    };
  }
  if (demand === "province" && provinceId) {
    const prov = state.provinces.find((p) => p.id === provinceId);
    state = {
      ...state,
      provinces: state.provinces.map((p) =>
        p.id === provinceId ? { ...p, ownerId: state.realm.id, loyalty: 42, unrest: clamp(p.unrest + 14, 0, 100) } : p,
      ),
      governance: {
        ...state.governance,
        conquests: state.governance.conquests + 1,
        population: {
          ...state.governance.population,
          [provinceId]: state.governance.population[provinceId] ?? (prov ? populationOf(prov) : 20000),
        },
      },
    };
  }
  return pushLog(state, notice(s, "diplomasi", "log.peace_deal.title", "log.peace_deal.body", { realm: name, demand, score }));
}
