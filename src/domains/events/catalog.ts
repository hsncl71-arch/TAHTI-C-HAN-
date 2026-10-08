import { clamp, nid, pick } from "@/domains/ids";
import type { ChronicleEntry, CrisisKind, GameState, PendingEvent } from "@/domains/types";
import { makeMember } from "@/domains/dynasty/member";
import { canRomance } from "@/domains/dynasty/bonds";
import { fillEconomy } from "@/domains/economy/model";
import { totalDebt } from "@/domains/economy/budget";
import { crisisByKey } from "@/domains/crisis/catalog";

export interface EventChoice {
  id: string;
  labelKey: string;
  hintKey?: string;
  apply: (s: GameState, rng: () => number) => GameState;
}

export interface EventDef {
  key: string;
  weight: (s: GameState) => number;
  titleKey: string;
  bodyKey: string;
  choices: EventChoice[];
}

function log(s: GameState, kind: string, titleKey: string, bodyKey: string, vars: ChronicleEntry["vars"] = {}): GameState {
  const entry: ChronicleEntry = { id: nid("ch"), year: s.year, kind, titleKey, bodyKey, vars };
  return { ...s, chronicle: [entry, ...s.chronicle].slice(0, 200) };
}

function addTreasury(s: GameState, amount: number, noteKey: string): GameState {
  return {
    ...s,
    treasury: Math.round(s.treasury + amount),
    ledger: [{ id: nid("led"), year: s.year, kind: amount >= 0 ? "gelir" : "gider", amount, noteKey }, ...s.ledger].slice(0, 80),
  };
}

