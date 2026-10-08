import { clamp, nid, pick } from "@/domains/ids";
import type {
  ChronicleEntry,
  DivanItem,
  DivanStance,
  DivanTopic,
  GameState,
  Npc,
} from "@/domains/types";
import { holderOf, sitting } from "@/domains/divan/offices";
import { fillEconomy } from "@/domains/economy/model";
import { openLoan } from "@/domains/economy/credit";

export interface AgendaChoice {
  id: string;
  labelKey: string;
  apply: (s: GameState, payload: Record<string, string>, rng: () => number) => GameState;
}

export interface AgendaDef {
  key: string;
  topic: DivanTopic;
  proposerOffice: Parameters<typeof holderOf>[1];
  weight: (s: GameState) => number;
  titleKey: string;
  bodyKey: string;
  payload: (s: GameState) => Record<string, string>;
  choices: AgendaChoice[];
}

function log(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): GameState {
  const entry: ChronicleEntry = { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

function spend(s: GameState, amount: number, noteKey: string): GameState {
  return {
    ...s,
    treasury: Math.round(s.treasury - amount),
    ledger: [{ id: nid("led"), year: s.year, kind: amount >= 0 ? "gider" : "gelir", amount: -amount, noteKey }, ...s.ledger].slice(0, 80),
  };
}

function add(s: GameState, amount: number, noteKey: string): GameState {
  return {
    ...s,
    treasury: Math.round(s.treasury + amount),
    ledger: [{ id: nid("led"), year: s.year, kind: amount >= 0 ? "gelir" : "gider", amount, noteKey }, ...s.ledger].slice(0, 80),
  };
}

function owned(s: GameState) {
  return s.provinces.filter((p) => p.ownerId === s.realm.id);
}

function worstOwned(s: GameState) {
  return [...owned(s)].sort((a, b) => a.loyalty - b.loyalty)[0];
}

function coldestRelation(s: GameState) {
  return [...s.relations].sort((a, b) => a.value - b.value)[0];
}

export const AGENDA_CATALOG: AgendaDef[] = [
  {
    key: "savas_hudut",
    topic: "savas",
    proposerOffice: "sadrazam",
    weight: (s) => (s.relations.some((r) => r.treaty === "war" || r.value < -20) ? 12 : 3),
    titleKey: "agenda.savas_hudut.title",
    bodyKey: "agenda.savas_hudut.body",
    payload: (s) => {
      const r = coldestRelation(s);
      return { realm: r?.realmId ?? "", treaty: r?.treaty ?? "peace" };
    },
    choices: [
      {
        id: "escalate",
        labelKey: "agenda.savas_hudut.c1",
        apply: (s, payload) =>
          log(
            {
              ...s,
              prestige: clamp(s.prestige + 5, 0, 100),
              army: { ...s.army, morale: clamp(s.army.morale + 6, 10, 100) },
              relations: s.relations.map((r) =>
                r.realmId === payload.realm ? { ...r, treaty: "war", value: clamp(r.value - 12, -100, 100) } : r,
              ),
            },
            "divan",
            "agenda.savas_hudut.title",
            "agenda.savas_hudut.r1",
            { realm: payload.realm },
          ),
      },
      {
        id: "truce",
        labelKey: "agenda.savas_hudut.c2",
        apply: (s, payload) =>
          log(
            {
              ...s,
              prestige: clamp(s.prestige - 3, 0, 100),
              stability: clamp(s.stability + 4, 0, 100),
              relations: s.relations.map((r) =>
                r.realmId === payload.realm ? { ...r, treaty: "truce", value: clamp(r.value + 10, -100, 100) } : r,
              ),
            },
            "divan",
            "agenda.savas_hudut.title",
            "agenda.savas_hudut.r2",
            { realm: payload.realm },
          ),
      },
      {
        id: "watch",
        labelKey: "agenda.savas_hudut.c3",
        apply: (s) => log({ ...s, army: { ...s.army, morale: clamp(s.army.morale - 2, 10, 100) } }, "divan", "agenda.savas_hudut.title", "agenda.savas_hudut.r3"),
      },
    ],
  },
  {
    key: "savas_sefer",
    topic: "savas",
    proposerOffice: "kubbe_vezir",
    weight: (s) => (s.army.status === "idle" && s.treasury > 4000 ? 8 : 2),
    titleKey: "agenda.savas_sefer.title",
    bodyKey: "agenda.savas_sefer.body",
    payload: (s) => {
      const border = s.provinces.find((p) => p.ownerId !== s.realm.id && p.neighbors.some((n) => s.provinces.find((x) => x.id === n)?.ownerId === s.realm.id));
      return { prov: border?.nameKey ?? "prov.edirne", provinceId: border?.id ?? "" };
    },
    choices: [
      {
        id: "prepare",
        labelKey: "agenda.savas_sefer.c1",
        apply: (s, payload) => {
          const n = spend(s, 700, "ledger.divan_sefer");
          return log(
            { ...n, army: { ...n.army, morale: clamp(n.army.morale + 5, 10, 100) }, prestige: clamp(n.prestige + 3, 0, 100) },
            "divan",
            "agenda.savas_sefer.title",
            "agenda.savas_sefer.r1",
            { prov: payload.prov },
          );
        },
      },
      {
        id: "wait",
        labelKey: "agenda.savas_sefer.c2",
        apply: (s) => log({ ...s, prestige: clamp(s.prestige - 2, 0, 100) }, "divan", "agenda.savas_sefer.title", "agenda.savas_sefer.r2"),
      },
    ],
  },
  {
    key: "ekonomi_osr",
    topic: "ekonomi",
    proposerOffice: "defterdar",
    weight: (s) => (s.treasury < 6000 || s.taxRate > 0.16 ? 11 : 6),
    titleKey: "agenda.ekonomi_osr.title",
    bodyKey: "agenda.ekonomi_osr.body",
    payload: (s) => ({ rate: String(Math.round(s.taxRate * 100)) }),
    choices: [
      {
        id: "raise",
        labelKey: "agenda.ekonomi_osr.c1",
        apply: (s) =>
          log(
            {
              ...s,
              taxRate: clamp(s.taxRate + 0.02, 0.04, 0.24),
              provinces: s.provinces.map((p) => (p.ownerId === s.realm.id ? { ...p, loyalty: clamp(p.loyalty - 5, 5, 100) } : p)),
            },
            "divan",
            "agenda.ekonomi_osr.title",
            "agenda.ekonomi_osr.r1",
          ),
      },
      {
        id: "cut",
        labelKey: "agenda.ekonomi_osr.c2",
        apply: (s) =>
          log(
            {
              ...s,
              taxRate: clamp(s.taxRate - 0.02, 0.04, 0.24),
              stability: clamp(s.stability + 3, 0, 100),
              provinces: s.provinces.map((p) => (p.ownerId === s.realm.id ? { ...p, loyalty: clamp(p.loyalty + 4, 5, 100) } : p)),
            },
            "divan",
            "agenda.ekonomi_osr.title",
            "agenda.ekonomi_osr.r2",
          ),
      },
      {
        id: "hold",
        labelKey: "agenda.ekonomi_osr.c3",
        apply: (s) => log(s, "divan", "agenda.ekonomi_osr.title", "agenda.ekonomi_osr.r3"),
      },
    ],
  },
  {
    key: "ekonomi_masraf",
    topic: "ekonomi",
    proposerOffice: "defterdar",
    weight: (s) => (s.treasury < 3000 ? 10 : 4),
    titleKey: "agenda.ekonomi_masraf.title",
    bodyKey: "agenda.ekonomi_masraf.body",
    payload: () => ({}),
    choices: [
      {
        id: "trim",
        labelKey: "agenda.ekonomi_masraf.c1",
        apply: (s) => {
          const n = add(s, 900, "ledger.divan_trim");
          return log(
            {
              ...n,
              prestige: clamp(n.prestige - 3, 0, 100),
              npcs: n.npcs.map((x) => ({ ...x, loyalty: clamp(x.loyalty - 4, 0, 100), wealth: Math.max(100, x.wealth - 80) })),
            },
            "divan",
            "agenda.ekonomi_masraf.title",
            "agenda.ekonomi_masraf.r1",
          );
        },
      },
      {
        id: "borrow",
        labelKey: "agenda.ekonomi_masraf.c2",
        apply: (s) => {
          const next = openLoan(s, "galata", 1400);
          return log({ ...next, piety: clamp(next.piety - 1, 0, 100) }, "divan", "agenda.ekonomi_masraf.title", "agenda.ekonomi_masraf.r2");
        },
      },
    ],
  },
  {
    key: "isyan_eyalet",
    topic: "isyan",
    proposerOffice: "beylerbeyi",
    weight: (s) => {
      const low = owned(s).filter((p) => p.loyalty < 45).length;
      return low ? 9 + low * 2 : 2;
    },
    titleKey: "agenda.isyan_eyalet.title",
    bodyKey: "agenda.isyan_eyalet.body",
    payload: (s) => {
      const p = worstOwned(s);
      return { prov: p?.nameKey ?? "prov.edirne", provinceId: p?.id ?? "" };
    },
    choices: [
      {
        id: "garrison",
        labelKey: "agenda.isyan_eyalet.c1",
        apply: (s, payload) => {
          const n = spend(s, 650, "ledger.divan_garrison");
          return log(
            {
              ...n,
              army: { ...n.army, azab: Math.max(0, n.army.azab - 400) },
              provinces: n.provinces.map((p) => (p.id === payload.provinceId ? { ...p, loyalty: clamp(p.loyalty + 14, 5, 100), fort: Math.min(5, p.fort + 1) } : p)),
            },
            "divan",
            "agenda.isyan_eyalet.title",
            "agenda.isyan_eyalet.r1",
            { prov: payload.prov },
          );
        },
      },
      {
        id: "relief",
        labelKey: "agenda.isyan_eyalet.c2",
        apply: (s, payload) => {
          const n = spend(s, 900, "ledger.relief");
          return log(
            {
              ...n,
              piety: clamp(n.piety + 3, 0, 100),
              provinces: n.provinces.map((p) => (p.id === payload.provinceId ? { ...p, loyalty: clamp(p.loyalty + 10, 5, 100) } : p)),
            },
            "divan",
            "agenda.isyan_eyalet.title",
            "agenda.isyan_eyalet.r2",
            { prov: payload.prov },
          );
        },
      },
      {
        id: "harsh",
        labelKey: "agenda.isyan_eyalet.c3",
        apply: (s, payload) =>
          log(
            {
              ...s,
              piety: clamp(s.piety - 5, 0, 100),
              prestige: clamp(s.prestige + 2, 0, 100),
              provinces: s.provinces.map((p) =>
                p.id === payload.provinceId ? { ...p, loyalty: clamp(p.loyalty + 8, 5, 100), manpower: Math.max(400, p.manpower - 300) } : p,
              ),
            },
            "divan",
            "agenda.isyan_eyalet.title",
            "agenda.isyan_eyalet.r3",
            { prov: payload.prov },
          ),
      },
    ],
  },
  {
    key: "isyan_ocak",
    topic: "isyan",
    proposerOffice: "yeniceri_agasi",
    weight: (s) => (s.army.morale < 55 || s.army.janissary > 9000 ? 9 : 3),
    titleKey: "agenda.isyan_ocak.title",
    bodyKey: "agenda.isyan_ocak.body",
    payload: () => ({}),
    choices: [
      {
        id: "pay",
        labelKey: "agenda.isyan_ocak.c1",
        apply: (s) => {
          const cost = Math.round(s.army.janissary * 0.28);
          const n = spend(s, cost, "ledger.ulufe");
          return log({ ...n, army: { ...n.army, morale: clamp(n.army.morale + 9, 10, 100) }, stability: clamp(n.stability + 4, 0, 100) }, "divan", "agenda.isyan_ocak.title", "agenda.isyan_ocak.r1");
        },
      },
      {
        id: "drill",
        labelKey: "agenda.isyan_ocak.c2",
        apply: (s) => log({ ...s, army: { ...s.army, morale: clamp(s.army.morale + 3, 10, 100) }, prestige: clamp(s.prestige + 2, 0, 100) }, "divan", "agenda.isyan_ocak.title", "agenda.isyan_ocak.r2"),
      },
      {
        id: "refuse",
        labelKey: "agenda.isyan_ocak.c3",
        apply: (s) => log({ ...s, army: { ...s.army, morale: clamp(s.army.morale - 10, 10, 100) }, stability: clamp(s.stability - 7, 0, 100) }, "divan", "agenda.isyan_ocak.title", "agenda.isyan_ocak.r3"),
      },
    ],
  },
  {
    key: "diplomasi_ahid",
    topic: "diplomasi",
    proposerOffice: "nisanci",
    weight: (s) => 7,
    titleKey: "agenda.diplomasi_ahid.title",
    bodyKey: "agenda.diplomasi_ahid.body",
    payload: (s) => {
      const r = coldestRelation(s);
      return { realm: r?.realmId ?? "" };
    },
    choices: [
      {
        id: "envoy",
        labelKey: "agenda.diplomasi_ahid.c1",
        apply: (s, payload) => {
          const n = spend(s, 500, "ledger.gift");
          return log(
            {
              ...n,
              relations: n.relations.map((r) => (r.realmId === payload.realm ? { ...r, value: clamp(r.value + 14, -100, 100) } : r)),
            },
            "divan",
            "agenda.diplomasi_ahid.title",
            "agenda.diplomasi_ahid.r1",
            { realm: payload.realm },
          );
        },
      },
      {
        id: "threaten",
        labelKey: "agenda.diplomasi_ahid.c2",
        apply: (s, payload) =>
          log(
            {
              ...s,
              prestige: clamp(s.prestige + 4, 0, 100),
              relations: s.relations.map((r) => (r.realmId === payload.realm ? { ...r, value: clamp(r.value - 10, -100, 100) } : r)),
            },
            "divan",
            "agenda.diplomasi_ahid.title",
            "agenda.diplomasi_ahid.r2",
            { realm: payload.realm },
          ),
      },
    ],
  },
  {
    key: "diplomasi_ittifak",
    topic: "diplomasi",
    proposerOffice: "reisulkuttab",
    weight: (s) => (s.year >= 1524 ? 6 : 0),
    titleKey: "agenda.diplomasi_ittifak.title",
    bodyKey: "agenda.diplomasi_ittifak.body",
    payload: (s) => {
      const r = [...s.relations].sort((a, b) => b.value - a.value)[0];
      return { realm: r?.realmId ?? "kirim" };
    },
    choices: [
      {
        id: "ally",
        labelKey: "agenda.diplomasi_ittifak.c1",
        apply: (s, payload) =>
          log(
            {
              ...s,
              prestige: clamp(s.prestige + 3, 0, 100),
              relations: s.relations.map((r) =>
                r.realmId === payload.realm ? { ...r, treaty: "alliance", value: clamp(r.value + 10, -100, 100) } : r,
              ),
            },
            "divan",
            "agenda.diplomasi_ittifak.title",
            "agenda.diplomasi_ittifak.r1",
            { realm: payload.realm },
          ),
      },
      {
        id: "alone",
        labelKey: "agenda.diplomasi_ittifak.c2",
        apply: (s) => log({ ...s, prestige: clamp(s.prestige + 1, 0, 100) }, "divan", "agenda.diplomasi_ittifak.title", "agenda.diplomasi_ittifak.r2"),
      },
    ],
  },
  {
    key: "sehir_imar",
    topic: "sehir",
    proposerOffice: "nisanci",
    weight: () => 6,
    titleKey: "agenda.sehir_imar.title",
    bodyKey: "agenda.sehir_imar.body",
    payload: (s) => ({ prov: s.provinces.find((p) => p.id === s.realm.capitalId)?.nameKey ?? "prov.konstantiniyye", provinceId: s.realm.capitalId }),
    choices: [
      {
        id: "build",
        labelKey: "agenda.sehir_imar.c1",
        apply: (s, payload) => {
          const n = spend(s, 1100, "ledger.build");
          return log(
            {
              ...n,
              prestige: clamp(n.prestige + 5, 0, 100),
              buildings: { ...n.buildings, cami: n.buildings.cami + (s.year % 2 === 0 ? 1 : 0), kervansaray: n.buildings.kervansaray + (s.year % 2 === 1 ? 1 : 0) },
              provinces: n.provinces.map((p) => (p.id === payload.provinceId ? { ...p, development: clamp(p.development + 1, 1, 30), loyalty: clamp(p.loyalty + 4, 5, 100) } : p)),
            },
            "divan",
            "agenda.sehir_imar.title",
            "agenda.sehir_imar.r1",
            { prov: payload.prov },
          );
        },
      },
      {
        id: "later",
        labelKey: "agenda.sehir_imar.c2",
        apply: (s) => log({ ...s, prestige: clamp(s.prestige - 2, 0, 100) }, "divan", "agenda.sehir_imar.title", "agenda.sehir_imar.r2"),
      },
    ],
  },
  {
    key: "sehir_nizam",
    topic: "sehir",
    proposerOffice: "kazasker_rumeli",
    weight: (s) => (s.stability < 50 ? 8 : 4),
    titleKey: "agenda.sehir_nizam.title",
    bodyKey: "agenda.sehir_nizam.body",
    payload: () => ({}),
    choices: [
      {
        id: "kadı",
        labelKey: "agenda.sehir_nizam.c1",
        apply: (s) => {
          const n = spend(s, 400, "ledger.divan_kadi");
          return log({ ...n, stability: clamp(n.stability + 6, 0, 100), piety: clamp(n.piety + 3, 0, 100) }, "divan", "agenda.sehir_nizam.title", "agenda.sehir_nizam.r1");
        },
      },
      {
        id: "watchmen",
        labelKey: "agenda.sehir_nizam.c2",
        apply: (s) => log({ ...s, stability: clamp(s.stability + 3, 0, 100), army: { ...s.army, azab: s.army.azab + 200 } }, "divan", "agenda.sehir_nizam.title", "agenda.sehir_nizam.r2"),
      },
    ],
  },
  {
    key: "ticaret_gumruk",
    topic: "ticaret",
    proposerOffice: "defterdar",
    weight: () => 7,
    titleKey: "agenda.ticaret_gumruk.title",
    bodyKey: "agenda.ticaret_gumruk.body",
    payload: () => ({}),
    choices: [
      {
        id: "open",
        labelKey: "agenda.ticaret_gumruk.c1",
        apply: (s) => {
          const eco = fillEconomy(s.economy);
          return log(
            add(
              {
                ...s,
                economy: { ...eco, tariffRate: clamp(eco.tariffRate - 0.02, 0.02, 0.18) },
                provinces: s.provinces.map((p) =>
                  p.ownerId === s.realm.id
                    ? { ...p, development: clamp(p.development + (p.region === "ada" || p.id === s.realm.capitalId ? 1 : 0), 1, 30), trade: clamp(p.trade + 5, 8, 100) }
                    : p,
                ),
              },
              800,
              "ledger.silk",
            ),
            "divan",
            "agenda.ticaret_gumruk.title",
            "agenda.ticaret_gumruk.r1",
          );
        },
      },
      {
        id: "tariff",
        labelKey: "agenda.ticaret_gumruk.c2",
        apply: (s) => {
          const eco = fillEconomy(s.economy);
          return log(
            add(
              {
                ...s,
                prestige: clamp(s.prestige - 2, 0, 100),
                economy: { ...eco, tariffRate: clamp(eco.tariffRate + 0.03, 0.02, 0.18) },
                provinces: s.provinces.map((p) =>
                  p.ownerId === s.realm.id ? { ...p, trade: clamp(p.trade - 3, 8, 100) } : p,
                ),
              },
              1300,
              "ledger.tariff",
            ),
            "divan",
            "agenda.ticaret_gumruk.title",
            "agenda.ticaret_gumruk.r2",
          );
        },
      },
    ],
  },
  {
    key: "ticaret_kervan",
    topic: "ticaret",
    proposerOffice: "beylerbeyi",
    weight: (s) => (s.buildings.kervansaray > 0 ? 6 : 3),
    titleKey: "agenda.ticaret_kervan.title",
    bodyKey: "agenda.ticaret_kervan.body",
    payload: () => ({}),
    choices: [
      {
        id: "escort",
        labelKey: "agenda.ticaret_kervan.c1",
        apply: (s) => {
          const n = spend(s, 450, "ledger.divan_escort");
          return log(add({ ...n, army: { ...n.army, sipahi: Math.max(0, n.army.sipahi - 200) } }, 1100, "ledger.silk"), "divan", "agenda.ticaret_kervan.title", "agenda.ticaret_kervan.r1");
        },
      },
      {
        id: "risk",
        labelKey: "agenda.ticaret_kervan.c2",
        apply: (s, _p, rng) => {
          const ok = rng() > 0.4;
          return log(ok ? add(s, 600, "ledger.silk") : { ...s, prestige: clamp(s.prestige - 3, 0, 100) }, "divan", "agenda.ticaret_kervan.title", ok ? "agenda.ticaret_kervan.r2" : "agenda.ticaret_kervan.r3");
        },
      },
    ],
  },
  {
    key: "ordu_tertib",
    topic: "ordu",
    proposerOffice: "yeniceri_agasi",
    weight: (s) => (s.army.status === "idle" ? 7 : 3),
    titleKey: "agenda.ordu_tertib.title",
    bodyKey: "agenda.ordu_tertib.body",
    payload: () => ({}),
    choices: [
      {
        id: "raise",
        labelKey: "agenda.ordu_tertib.c1",
        apply: (s) => {
          const n = spend(s, 8 * 500, "ledger.raise");
          return log({ ...n, army: { ...n.army, janissary: n.army.janissary + 500 } }, "divan", "agenda.ordu_tertib.title", "agenda.ordu_tertib.r1");
        },
      },
      {
        id: "navy",
        labelKey: "agenda.ordu_tertib.c2",
        apply: (s) => {
          const n = spend(s, 25 * 8, "ledger.raise");
          return log({ ...n, army: { ...n.army, navy: n.army.navy + 8 } }, "divan", "agenda.ordu_tertib.title", "agenda.ordu_tertib.r2");
        },
      },
      {
        id: "none",
        labelKey: "agenda.ordu_tertib.c3",
        apply: (s) => log(s, "divan", "agenda.ordu_tertib.title", "agenda.ordu_tertib.r3"),
      },
    ],
  },
  {
    key: "ordu_donanma",
    topic: "ordu",
    proposerOffice: "kaptan",
    weight: (s) => (s.army.navy < 40 ? 8 : 4),
    titleKey: "agenda.ordu_donanma.title",
    bodyKey: "agenda.ordu_donanma.body",
    payload: () => ({}),
    choices: [
      {
        id: "tersane",
        labelKey: "agenda.ordu_donanma.c1",
        apply: (s) => {
          const n = spend(s, 1600, "ledger.build");
          return log({ ...n, buildings: { ...n.buildings, tersane: n.buildings.tersane + 1 }, army: { ...n.army, navy: n.army.navy + 6 } }, "divan", "agenda.ordu_donanma.title", "agenda.ordu_donanma.r1");
        },
      },
      {
        id: "later",
        labelKey: "agenda.ordu_donanma.c2",
        apply: (s) => log({ ...s, prestige: clamp(s.prestige - 2, 0, 100) }, "divan", "agenda.ordu_donanma.title", "agenda.ordu_donanma.r2"),
      },
    ],
  },
  {
    key: "hanedan_sancak",
    topic: "hanedan",
    proposerOffice: "sadrazam",
    weight: (s) => (s.members.some((m) => m.alive && m.role === "sehzade" && m.location === s.realm.capitalId && s.year - m.birthYear >= 12) ? 8 : 1),
    titleKey: "agenda.hanedan_sancak.title",
    bodyKey: "agenda.hanedan_sancak.body",
    payload: (s) => {
      const heir = s.members.find((m) => m.alive && m.role === "sehzade");
      const sanjak = s.provinces.find((p) => p.ownerId === s.realm.id && p.id !== s.realm.capitalId);
      return { name: heir?.givenName ?? "", memberId: heir?.id ?? "", provinceId: sanjak?.id ?? "", prov: sanjak?.nameKey ?? "" };
    },
    choices: [
      {
        id: "send",
        labelKey: "agenda.hanedan_sancak.c1",
        apply: (s, payload) =>
          log(
            {
              ...s,
              stability: clamp(s.stability + 5, 0, 100),
              members: s.members.map((m) => (m.id === payload.memberId ? { ...m, location: payload.provinceId || m.location } : m)),
            },
            "divan",
            "agenda.hanedan_sancak.title",
            "agenda.hanedan_sancak.r1",
            { name: payload.name, prov: payload.prov },
          ),
      },
      {
        id: "keep",
        labelKey: "agenda.hanedan_sancak.c2",
        apply: (s) => log({ ...s, prestige: clamp(s.prestige + 2, 0, 100), stability: clamp(s.stability - 3, 0, 100) }, "divan", "agenda.hanedan_sancak.title", "agenda.hanedan_sancak.r2"),
      },
    ],
  },
  {
    key: "hanedan_valide",
    topic: "hanedan",
    proposerOffice: "seyhulislam",
    weight: (s) => (s.members.some((m) => m.alive && m.role === "valide") ? 5 : 0),
    titleKey: "agenda.hanedan_valide.title",
    bodyKey: "agenda.hanedan_valide.body",
    payload: (s) => ({ name: s.members.find((m) => m.alive && m.role === "valide")?.givenName ?? "" }),
    choices: [
      {
        id: "heed",
        labelKey: "agenda.hanedan_valide.c1",
        apply: (s) => {
          const n = spend(s, 350, "ledger.coronation_gift");
          const valide = s.members.find((m) => m.alive && m.role === "valide");
          return log(
            {
              ...n,
              piety: clamp(n.piety + 4, 0, 100),
              courtTies: n.courtTies.map((t) => (t.targetId === valide?.id ? { ...t, affinity: clamp(t.affinity + 8, 0, 100), trust: clamp(t.trust + 6, 0, 100) } : t)),
            },
            "divan",
            "agenda.hanedan_valide.title",
            "agenda.hanedan_valide.r1",
            { name: s.members.find((m) => m.role === "valide")?.givenName ?? "" },
          );
        },
      },
      {
        id: "distance",
        labelKey: "agenda.hanedan_valide.c2",
        apply: (s) => {
          const valide = s.members.find((m) => m.alive && m.role === "valide");
          return log(
            {
              ...s,
              prestige: clamp(s.prestige + 2, 0, 100),
              courtTies: s.courtTies.map((t) => (t.targetId === valide?.id ? { ...t, affinity: clamp(t.affinity - 8, 0, 100) } : t)),
            },
            "divan",
            "agenda.hanedan_valide.title",
            "agenda.hanedan_valide.r2",
          );
        },
      },
    ],
  },
];

export function agendaByKey(key: string): AgendaDef | undefined {
  return AGENDA_CATALOG.find((a) => a.key === key);
}

function voteOf(npc: Npc, proposer: Npc | undefined, s: GameState, def: AgendaDef): DivanStance {
  if (proposer && npc.id === proposer.id) return "support";
  if (proposer && npc.rivals.includes(proposer.id)) return "oppose";
  if (proposer && npc.allies.includes(proposer.id)) return "support";
  if (def.topic === "ordu" && npc.faction === "ocak") return "support";
  if (def.topic === "ekonomi" && npc.faction === "hazine") return "support";
  if (def.topic === "savas" && npc.faction === "ulema") return "caution";
  if (def.topic === "hanedan" && npc.faction === "ulema") return "caution";
  if (npc.loyalty > 78) return "caution";
  if (npc.ambition > 70 && proposer && proposer.office === "sadrazam") return "oppose";
  if (s.ruler.stats.siyaset > 12 && npc.favor > 60) return "support";
  return npc.competence > 70 ? "caution" : "support";
}

export function buildAgenda(s: GameState, rng: () => number, count = 4): DivanItem[] {
  const pool = AGENDA_CATALOG.filter((d) => d.weight(s) > 0);
  const picked: DivanItem[] = [];
  const used = new Set<string>();
  const topics = new Set<DivanTopic>();
  const max = Math.min(count, pool.length);
  for (let i = 0; i < max; i += 1) {
    const open = pool.filter((d) => !used.has(d.key) && !topics.has(d.topic));
    const source = open.length ? open : pool.filter((d) => !used.has(d.key));
    if (!source.length) break;
    const total = source.reduce((a, d) => a + d.weight(s), 0);
    let roll = rng() * total;
    let chosen = source[0];
    for (const d of source) {
      roll -= d.weight(s);
      if (roll <= 0) {
        chosen = d;
        break;
      }
    }
    used.add(chosen.key);
    topics.add(chosen.topic);
    const proposer = holderOf(s, chosen.proposerOffice) ?? pick(rng, sitting(s).map((x) => x.npc));
    const votes = sitting(s).map(({ npc }) => ({ npcId: npc.id, stance: voteOf(npc, proposer, s, chosen) }));
    picked.push({
      id: nid("ag"),
      key: chosen.key,
      topic: chosen.topic,
      year: s.year,
      proposedBy: proposer?.id ?? "",
      titleKey: chosen.titleKey,
      bodyKey: chosen.bodyKey,
      payload: chosen.payload(s),
      votes,
    });
  }
  return picked;
}
