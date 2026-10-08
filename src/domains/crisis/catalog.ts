import { clamp } from "@/domains/ids";
import type { CrisisKind, GameState } from "@/domains/types";
import { holderOf } from "@/domains/divan/offices";
import { isAdult } from "@/domains/dynasty/age";
import { canBorrow, openLoan } from "@/domains/economy/credit";
import { logCrisis, plantSeed, spendCrisis } from "@/domains/crisis/model";
import { hottestOwned } from "@/domains/crisis/heat";

export interface CrisisDef {
  key: string;
  kind: CrisisKind;
  titleKey: string;
  bodyKey: string;
  when?: (s: GameState) => boolean;
  choices: { id: string; labelKey: string; hintKey?: string; apply: (s: GameState, rng: () => number) => GameState }[];
}

function seed(
  s: GameState,
  kind: CrisisKind,
  delay: number,
  fromKey: string,
  titleKey: string,
  bodyKey: string,
  payload: Record<string, string> = {},
  sequel = true,
): GameState {
  return plantSeed(s, {
    kind,
    plantedYear: s.year,
    ripeYear: s.year + delay,
    fromKey,
    payload,
    titleKey,
    bodyKey,
    sequel,
  });
}

function hotId(s: GameState): string {
  return hottestOwned(s)?.id ?? s.realm.capitalId;
}