export const EVENT_CATALOG: EventDef[] = [
  {
    key: "tahta_cikis",
    weight: () => 0,
    titleKey: "ev.tahta.title",
    bodyKey: "ev.tahta.body",
    choices: [
      {
        id: "adalet",
        labelKey: "ev.tahta.c1",
        apply: (s) => log({ ...s, stability: clamp(s.stability + 8, 0, 100), piety: clamp(s.piety + 4, 0, 100) }, "saltanat", "ev.tahta.title", "ev.tahta.r1"),
      },
      {
        id: "fatih",
        labelKey: "ev.tahta.c2",
        apply: (s) => log({ ...s, prestige: clamp(s.prestige + 10, 0, 100), army: { ...s.army, morale: clamp(s.army.morale + 6, 0, 100) } }, "saltanat", "ev.tahta.title", "ev.tahta.r2"),
      },
      {
        id: "hazine",
        labelKey: "ev.tahta.c3",
        apply: (s) => log(addTreasury(s, -800, "ledger.coronation_gift"), "saltanat", "ev.tahta.title", "ev.tahta.r3"),
      },
    ],
  },
  {
    key: "yeni_ceri_ulufe",
    weight: (s) => (s.army.janissary > 6000 ? 8 : 3),
    titleKey: "ev.ulufe.title",
    bodyKey: "ev.ulufe.body",
    choices: [
      {
        id: "pay",
        labelKey: "ev.ulufe.c1",
        apply: (s) => {
          const n = addTreasury(s, -Math.round(s.army.janissary * 0.4), "ledger.ulufe");
          return log({ ...n, army: { ...n.army, morale: clamp(n.army.morale + 8, 0, 100) }, stability: clamp(n.stability + 4, 0, 100) }, "ordu", "ev.ulufe.title", "ev.ulufe.r1");
        },
      },
      {
        id: "refuse",
        labelKey: "ev.ulufe.c2",
        apply: (s) => log({ ...s, army: { ...s.army, morale: clamp(s.army.morale - 12, 0, 100) }, stability: clamp(s.stability - 8, 0, 100) }, "ordu", "ev.ulufe.title", "ev.ulufe.r2"),
      },
      {
        id: "half",
        labelKey: "ev.ulufe.c3",
        apply: (s) => {
          const n = addTreasury(s, -Math.round(s.army.janissary * 0.2), "ledger.ulufe");
          return log({ ...n, army: { ...n.army, morale: clamp(n.army.morale + 2, 0, 100) } }, "ordu", "ev.ulufe.title", "ev.ulufe.r3");
        },
      },
    ],
  },
  {
    key: "hasat",
    weight: () => 10,
    titleKey: "ev.hasat.title",
    bodyKey: "ev.hasat.body",
    choices: [
      {
        id: "store",
        labelKey: "ev.hasat.c1",
        apply: (s) => {
          const eco = fillEconomy(s.economy);
          return log(
            addTreasury(
              {
                ...s,
                stability: clamp(s.stability + 3, 0, 100),
                economy: { ...eco, grainReserve: eco.grainReserve + 420, famineStreak: 0 },
                provinces: s.provinces.map((p) =>
                  p.ownerId === s.realm.id ? { ...p, grain: clamp(p.grain + 8, 8, 100), prosperity: clamp(p.prosperity + 3, 8, 100) } : p,
                ),
              },
              900,
              "ledger.harvest",
            ),
            "ekonomi",
            "ev.hasat.title",
            "ev.hasat.r1",
          );
        },
      },
      {
        id: "feast",
        labelKey: "ev.hasat.c2",
        apply: (s) => log({ ...s, prestige: clamp(s.prestige + 6, 0, 100), piety: clamp(s.piety + 3, 0, 100) }, "saray", "ev.hasat.title", "ev.hasat.r2"),
      },
    ],
  },
  {
    key: "kıtlık",
    weight: (s) => {
      const food = s.economy?.people?.foodAccess ?? 64;
      const famine = s.economy?.famineStreak ?? 0;
      if (food < 35) return 14 + famine * 3;
      return s.stability < 40 ? 7 : 2;
    },
    titleKey: "ev.kitlik.title",
    bodyKey: "ev.kitlik.body",
    choices: [
      {
        id: "relief",
        labelKey: "ev.kitlik.c1",
        apply: (s) => {
          const n = addTreasury(s, -1200, "ledger.relief");
          const eco = fillEconomy(n.economy);
          return log({
            ...n,
            stability: clamp(n.stability + 6, 0, 100),
            piety: clamp(n.piety + 5, 0, 100),
            economy: {
              ...eco,
              grainReserve: eco.grainReserve + 280,
              famineStreak: Math.max(0, eco.famineStreak - 1),
              people: { ...eco.people, foodAccess: clamp(eco.people.foodAccess + 8, 0, 100) },
            },
          }, "ekonomi", "ev.kitlik.title", "ev.kitlik.r1");
        },
      },
      {
        id: "endure",
        labelKey: "ev.kitlik.c2",
        apply: (s) => ({
          ...log(s, "ekonomi", "ev.kitlik.title", "ev.kitlik.r2"),
          stability: clamp(s.stability - 10, 0, 100),
          provinces: s.provinces.map((p) => p.ownerId === s.realm.id ? { ...p, loyalty: clamp(p.loyalty - 8, 0, 100), unrest: clamp(p.unrest + 10, 0, 100), grain: clamp(p.grain - 10, 8, 100) } : p),
        }),
      },
    ],
  },
  {
    key: "vezir_rusvet",
    weight: () => 6,
    titleKey: "ev.rusvet.title",
    bodyKey: "ev.rusvet.body",
    choices: [
      {
        id: "dismiss",
        labelKey: "ev.rusvet.c1",
        apply: (s) => {
          const sad = s.court.find((c) => c.office === "sadrazam");
          const next = {
            ...s,
            prestige: clamp(s.prestige + 5, 0, 100),
            npcs: s.npcs.map((n) => (n.id === sad?.npcId ? { ...n, loyalty: clamp(n.loyalty - 30, 0, 100), competence: clamp(n.competence - 8, 1, 100) } : n)),
          };
          return log(next, "divan", "ev.rusvet.title", "ev.rusvet.r1");
        },
      },
      {
        id: "ignore",
        labelKey: "ev.rusvet.c2",
        apply: (s) => log(addTreasury({ ...s, stability: clamp(s.stability - 6, 0, 100) }, 400, "ledger.bribe"), "divan", "ev.rusvet.title", "ev.rusvet.r2"),
      },
    ],
  },
  {
    key: "sinir_akini",
    weight: (s) => (s.relations.some((r) => r.treaty === "war" || r.value < -20) ? 9 : 4),
    titleKey: "ev.akin.title",
    bodyKey: "ev.akin.body",
    choices: [
      {
        id: "retaliate",
        labelKey: "ev.akin.c1",
        apply: (s) => log({ ...s, prestige: clamp(s.prestige + 4, 0, 100), army: { ...s.army, morale: clamp(s.army.morale + 4, 0, 100) } }, "ordu", "ev.akin.title", "ev.akin.r1"),
      },
      {
        id: "fortify",
        labelKey: "ev.akin.c2",
        apply: (s) => {
          const n = addTreasury(s, -600, "ledger.fortify");
          return log({ ...n, provinces: n.provinces.map((p) => ({ ...p, fort: p.ownerId === n.realm.id ? Math.min(5, p.fort + (p.id === n.realm.capitalId ? 0 : 0)) : p.fort })) }, "ordu", "ev.akin.title", "ev.akin.r2");
        },
      },
    ],
  },
  {
    key: "sehzade_ihtilaf",
    weight: (s) => (s.members.filter((m) => m.alive && m.role === "sehzade").length >= 2 ? 7 : 0),
    titleKey: "ev.ihtilaf.title",
    bodyKey: "ev.ihtilaf.body",
    choices: [
      {
        id: "sanjak",
        labelKey: "ev.ihtilaf.c1",
        apply: (s) => {
          const heirs = s.members.filter((m) => m.alive && m.role === "sehzade");
          const younger = heirs.sort((a, b) => b.birthYear - a.birthYear)[0];
          const sanjak = s.provinces.find((p) => p.ownerId === s.realm.id && p.id !== s.realm.capitalId);
          return log({
            ...s,
            members: s.members.map((m) => m.id === younger?.id && sanjak ? { ...m, location: sanjak.id } : m),
            stability: clamp(s.stability + 5, 0, 100),
          }, "hanedan", "ev.ihtilaf.title", "ev.ihtilaf.r1");
        },
      },
      {
        id: "favor",
        labelKey: "ev.ihtilaf.c2",
        apply: (s) => log({ ...s, prestige: clamp(s.prestige - 4, 0, 100), stability: clamp(s.stability - 6, 0, 100) }, "hanedan", "ev.ihtilaf.title", "ev.ihtilaf.r2"),
      },
    ],
  },
  {
    key: "alim_gelir",
    weight: () => 5,
    titleKey: "ev.alim.title",
    bodyKey: "ev.alim.body",
    choices: [
      {
        id: "patron",
        labelKey: "ev.alim.c1",
        apply: (s) => {
          const n = addTreasury(s, -500, "ledger.patron");
          return log({ ...n, piety: clamp(n.piety + 8, 0, 100), ruler: { ...n.ruler, stats: { ...n.ruler.stats, ilim: clamp(n.ruler.stats.ilim + 1, 1, 20) } } }, "saray", "ev.alim.title", "ev.alim.r1");
        },
      },
      {
        id: "dismiss",
        labelKey: "ev.alim.c2",
        apply: (s) => log({ ...s, piety: clamp(s.piety - 3, 0, 100) }, "saray", "ev.alim.title", "ev.alim.r2"),
      },
    ],
  },
  {
    key: "cami_dilekce",
    weight: () => 5,
    titleKey: "ev.cami.title",
    bodyKey: "ev.cami.body",
    choices: [
      {
        id: "build",
        labelKey: "ev.cami.c1",
        apply: (s) => {
          const n = addTreasury(s, -1800, "ledger.mosque");
          return log({ ...n, piety: clamp(n.piety + 12, 0, 100), prestige: clamp(n.prestige + 6, 0, 100), buildings: { ...n.buildings, cami: n.buildings.cami + 1 } }, "imar", "ev.cami.title", "ev.cami.r1");
        },
      },
      {
        id: "later",
        labelKey: "ev.cami.c2",
        apply: (s) => log({ ...s, piety: clamp(s.piety - 4, 0, 100) }, "imar", "ev.cami.title", "ev.cami.r2"),
      },
    ],
  },
  {
    key: "veba",
    weight: (s) => (s.year % 17 === 0 ? 8 : 1),
    titleKey: "ev.veba.title",
    bodyKey: "ev.veba.body",
    choices: [
      {
        id: "quarantine",
        labelKey: "ev.veba.c1",
        apply: (s) => log({ ...s, stability: clamp(s.stability - 4, 0, 100), ruler: { ...s.ruler, health: clamp(s.ruler.health - 6, 1, 100) } }, "afet", "ev.veba.title", "ev.veba.r1"),
      },
      {
        id: "pray",
        labelKey: "ev.veba.c2",
        apply: (s) => log({ ...s, piety: clamp(s.piety + 6, 0, 100), ruler: { ...s.ruler, health: clamp(s.ruler.health - 10, 1, 100) }, stability: clamp(s.stability - 8, 0, 100) }, "afet", "ev.veba.title", "ev.veba.r2"),
      },
    ],
  },
  {
    key: "evlilik_teklifi",
    weight: (s) => (s.members.some((m) => m.alive && m.role === "sultan_kizi" && s.year - m.birthYear >= 16) ? 6 : 0),
    titleKey: "ev.evlilik.title",
    bodyKey: "ev.evlilik.body",
    choices: [
      {
        id: "accept",
        labelKey: "ev.evlilik.c1",
        apply: (s) => {
          const rel = s.relations.map((r) => r.realmId === "kirim" || r.value === Math.max(...s.relations.map((x) => x.value)) ? { ...r, value: clamp(r.value + 18, -100, 100) } : r);
          return log({ ...s, relations: rel, prestige: clamp(s.prestige + 5, 0, 100) }, "diplomasi", "ev.evlilik.title", "ev.evlilik.r1");
        },
      },
      {
        id: "refuse",
        labelKey: "ev.evlilik.c2",
        apply: (s) => log({ ...s, prestige: clamp(s.prestige + 2, 0, 100) }, "diplomasi", "ev.evlilik.title", "ev.evlilik.r2"),
      },
    ],
  },
  {
    key: "casus",
    weight: () => 4,
    titleKey: "ev.casus.title",
    bodyKey: "ev.casus.body",
    choices: [
      {
        id: "execute",
        labelKey: "ev.casus.c1",
        apply: (s) => log({ ...s, prestige: clamp(s.prestige + 3, 0, 100), relations: s.relations.map((r) => r.treaty === "war" ? r : { ...r, value: r.value - 4 }) }, "diplomasi", "ev.casus.title", "ev.casus.r1"),
      },
      {
        id: "turn",
        labelKey: "ev.casus.c2",
        apply: (s) => log({ ...s, ruler: { ...s.ruler, stats: { ...s.ruler.stats, siyaset: clamp(s.ruler.stats.siyaset + 1, 1, 20) } } }, "diplomasi", "ev.casus.title", "ev.casus.r2"),
      },
    ],
  },
  {
    key: "ipek_yolu",
    weight: () => 5,
    titleKey: "ev.ipek.title",
    bodyKey: "ev.ipek.body",
    choices: [
      {
        id: "open",
        labelKey: "ev.ipek.c1",
        apply: (s) => log(addTreasury({ ...s, buildings: s.buildings }, 1100, "ledger.silk"), "ekonomi", "ev.ipek.title", "ev.ipek.r1"),
      },
      {
        id: "tariff",
        labelKey: "ev.ipek.c2",
        apply: (s) => log(addTreasury({ ...s, prestige: clamp(s.prestige - 3, 0, 100) }, 1700, "ledger.tariff"), "ekonomi", "ev.ipek.title", "ev.ipek.r2"),
      },
    ],
  },
  {
    key: "ulema_fetva",
    weight: () => 4,
    titleKey: "ev.fetva.title",
    bodyKey: "ev.fetva.body",
    choices: [
      {
        id: "heed",
        labelKey: "ev.fetva.c1",
        apply: (s) => log({ ...s, piety: clamp(s.piety + 10, 0, 100), stability: clamp(s.stability + 4, 0, 100), taxRate: Math.max(0.06, s.taxRate - 0.02) }, "divan", "ev.fetva.title", "ev.fetva.r1"),
      },
      {
        id: "state",
        labelKey: "ev.fetva.c2",
        apply: (s) => log({ ...s, piety: clamp(s.piety - 8, 0, 100), prestige: clamp(s.prestige + 4, 0, 100) }, "divan", "ev.fetva.title", "ev.fetva.r2"),
      },
    ],
  },
  {
    key: "dogum",
    weight: (s) =>
      (s.harem?.bonds ?? []).some((b) => b.stage === "halvet" || b.stage === "family" || b.married) &&
      s.members.some((m) => m.alive && m.role === "hatun" && canRomance(s, m.id))
        ? 5
        : 0,
    titleKey: "ev.dogum.title",
    bodyKey: "ev.dogum.body",
    choices: [
      {
        id: "celebrate",
        labelKey: "ev.dogum.c1",
        apply: (s, rng) => {
          const boy = rng() > 0.45;
          const namesM = ["Şehinşah", "Orhan", "Kasım", "Alaeddin", "Cem"];
          const namesF = ["Şah", "Gevher", "Hafsa", "Selçuk", "Kamer"];
          const hatun = s.members.find((m) => m.alive && m.role === "hatun" && canRomance(s, m.id));
          if (!hatun) return log(s, "hanedan", "ev.dogum.title", "ev.dogum.r1");
          const child = makeMember({
            givenName: boy ? pick(rng, namesM) : pick(rng, namesF),
            gender: boy ? "m" : "f",
            role: boy ? "sehzade" : "sultan_kizi",
            birthYear: s.year,
            portrait: boy ? "sehzade" : "hatun",
            location: s.realm.capitalId,
            fatherId: s.ruler.memberId,
            motherId: hatun.id,
            education: null,
            military: 4,
            statecraft: 4,
            influence: 8,
          });
          return log({
            ...s,
            members: [...s.members, child],
            prestige: clamp(s.prestige + 4, 0, 100),
            harem: { ...s.harem, lastBirthYear: s.year },
          }, "hanedan", "ev.dogum.title", "ev.dogum.r1", { name: child.givenName });
        },
      },
    ],
  },
  {
    key: "deprem",
    weight: (s) => (s.year % 23 === 5 ? 6 : 1),
    titleKey: "ev.deprem.title",
    bodyKey: "ev.deprem.body",
    choices: [
      {
        id: "rebuild",
        labelKey: "ev.deprem.c1",
        apply: (s) => log(addTreasury({ ...s, piety: clamp(s.piety + 4, 0, 100) }, -1600, "ledger.rebuild"), "afet", "ev.deprem.title", "ev.deprem.r1"),
      },
      {
        id: "move",
        labelKey: "ev.deprem.c2",
        apply: (s) => log({ ...s, stability: clamp(s.stability - 7, 0, 100), prestige: clamp(s.prestige - 5, 0, 100) }, "afet", "ev.deprem.title", "ev.deprem.r2"),
      },
    ],
  },
  {
    key: "harem_rekabet",
    weight: (s) => ((s.harem?.intrigue ?? 0) > 35 && s.members.filter((m) => m.alive && m.role === "hatun").length >= 2 ? 8 : 0),
    titleKey: "ev.harem_rekabet.title",
    bodyKey: "ev.harem_rekabet.body",
    choices: [
      {
        id: "favor",
        labelKey: "ev.harem_rekabet.c1",
        apply: (s) => {
          const fav = s.members.find((m) => m.id === s.harem?.favoriteId) ?? s.members.find((m) => m.alive && m.role === "hatun");
          return log({
            ...s,
            harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 40) + 6, 0, 100) },
            members: s.members.map((m) =>
              m.id === fav?.id ? { ...m, influence: clamp(m.influence + 8, 0, 100) } : m.role === "hatun" ? { ...m, influence: clamp(m.influence - 4, 0, 100) } : m,
            ),
          }, "harem", "ev.harem_rekabet.title", "ev.harem_rekabet.r1");
        },
      },
      {
        id: "balance",
        labelKey: "ev.harem_rekabet.c2",
        apply: (s) => log({
          ...s,
          treasury: s.treasury - 400,
          harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 40) - 12, 0, 100) },
          stability: clamp(s.stability + 3, 0, 100),
        }, "harem", "ev.harem_rekabet.title", "ev.harem_rekabet.r2"),
      },
    ],
  },
  {
    key: "valide_tercih",
    weight: (s) =>
      s.members.some((m) => m.alive && m.role === "valide") &&
      s.members.filter((m) => m.alive && m.role === "sehzade").length >= 2
        ? 6
        : 0,
    titleKey: "ev.valide_tercih.title",
    bodyKey: "ev.valide_tercih.body",
    choices: [
      {
        id: "heed",
        labelKey: "ev.valide_tercih.c1",
        apply: (s) => {
          const princes = s.members.filter((m) => m.alive && m.role === "sehzade").sort((a, b) => a.birthYear - b.birthYear);
          const pickPrince = princes[0];
          return log({
            ...s,
            members: s.members.map((m) => {
              if (m.id === pickPrince?.id) return { ...m, influence: clamp(m.influence + 12, 0, 100) };
              if (m.role === "valide") return { ...m, influence: clamp(m.influence + 6, 0, 100) };
              return m;
            }),
            stability: clamp(s.stability + 2, 0, 100),
          }, "harem", "ev.valide_tercih.title", "ev.valide_tercih.r1", { name: pickPrince?.givenName ?? "" });
        },
      },
      {
        id: "refuse",
        labelKey: "ev.valide_tercih.c2",
        apply: (s) => log({
          ...s,
          members: s.members.map((m) => m.role === "valide" ? { ...m, influence: clamp(m.influence - 8, 0, 100) } : m),
          harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 20) + 10, 0, 100) },
          prestige: clamp(s.prestige + 3, 0, 100),
        }, "harem", "ev.valide_tercih.title", "ev.valide_tercih.r2"),
      },
    ],
  },
  {
    key: "sehzade_ocak",
    weight: (s) =>
      s.members.some((m) => m.alive && m.role === "sehzade" && s.year - m.birthYear >= 16 && m.influence > 28) ? 5 : 0,
    titleKey: "ev.sehzade_ocak.title",
    bodyKey: "ev.sehzade_ocak.body",
    choices: [
      {
        id: "bless",
        labelKey: "ev.sehzade_ocak.c1",
        apply: (s) => {
          const p = s.members
            .filter((m) => m.alive && m.role === "sehzade" && s.year - m.birthYear >= 16)
            .sort((a, b) => b.influence - a.influence)[0];
          const aga = s.npcs.find((n) => n.office === "yeniceri_agasi" && n.alive);
          return log({
            ...s,
            members: s.members.map((m) =>
              m.id === p?.id
                ? { ...m, influence: clamp(m.influence + 10, 0, 100), supporters: aga && !m.supporters.includes(aga.id) ? [...m.supporters, aga.id] : m.supporters }
                : m,
            ),
            army: { ...s.army, morale: clamp(s.army.morale + 3, 10, 100) },
            harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 20) + 8, 0, 100) },
          }, "hanedan", "ev.sehzade_ocak.title", "ev.sehzade_ocak.r1", { name: p?.givenName ?? "" });
        },
      },
      {
        id: "warn",
        labelKey: "ev.sehzade_ocak.c2",
        apply: (s) => log({
          ...s,
          stability: clamp(s.stability + 4, 0, 100),
          army: { ...s.army, morale: clamp(s.army.morale - 4, 10, 100) },
        }, "hanedan", "ev.sehzade_ocak.title", "ev.sehzade_ocak.r2"),
      },
    ],
  },
  {
    key: "reaya_isyan",
    weight: (s) => {
      const risk = s.economy?.revoltRisk ?? 0;
      const hot = s.provinces.filter((p) => p.ownerId === s.realm.id && (p.unrest > 60 || p.loyalty < 40)).length;
      return risk > 55 ? 10 + hot * 2 : hot ? 4 : 0;
    },
    titleKey: "ev.reaya_isyan.title",
    bodyKey: "ev.reaya_isyan.body",
    choices: [
      {
        id: "relieve",
        labelKey: "ev.reaya_isyan.c1",
        apply: (s) => {
          const n = addTreasury(s, -1100, "ledger.relief");
          const eco = fillEconomy(n.economy);
          return log({
            ...n,
            taxRate: clamp(n.taxRate - 0.02, 0.04, 0.24),
            stability: clamp(n.stability + 5, 0, 100),
            economy: { ...eco, revoltRisk: clamp(eco.revoltRisk - 18, 0, 100) },
            provinces: n.provinces.map((p) =>
              p.ownerId === n.realm.id ? { ...p, loyalty: clamp(p.loyalty + 8, 5, 100), unrest: clamp(p.unrest - 12, 0, 100) } : p,
            ),
          }, "isyan", "ev.reaya_isyan.title", "ev.reaya_isyan.r1");
        },
      },
      {
        id: "crush",
        labelKey: "ev.reaya_isyan.c2",
        apply: (s) => {
          const n = addTreasury(s, -600, "ledger.divan_garrison");
          return log({
            ...n,
            army: { ...n.army, azab: Math.max(0, n.army.azab - 500), morale: clamp(n.army.morale - 4, 10, 100) },
            prestige: clamp(n.prestige + 3, 0, 100),
            piety: clamp(n.piety - 4, 0, 100),
            provinces: n.provinces.map((p) =>
              p.ownerId === n.realm.id && p.unrest > 50
                ? { ...p, unrest: clamp(p.unrest - 8, 0, 100), loyalty: clamp(p.loyalty - 4, 5, 100), manpower: Math.max(400, p.manpower - 200) }
                : p,
            ),
          }, "isyan", "ev.reaya_isyan.title", "ev.reaya_isyan.r2");
        },
      },
    ],
  },
  {
    key: "ticaret_kirilmasi",
    weight: (s) => {
      const wars = s.relations.filter((r) => r.treaty === "war").length;
      const venice = s.relations.some((r) => r.realmId === "venedik" && r.treaty === "war");
      const prosperity = s.economy?.people?.prosperity ?? 58;
      if (venice) return 11;
      if (wars >= 2) return 8;
      return prosperity < 35 ? 7 : 1;
    },
    titleKey: "ev.ticaret_kirilmasi.title",
    bodyKey: "ev.ticaret_kirilmasi.body",
    choices: [
      {
        id: "escort",
        labelKey: "ev.ticaret_kirilmasi.c1",
        apply: (s) => {
          const n = addTreasury(s, -750, "ledger.divan_escort");
          return log({
            ...n,
            army: { ...n.army, sipahi: Math.max(0, n.army.sipahi - 250) },
            provinces: n.provinces.map((p) =>
              p.ownerId === n.realm.id ? { ...p, trade: clamp(p.trade + 6, 8, 100) } : p,
            ),
          }, "ekonomi", "ev.ticaret_kirilmasi.title", "ev.ticaret_kirilmasi.r1");
        },
      },
      {
        id: "endure",
        labelKey: "ev.ticaret_kirilmasi.c2",
        apply: (s) =>
          log(
            {
              ...s,
              prestige: clamp(s.prestige - 4, 0, 100),
              provinces: s.provinces.map((p) =>
                p.ownerId === s.realm.id ? { ...p, trade: clamp(p.trade - 8, 8, 100), prosperity: clamp(p.prosperity - 5, 8, 100) } : p,
              ),
            },
            "ekonomi",
            "ev.ticaret_kirilmasi.title",
            "ev.ticaret_kirilmasi.r2",
          ),
      },
    ],
  },
  {
    key: "ocak_maas",
    weight: (s) => {
      const unpaid = s.economy?.unpaidStreak ?? 0;
      if (unpaid >= 1 || (s.treasury < 800 && s.army.morale < 58)) return 12;
      return s.army.morale < 45 ? 6 : 0;
    },
    titleKey: "ev.ocak_maas.title",
    bodyKey: "ev.ocak_maas.body",
    choices: [
      {
        id: "pay",
        labelKey: "ev.ocak_maas.c1",
        apply: (s) => {
          const cost = Math.round(s.army.janissary * 0.35);
          const n = addTreasury(s, -cost, "ledger.ulufe");
          const eco = fillEconomy(n.economy);
          return log({
            ...n,
            army: { ...n.army, morale: clamp(n.army.morale + 10, 10, 100) },
            stability: clamp(n.stability + 4, 0, 100),
            economy: { ...eco, unpaidStreak: 0 },
          }, "ordu", "ev.ocak_maas.title", "ev.ocak_maas.r1");
        },
      },
      {
        id: "refuse",
        labelKey: "ev.ocak_maas.c2",
        apply: (s) =>
          log(
            {
              ...s,
              army: { ...s.army, morale: clamp(s.army.morale - 16, 10, 100) },
              stability: clamp(s.stability - 10, 0, 100),
            },
            "ordu",
            "ev.ocak_maas.title",
            "ev.ocak_maas.r2",
          ),
      },
    ],
  },
  {
    key: "saray_gerilimi",
    weight: (s) => {
      const peace = s.economy?.people?.peace ?? 62;
      const tax = s.economy?.people?.taxPressure ?? 38;
      const intrigue = s.harem?.intrigue ?? 0;
      if (peace < 38 && tax > 60) return 10;
      return intrigue > 50 ? 5 : 0;
    },
    titleKey: "ev.saray_gerilimi.title",
    bodyKey: "ev.saray_gerilimi.body",
    choices: [
      {
        id: "gift",
        labelKey: "ev.saray_gerilimi.c1",
        apply: (s) => {
          const n = addTreasury(s, -500, "ledger.coronation_gift");
          return log({
            ...n,
            harem: { ...n.harem, intrigue: clamp((n.harem?.intrigue ?? 20) - 10, 0, 100) },
            stability: clamp(n.stability + 3, 0, 100),
            npcs: n.npcs.map((x) => ({ ...x, loyalty: clamp(x.loyalty + 3, 0, 100) })),
          }, "saray", "ev.saray_gerilimi.title", "ev.saray_gerilimi.r1");
        },
      },
      {
        id: "austerity",
        labelKey: "ev.saray_gerilimi.c2",
        apply: (s) =>
          log(
            {
              ...s,
              prestige: clamp(s.prestige - 3, 0, 100),
              harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 20) + 6, 0, 100) },
              npcs: s.npcs.map((x) => ({ ...x, loyalty: clamp(x.loyalty - 5, 0, 100) })),
            },
            "saray",
            "ev.saray_gerilimi.title",
            "ev.saray_gerilimi.r2",
          ),
      },
    ],
  },
  {
    key: "galata_borc",
    weight: (s) => (totalDebt(s) > 6000 ? 8 : totalDebt(s) > 2500 ? 4 : 0),
    titleKey: "ev.galata_borc.title",
    bodyKey: "ev.galata_borc.body",
    choices: [
      {
        id: "repay",
        labelKey: "ev.galata_borc.c1",
        apply: (s) => {
          const eco = fillEconomy(s.economy);
          const loan = eco.loans[0];
          const pay = Math.min(s.treasury, loan ? Math.min(loan.principal, 2000) : 1200);
          if (pay <= 0) return log({ ...s, prestige: clamp(s.prestige - 4, 0, 100) }, "hazine", "ev.galata_borc.title", "ev.galata_borc.r2");
          const n = addTreasury(s, -pay, "ledger.repay");
          const nextEco = fillEconomy(n.economy);
          const loans = loan
            ? nextEco.loans.map((l, i) => (i === 0 ? { ...l, principal: Math.max(0, l.principal - pay) } : l)).filter((l) => l.principal > 0)
            : nextEco.loans;
          return log({ ...n, economy: { ...nextEco, loans }, prestige: clamp(n.prestige + 2, 0, 100) }, "hazine", "ev.galata_borc.title", "ev.galata_borc.r1");
        },
      },
      {
        id: "defer",
        labelKey: "ev.galata_borc.c2",
        apply: (s) => {
          const eco = fillEconomy(s.economy);
          const loans = eco.loans.map((l) => ({ ...l, principal: Math.round(l.principal * 1.08) }));
          return log({
            ...s,
            prestige: clamp(s.prestige - 5, 0, 100),
            economy: { ...eco, loans },
          }, "hazine", "ev.galata_borc.title", "ev.galata_borc.r2");
        },
      },
    ],
  },
];