export const CRISIS_EVENTS: CrisisDef[] = [
  {
    key: "crisis_revolt",
    kind: "revolt",
    titleKey: "crisis.revolt.title",
    bodyKey: "crisis.revolt.body",
    choices: [
      {
        id: "mercy",
        labelKey: "crisis.revolt.c1",
        hintKey: "crisis.hint.mercy",
        apply: (s) => {
          const n = spendCrisis(s, 1400, "ledger.relief");
          const id = hotId(n);
          let next = {
            ...n,
            taxRate: clamp(n.taxRate - 0.02, 0.04, 0.24),
            stability: clamp(n.stability + 4, 0, 100),
            prestige: clamp(n.prestige - 3, 0, 100),
            provinces: n.provinces.map((p) =>
              p.id === id ? { ...p, unrest: clamp(p.unrest - 16, 0, 100), loyalty: clamp(p.loyalty + 10, 5, 100) } : p,
            ),
          };
          next = seed(next, "revolt", 3, "crisis_revolt:mercy", "crisis.seed.bargain.title", "crisis.seed.bargain.body", { prov: hottestOwned(s)?.nameKey ?? "" });
          return logCrisis(next, "isyan", "crisis.revolt.title", "crisis.revolt.r1", { prov: hottestOwned(s)?.nameKey ?? "" });
        },
      },
      {
        id: "steel",
        labelKey: "crisis.revolt.c2",
        hintKey: "crisis.hint.steel",
        apply: (s) => {
          const id = hotId(s);
          let next = {
            ...s,
            army: { ...s.army, azab: Math.max(0, s.army.azab - 400), morale: clamp(s.army.morale - 5, 10, 100) },
            piety: clamp(s.piety - 5, 0, 100),
            prestige: clamp(s.prestige + 4, 0, 100),
            provinces: s.provinces.map((p) =>
              p.id === id
                ? { ...p, unrest: clamp(p.unrest - 10, 0, 100), loyalty: clamp(p.loyalty - 12, 5, 100), manpower: Math.max(400, p.manpower - 280) }
                : p,
            ),
          };
          next = seed(next, "revolt", 4, "crisis_revolt:steel", "crisis.seed.blood.title", "crisis.seed.blood.body", { prov: hottestOwned(s)?.nameKey ?? "" });
          return logCrisis(next, "isyan", "crisis.revolt.title", "crisis.revolt.r2", { prov: hottestOwned(s)?.nameKey ?? "" });
        },
      },
      {
        id: "bargain",
        labelKey: "crisis.revolt.c3",
        hintKey: "crisis.hint.bargain",
        apply: (s) => {
          const id = hotId(s);
          let next = {
            ...s,
            stability: clamp(s.stability + 2, 0, 100),
            prestige: clamp(s.prestige - 2, 0, 100),
            provinces: s.provinces.map((p) =>
              p.id === id ? { ...p, unrest: clamp(p.unrest - 8, 0, 100), loyalty: clamp(p.loyalty + 4, 5, 100) } : p,
            ),
          };
          next = seed(next, "revolt", 5, "crisis_revolt:bargain", "crisis.seed.local.title", "crisis.seed.local.body", { prov: hottestOwned(s)?.nameKey ?? "" });
          return logCrisis(next, "isyan", "crisis.revolt.title", "crisis.revolt.r3", { prov: hottestOwned(s)?.nameKey ?? "" });
        },
      },
    ],
  },
  {
    key: "crisis_janissary",
    kind: "janissary",
    titleKey: "crisis.janissary.title",
    bodyKey: "crisis.janissary.body",
    choices: [
      {
        id: "pay",
        labelKey: "crisis.janissary.c1",
        hintKey: "crisis.hint.appetite",
        apply: (s) => {
          const cost = Math.round(s.army.janissary * 0.38);
          let next = spendCrisis(s, cost, "ledger.ulufe");
          next = {
            ...next,
            army: { ...next.army, pay: clamp(next.army.pay + 18, 0, 100), morale: clamp(next.army.morale + 10, 10, 100) },
            stability: clamp(next.stability + 3, 0, 100),
          };
          next = seed(next, "janissary", 3, "crisis_janissary:pay", "crisis.seed.appetite.title", "crisis.seed.appetite.body");
          return logCrisis(next, "ordu", "crisis.janissary.title", "crisis.janissary.r1");
        },
      },
      {
        id: "refuse",
        labelKey: "crisis.janissary.c2",
        hintKey: "crisis.hint.kazan",
        apply: (s) => {
          let next = {
            ...s,
            army: { ...s.army, morale: clamp(s.army.morale - 14, 10, 100), pay: clamp(s.army.pay - 8, 0, 100) },
            stability: clamp(s.stability - 8, 0, 100),
          };
          next = seed(next, "janissary", 2, "crisis_janissary:refuse", "crisis.seed.kazan.title", "crisis.seed.kazan.body");
          return logCrisis(next, "ordu", "crisis.janissary.title", "crisis.janissary.r2");
        },
      },
      {
        id: "reform",
        labelKey: "crisis.janissary.c3",
        hintKey: "crisis.hint.grudge",
        apply: (s) => {
          let next = spendCrisis(s, 700, "ledger.ulufe");
          next = {
            ...next,
            army: {
              ...next.army,
              janissary: Math.max(2000, Math.round(next.army.janissary * 0.94)),
              drill: clamp(next.army.drill + 8, 0, 100),
              morale: clamp(next.army.morale - 4, 10, 100),
            },
            prestige: clamp(next.prestige + 2, 0, 100),
          };
          next = seed(next, "janissary", 5, "crisis_janissary:reform", "crisis.seed.grudge.title", "crisis.seed.grudge.body");
          return logCrisis(next, "ordu", "crisis.janissary.title", "crisis.janissary.r3");
        },
      },
    ],
  },
  {
    key: "crisis_palace",
    kind: "palace",
    titleKey: "crisis.palace.title",
    bodyKey: "crisis.palace.body",
    choices: [
      {
        id: "valide",
        labelKey: "crisis.palace.c1",
        apply: (s) => {
          const valide = s.members.find((m) => m.alive && m.role === "valide");
          const fav = s.harem?.favoriteId;
          let next = {
            ...s,
            harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 12) - 10, 0, 100) },
            members: s.members.map((m) => {
              if (valide && m.id === valide.id) return { ...m, influence: clamp(m.influence + 8, 0, 100) };
              if (fav && m.id === fav) return { ...m, influence: clamp(m.influence - 6, 0, 100) };
              return m;
            }),
          };
          return logCrisis(next, "saray", "crisis.palace.title", "crisis.palace.r1", { valide: valide?.givenName ?? "" });
        },
      },
      {
        id: "haseki",
        labelKey: "crisis.palace.c2",
        hintKey: "crisis.hint.valide",
        apply: (s) => {
          const valide = s.members.find((m) => m.alive && m.role === "valide");
          const fav = s.harem?.favoriteId;
          let next = {
            ...s,
            harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 12) + 4, 0, 100) },
            members: s.members.map((m) => {
              if (fav && m.id === fav) return { ...m, influence: clamp(m.influence + 8, 0, 100) };
              if (valide && m.id === valide.id) return { ...m, influence: clamp(m.influence - 7, 0, 100) };
              return m;
            }),
          };
          next = seed(next, "palace", 3, "crisis_palace:haseki", "crisis.seed.valide.title", "crisis.seed.valide.body", {
            valide: valide?.givenName ?? "",
          });
          return logCrisis(next, "saray", "crisis.palace.title", "crisis.palace.r2", { hatun: s.members.find((m) => m.id === fav)?.givenName ?? "" });
        },
      },
      {
        id: "distance",
        labelKey: "crisis.palace.c3",
        apply: (s) => {
          const next = {
            ...s,
            piety: clamp(s.piety + 3, 0, 100),
            prestige: clamp(s.prestige - 2, 0, 100),
            harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 12) - 6, 0, 100) },
          };
          return logCrisis(next, "saray", "crisis.palace.title", "crisis.palace.r3");
        },
      },
    ],
  },
  {
    key: "crisis_rivalry",
    kind: "rivalry",
    titleKey: "crisis.rivalry.title",
    bodyKey: "crisis.rivalry.body",
    choices: [
      {
        id: "back",
        labelKey: "crisis.rivalry.c1",
        apply: (s) => {
          const sad = holderOf(s, "sadrazam");
          const next = {
            ...s,
            ruler: { ...s.ruler, authority: { ...s.ruler.authority, divan: clamp(s.ruler.authority.divan - 4, 0, 100) } },
            npcs: s.npcs.map((n) => {
              if (sad && n.id === sad.id) return { ...n, influence: clamp(n.influence + 8, 0, 100), favor: clamp(n.favor + 8, 0, 100) };
              if (sad && sad.rivals.includes(n.id)) return { ...n, loyalty: clamp(n.loyalty - 10, 0, 100), influence: clamp(n.influence - 4, 0, 100) };
              return n;
            }),
          };
          return logCrisis(next, "divan", "crisis.rivalry.title", "crisis.rivalry.r1", { vizier: sad?.name ?? "" });
        },
      },
      {
        id: "dismiss",
        labelKey: "crisis.rivalry.c2",
        hintKey: "crisis.hint.exile",
        apply: (s) => {
          const sad = holderOf(s, "sadrazam");
          let next = {
            ...s,
            prestige: clamp(s.prestige + 3, 0, 100),
            stability: clamp(s.stability - 4, 0, 100),
            court: s.court.map((p) => (p.office === "sadrazam" ? { ...p, npcId: null } : p)),
            npcs: s.npcs.map((n) => (sad && n.id === sad.id ? { ...n, loyalty: clamp(n.loyalty - 22, 0, 100), influence: clamp(n.influence - 12, 0, 100) } : n)),
          };
          next = seed(next, "rivalry", 4, "crisis_rivalry:dismiss", "crisis.seed.exile.title", "crisis.seed.exile.body", {
            vizier: sad?.name ?? "",
          });
          return logCrisis(next, "divan", "crisis.rivalry.title", "crisis.rivalry.r2", { vizier: sad?.name ?? "" });
        },
      },
      {
        id: "reconcile",
        labelKey: "crisis.rivalry.c3",
        apply: (s) => {
          const sad = holderOf(s, "sadrazam");
          const next = spendCrisis(
            {
              ...s,
              npcs: s.npcs.map((n) => {
                if (!sad) return n;
                if (n.id === sad.id || sad.rivals.includes(n.id)) {
                  return { ...n, favor: clamp(n.favor + 6, 0, 100), loyalty: clamp(n.loyalty + 4, 0, 100), ambition: clamp(n.ambition - 4, 0, 100) };
                }
                return n;
              }),
            },
            500,
            "ledger.coronation_gift",
          );
          return logCrisis(next, "divan", "crisis.rivalry.title", "crisis.rivalry.r3", { vizier: sad?.name ?? "" });
        },
      },
    ],
  },
  {
    key: "crisis_spy",
    kind: "spy",
    titleKey: "crisis.spy.title",
    bodyKey: "crisis.spy.body",
    choices: [
      {
        id: "fund",
        labelKey: "crisis.spy.c1",
        hintKey: "crisis.hint.intel",
        apply: (s) => {
          let next = spendCrisis(s, 800, "ledger.gift");
          next = seed(next, "spy", 2, "crisis_spy:fund", "crisis.seed.intel.title", "crisis.seed.intel.body", {}, false);
          return logCrisis(next, "diplomasi", "crisis.spy.title", "crisis.spy.r1");
        },
      },
      {
        id: "recall",
        labelKey: "crisis.spy.c2",
        apply: (s) => logCrisis({ ...s, prestige: clamp(s.prestige - 1, 0, 100) }, "diplomasi", "crisis.spy.title", "crisis.spy.r2"),
      },
      {
        id: "burn",
        labelKey: "crisis.spy.c3",
        hintKey: "crisis.hint.counter",
        apply: (s) => {
          const foe = [...s.relations].sort((a, b) => a.value - b.value)[0];
          let next = {
            ...s,
            prestige: clamp(s.prestige + 4, 0, 100),
            relations: s.relations.map((r) => (foe && r.realmId === foe.realmId ? { ...r, value: clamp(r.value - 8, -100, 100) } : r)),
          };
          next = seed(next, "agent", 3, "crisis_spy:burn", "crisis.seed.counter.title", "crisis.seed.counter.body");
          return logCrisis(next, "diplomasi", "crisis.spy.title", "crisis.spy.r3");
        },
      },
    ],
  },
  {
    key: "crisis_agent",
    kind: "agent",
    titleKey: "crisis.agent.title",
    bodyKey: "crisis.agent.body",
    choices: [
      {
        id: "execute",
        labelKey: "crisis.agent.c1",
        hintKey: "crisis.hint.martyr",
        apply: (s) => {
          let next = { ...s, prestige: clamp(s.prestige + 5, 0, 100), stability: clamp(s.stability + 2, 0, 100) };
          next = seed(next, "agent", 4, "crisis_agent:execute", "crisis.seed.martyr.title", "crisis.seed.martyr.body");
          return logCrisis(next, "diplomasi", "crisis.agent.title", "crisis.agent.r1");
        },
      },
      {
        id: "turn",
        labelKey: "crisis.agent.c2",
        hintKey: "crisis.hint.turn",
        apply: (s) => {
          const nis = holderOf(s, "nisanci");
          const skilled = (nis?.competence ?? 40) >= 58;
          let next = {
            ...s,
            ruler: { ...s.ruler, stats: { ...s.ruler.stats, siyaset: clamp(s.ruler.stats.siyaset + (skilled ? 1 : 0), 1, 20) } },
          };
          next = seed(
            next,
            skilled ? "spy" : "agent",
            3,
            skilled ? "crisis_agent:turn" : "crisis_agent:turn_fail",
            skilled ? "crisis.seed.double.title" : "crisis.seed.leak.title",
            skilled ? "crisis.seed.double.body" : "crisis.seed.leak.body",
            {},
            skilled ? false : true,
          );
          return logCrisis(next, "diplomasi", "crisis.agent.title", skilled ? "crisis.agent.r2" : "crisis.agent.r2b");
        },
      },
      {
        id: "exchange",
        labelKey: "crisis.agent.c3",
        hintKey: "crisis.hint.weak",
        apply: (s) => {
          const foe = [...s.relations].sort((a, b) => a.value - b.value)[0];
          let next = {
            ...s,
            relations: s.relations.map((r) => (foe && r.realmId === foe.realmId ? { ...r, value: clamp(r.value + 10, -100, 100) } : r)),
            prestige: clamp(s.prestige - 3, 0, 100),
          };
          next = seed(next, "diplomatic", 2, "crisis_agent:exchange", "crisis.seed.weak.title", "crisis.seed.weak.body");
          return logCrisis(next, "diplomasi", "crisis.agent.title", "crisis.agent.r3");
        },
      },
    ],
  },
  {
    key: "crisis_economy",
    kind: "economy",
    titleKey: "crisis.economy.title",
    bodyKey: "crisis.economy.body",
    choices: [
      {
        id: "austerity",
        labelKey: "crisis.economy.c1",
        apply: (s) => {
          const next = {
            ...s,
            stability: clamp(s.stability - 4, 0, 100),
            prestige: clamp(s.prestige - 3, 0, 100),
            treasury: Math.round(s.treasury + 900),
            taxRate: clamp(s.taxRate + 0.01, 0.04, 0.24),
          };
          return logCrisis(next, "hazine", "crisis.economy.title", "crisis.economy.r1");
        },
      },
      {
        id: "borrow",
        labelKey: "crisis.economy.c2",
        hintKey: "crisis.hint.debt",
        apply: (s) => {
          let next = s;
          if (canBorrow(s, "galata", 1800)) next = openLoan(s, "galata", 1800);
          next = seed(next, "economy", 4, "crisis_economy:borrow", "crisis.seed.debt.title", "crisis.seed.debt.body");
          return logCrisis(next, "hazine", "crisis.economy.title", "crisis.economy.r2");
        },
      },
      {
        id: "debase",
        labelKey: "crisis.economy.c3",
        hintKey: "crisis.hint.inflation",
        apply: (s) => {
          let next = {
            ...s,
            treasury: Math.round(s.treasury + 1600),
            prestige: clamp(s.prestige - 6, 0, 100),
            provinces: s.provinces.map((p) =>
              p.ownerId === s.realm.id ? { ...p, prosperity: clamp(p.prosperity - 4, 8, 100), trade: clamp(p.trade - 3, 8, 100) } : p,
            ),
          };
          next = seed(next, "economy", 3, "crisis_economy:debase", "crisis.seed.inflation.title", "crisis.seed.inflation.body");
          return logCrisis(next, "hazine", "crisis.economy.title", "crisis.economy.r3");
        },
      },
    ],
  },
  {
    key: "crisis_claim",
    kind: "claim",
    titleKey: "crisis.claim.title",
    bodyKey: "crisis.claim.body",
    choices: [
      {
        id: "sanjak",
        labelKey: "crisis.claim.c1",
        apply: (s) => {
          const prince = s.members
            .filter((m) => m.alive && m.role === "sehzade" && isAdult(m, s.year))
            .sort((a, b) => b.influence - a.influence)[0];
          const sanjak = s.provinces.find((p) => p.ownerId === s.realm.id && p.id !== s.realm.capitalId);
          const next = {
            ...s,
            stability: clamp(s.stability + 4, 0, 100),
            members: s.members.map((m) =>
              prince && m.id === prince.id && sanjak
                ? { ...m, location: sanjak.id, influence: clamp(m.influence - 6, 0, 100), statecraft: clamp(m.statecraft + 4, 0, 100) }
                : m,
            ),
          };
          return logCrisis(next, "hanedan", "crisis.claim.title", "crisis.claim.r1", { prince: prince?.givenName ?? "" });
        },
      },
      {
        id: "confine",
        labelKey: "crisis.claim.c2",
        hintKey: "crisis.hint.whisper",
        apply: (s) => {
          const prince = s.members
            .filter((m) => m.alive && m.role === "sehzade" && isAdult(m, s.year))
            .sort((a, b) => b.influence - a.influence)[0];
          let next = {
            ...s,
            stability: clamp(s.stability + 2, 0, 100),
            prestige: clamp(s.prestige - 2, 0, 100),
            members: s.members.map((m) =>
              prince && m.id === prince.id
                ? { ...m, location: s.realm.capitalId, influence: clamp(m.influence - 12, 0, 100) }
                : m,
            ),
          };
          next = seed(next, "claim", 5, "crisis_claim:confine", "crisis.seed.whisper.title", "crisis.seed.whisper.body", {
            prince: prince?.givenName ?? "",
          });
          return logCrisis(next, "hanedan", "crisis.claim.title", "crisis.claim.r2", { prince: prince?.givenName ?? "" });
        },
      },
      {
        id: "favor",
        labelKey: "crisis.claim.c3",
        apply: (s) => {
          const ranked = s.members
            .filter((m) => m.alive && m.role === "sehzade" && isAdult(m, s.year))
            .sort((a, b) => b.influence - a.influence);
          const prince = ranked[0];
          const next = {
            ...s,
            members: s.members.map((m) => {
              if (prince && m.id === prince.id) return { ...m, influence: clamp(m.influence + 10, 0, 100) };
              if (m.alive && m.role === "sehzade" && m.id !== prince?.id) return { ...m, influence: clamp(m.influence + 3, 0, 100) };
              return m;
            }),
            stability: clamp(s.stability - 3, 0, 100),
          };
          return logCrisis(next, "hanedan", "crisis.claim.title", "crisis.claim.r3", { prince: prince?.givenName ?? "" });
        },
      },
    ],
  },
  {
    key: "crisis_diplomatic",
    kind: "diplomatic",
    titleKey: "crisis.diplomatic.title",
    bodyKey: "crisis.diplomatic.body",
    choices: [
      {
        id: "tribute",
        labelKey: "crisis.diplomatic.c1",
        apply: (s) => {
          const foe = [...s.relations].sort((a, b) => a.value - b.value)[0];
          const next = spendCrisis(
            {
              ...s,
              relations: s.relations.map((r) =>
                foe && r.realmId === foe.realmId ? { ...r, value: clamp(r.value + 12, -100, 100), treaty: r.treaty === "war" ? "truce" : r.treaty } : r,
              ),
            },
            1200,
            "ledger.gift",
          );
          return logCrisis(next, "diplomasi", "crisis.diplomatic.title", "crisis.diplomatic.r1", { foe: foe?.realmId ?? "" });
        },
      },
      {
        id: "refuse",
        labelKey: "crisis.diplomatic.c2",
        hintKey: "crisis.hint.warcloud",
        apply: (s) => {
          const foe = [...s.relations].sort((a, b) => a.value - b.value)[0];
          let next = {
            ...s,
            prestige: clamp(s.prestige + 4, 0, 100),
            relations: s.relations.map((r) => (foe && r.realmId === foe.realmId ? { ...r, value: clamp(r.value - 14, -100, 100) } : r)),
          };
          next = seed(next, "diplomatic", 2, "crisis_diplomatic:refuse", "crisis.seed.warcloud.title", "crisis.seed.warcloud.body", {
            foe: foe?.realmId ?? "",
          });
          return logCrisis(next, "diplomasi", "crisis.diplomatic.title", "crisis.diplomatic.r2", { foe: foe?.realmId ?? "" });
        },
      },
      {
        id: "envoy",
        labelKey: "crisis.diplomatic.c3",
        apply: (s) => {
          const foe = [...s.relations].sort((a, b) => a.value - b.value)[0];
          const next = spendCrisis(
            {
              ...s,
              relations: s.relations.map((r) => (foe && r.realmId === foe.realmId ? { ...r, value: clamp(r.value + 7, -100, 100) } : r)),
            },
            400,
            "ledger.gift",
          );
          return logCrisis(next, "diplomasi", "crisis.diplomatic.title", "crisis.diplomatic.r3", { foe: foe?.realmId ?? "" });
        },
      },
    ],
  },
  {
    key: "crisis_commander",
    kind: "commander",
    titleKey: "crisis.commander.title",
    bodyKey: "crisis.commander.body",
    choices: [
      {
        id: "replace",
        labelKey: "crisis.commander.c1",
        apply: (s) => {
          const next = {
            ...s,
            army: { ...s.army, commanderNpcId: null, commanderMemberId: null, morale: clamp(s.army.morale - 6, 10, 100) },
            prestige: clamp(s.prestige + 2, 0, 100),
          };
          return logCrisis(next, "ordu", "crisis.commander.title", "crisis.commander.r1");
        },
      },
      {
        id: "gift",
        labelKey: "crisis.commander.c2",
        apply: (s) => {
          const cmdId = s.army.commanderNpcId ?? holderOf(s, "yeniceri_agasi")?.id;
          const next = spendCrisis(
            {
              ...s,
              army: { ...s.army, morale: clamp(s.army.morale + 5, 10, 100) },
              npcs: s.npcs.map((n) => (cmdId && n.id === cmdId ? { ...n, loyalty: clamp(n.loyalty + 14, 0, 100), favor: clamp(n.favor + 10, 0, 100) } : n)),
            },
            600,
            "ledger.coronation_gift",
          );
          return logCrisis(next, "ordu", "crisis.commander.title", "crisis.commander.r2");
        },
      },
      {
        id: "overlook",
        labelKey: "crisis.commander.c3",
        hintKey: "crisis.hint.desert",
        apply: (s) => {
          let next = { ...s, prestige: clamp(s.prestige - 2, 0, 100) };
          next = seed(next, "commander", 3, "crisis_commander:overlook", "crisis.seed.desert.title", "crisis.seed.desert.body");
          return logCrisis(next, "ordu", "crisis.commander.title", "crisis.commander.r3");
        },
      },
    ],
  },
  {
    key: "crisis_palace_letter",
    kind: "palace",
    titleKey: "crisis.palace_letter.title",
    bodyKey: "crisis.palace_letter.body",
    when: (s) => s.members.some((m) => m.alive && m.role === "sehzade" && isAdult(m, s.year)),
    choices: [
      {
        id: "burn",
        labelKey: "crisis.palace_letter.c1",
        apply: (s) => {
          const next = {
            ...s,
            piety: clamp(s.piety + 2, 0, 100),
            prestige: clamp(s.prestige + 1, 0, 100),
            harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 12) - 4, 0, 100) },
          };
          return logCrisis(next, "saray", "crisis.palace_letter.title", "crisis.palace_letter.r1");
        },
      },
      {
        id: "confront",
        labelKey: "crisis.palace_letter.c2",
        hintKey: "crisis.hint.letter",
        apply: (s) => {
          const valide = s.members.find((m) => m.alive && m.role === "valide");
          const prince = s.members
            .filter((m) => m.alive && m.role === "sehzade" && isAdult(m, s.year))
            .sort((a, b) => b.influence - a.influence)[0];
          let next = {
            ...s,
            harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 12) - 8, 0, 100) },
            members: s.members.map((m) => {
              if (valide && m.id === valide.id) return { ...m, influence: clamp(m.influence + 5, 0, 100) };
              if (prince && m.id === prince.id) return { ...m, influence: clamp(m.influence - 6, 0, 100) };
              return m;
            }),
          };
          next = seed(next, "palace", 3, "crisis_palace_letter:confront", "crisis.seed.letter.title", "crisis.seed.letter.body", {
            prince: prince?.givenName ?? "",
          });
          return logCrisis(next, "saray", "crisis.palace_letter.title", "crisis.palace_letter.r2", { prince: prince?.givenName ?? "" });
        },
      },
      {
        id: "ignore",
        labelKey: "crisis.palace_letter.c3",
        hintKey: "crisis.hint.letter_ignore",
        apply: (s) => {
          let next = {
            ...s,
            harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 12) + 12, 0, 100) },
            stability: clamp(s.stability - 3, 0, 100),
          };
          next = seed(next, "claim", 4, "crisis_palace_letter:ignore", "crisis.seed.whisper.title", "crisis.seed.whisper.body", {
            prince: s.members.find((m) => m.alive && m.role === "sehzade")?.givenName ?? "",
          });
          return logCrisis(next, "saray", "crisis.palace_letter.title", "crisis.palace_letter.r3");
        },
      },
    ],
  },
  {
    key: "crisis_palace_kalfa",
    kind: "palace",
    titleKey: "crisis.palace_kalfa.title",
    bodyKey: "crisis.palace_kalfa.body",
    when: (s) => (s.harem?.intrigue ?? 0) >= 28,
    choices: [
      {
        id: "silence",
        labelKey: "crisis.palace_kalfa.c1",
        hintKey: "crisis.hint.kalfa",
        apply: (s) => {
          let next = {
            ...s,
            prestige: clamp(s.prestige + 3, 0, 100),
            harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 12) - 4, 0, 100) },
          };
          next = seed(next, "palace", 4, "crisis_palace_kalfa:silence", "crisis.seed.kalfa.title", "crisis.seed.kalfa.body");
          return logCrisis(next, "saray", "crisis.palace_kalfa.title", "crisis.palace_kalfa.r1");
        },
      },
      {
        id: "probe",
        labelKey: "crisis.palace_kalfa.c2",
        hintKey: "crisis.hint.probe",
        apply: (s) => {
          const nis = holderOf(s, "nisanci");
          const skilled = (nis?.competence ?? 40) >= 58;
          let next = spendCrisis(s, 400, "ledger.gift");
          next = {
            ...next,
            harem: { ...next.harem, intrigue: clamp((next.harem?.intrigue ?? 12) + (skilled ? -14 : 6), 0, 100) },
          };
          if (!skilled) {
            next = seed(next, "agent", 3, "crisis_palace_kalfa:probe", "crisis.seed.leak.title", "crisis.seed.leak.body");
          }
          return logCrisis(next, "saray", "crisis.palace_kalfa.title", skilled ? "crisis.palace_kalfa.r2" : "crisis.palace_kalfa.r2b");
        },
      },
      {
        id: "exile",
        labelKey: "crisis.palace_kalfa.c3",
        hintKey: "crisis.hint.exile_hatun",
        apply: (s) => {
          const fav = s.harem?.favoriteId;
          const other = s.members.find((m) => m.alive && m.role === "hatun" && m.id !== fav);
          let next = {
            ...s,
            members: s.members.map((m) => {
              if (other && m.id === other.id) return { ...m, influence: clamp(m.influence - 10, 0, 100) };
              if (fav && m.id === fav) return { ...m, influence: clamp(m.influence + 6, 0, 100) };
              return m;
            }),
            harem: { ...s.harem, intrigue: clamp((s.harem?.intrigue ?? 12) + 5, 0, 100) },
          };
          next = seed(next, "palace", 3, "crisis_palace_kalfa:exile", "crisis.seed.valide.title", "crisis.seed.valide.body", {
            valide: s.members.find((m) => m.alive && m.role === "valide")?.givenName ?? "",
          });
          return logCrisis(next, "saray", "crisis.palace_kalfa.title", "crisis.palace_kalfa.r3", { hatun: other?.givenName ?? "" });
        },
      },
    ],
  },
];

export function crisisByKey(key: string): CrisisDef | undefined {
  return CRISIS_EVENTS.find((e) => e.key === key);
}

export function crisisKeyFor(kind: CrisisKind): string {
  return `crisis_${kind}`;
}

export function crisisEventsFor(kind: CrisisKind): CrisisDef[] {
  return CRISIS_EVENTS.filter((e) => e.kind === kind);
}

export function pickCrisisEvent(s: GameState, kind: CrisisKind, rng: () => number): CrisisDef {
  const pool = crisisEventsFor(kind);
  const fit = pool.filter((e) => !e.when || e.when(s));
  const use = fit.length ? fit : pool;
  const i = Math.floor(rng() * use.length) % Math.max(1, use.length);
  return use[i] ?? pool[0]!;
}