export function eventByKey(key: string): EventDef | undefined {
  return EVENT_CATALOG.find((e) => e.key === key) ?? (crisisByKey(key) as EventDef | undefined);
}

const FLAVOR_KIND: Record<string, CrisisKind> = {
  reaya_isyan: "revolt",
  ocak_maas: "janissary",
  yeni_ceri_ulufe: "janissary",
  casus: "spy",
  harem_rekabet: "palace",
  valide_tercih: "palace",
  sehzade_ocak: "claim",
  sehzade_ihtilaf: "claim",
  galata_borc: "economy",
  saray_gerilimi: "palace",
  vezir_rusvet: "rivalry",
};

export function spawnYearEvents(state: GameState, rng: () => number): PendingEvent[] {
  const pendingKinds = new Set(
    state.pendingEvents
      .map((e) => crisisByKey(e.key)?.kind)
      .filter((k): k is CrisisKind => Boolean(k)),
  );
  const last = state.crisis?.lastFired ?? {};
  const pool = EVENT_CATALOG.filter((e) => {
    if (e.key === "tahta_cikis" || e.weight(state) <= 0) return false;
    const kind = FLAVOR_KIND[e.key];
    if (!kind) return true;
    if (pendingKinds.has(kind)) return false;
    if (state.year - (last[kind] ?? 0) === 0) return false;
    return true;
  });
  const count = rng() > 0.35 ? 2 : 1;
  const picked: PendingEvent[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count && pool.length; i += 1) {
    const weighted = pool.filter((e) => !used.has(e.key));
    if (!weighted.length) break;
    const total = weighted.reduce((a, e) => a + e.weight(state), 0);
    let roll = rng() * total;
    let chosen = weighted[0];
    for (const e of weighted) {
      roll -= e.weight(state);
      if (roll <= 0) {
        chosen = e;
        break;
      }
    }
    used.add(chosen.key);
    picked.push({ id: nid("ev"), key: chosen.key, year: state.year, payload: {} });
  }
  return picked;
}
