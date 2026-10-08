import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../world/seed.ts";
import { applyAction, yearlyForecast } from "../world/engine.ts";
import { migrateState } from "../palace/migrate.ts";
import { computeBudget, totalDebt, campaignCost } from "./budget.ts";
import { canBorrow, openLoan, repayLoan } from "./credit.ts";
import { ensureEconomy } from "./model.ts";
import { computePeople } from "./tick.ts";
import { STATE_VERSION, type GameState } from "../types.ts";
import { drainModals, playYears } from "../integration/play.ts";

const INPUT = {
  givenName: "Alparslan",
  dynastyName: "Han-ı Cihan",
  traits: ["adalet", "cesaret", "siyaset"] as const,
  focus: "fatih" as const,
  portrait: "sultan-a" as const,
  locale: "tr" as const,
};

function fresh(): GameState {
  return createInitialState({ ...INPUT, traits: [...INPUT.traits] }, "econ-user");
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

describe("deep economy engine", () => {
  it("seeds a full ledger with province yields and a people pulse", () => {
    const s = fresh();
    assert.equal(s.version, STATE_VERSION);
    assert.ok(s.economy);
    assert.ok(s.economy.tariffRate > 0);
    const owned = s.provinces.filter((p) => p.ownerId === s.realm.id);
    assert.ok(owned.length >= 8);
    for (const p of owned) {
      assert.ok(p.agriculture > 0);
      assert.ok(p.production > 0);
      assert.ok(p.trade > 0);
      assert.ok(typeof p.port === "string");
    }
    const capital = s.provinces.find((p) => p.id === "konstantiniyye")!;
    assert.equal(capital.port, "arsenal");
    const b = computeBudget(s);
    assert.ok(b.income.some((l) => l.key === "budget.in.tax" && l.amount > 0));
    assert.ok(b.income.some((l) => l.key === "budget.in.agriculture" && l.amount > 0));
    assert.ok(b.income.some((l) => l.key === "budget.in.trade" && l.amount > 0));
    assert.ok(b.income.some((l) => l.key === "budget.in.customs"));
    assert.ok(b.income.some((l) => l.key === "budget.in.ports" && l.amount > 0));
    assert.ok(b.expense.some((l) => l.key === "budget.out.military" && l.amount < 0));
    assert.ok(b.expense.some((l) => l.key === "budget.out.palace" && l.amount < 0));
    assert.ok(b.expense.some((l) => l.key === "budget.out.navy" && l.amount < 0));
    assert.equal(b.totalIncome, b.income.reduce((a, l) => a + l.amount, 0));
    assert.ok(b.net > -4000, `net ${b.net}`);
    const f = yearlyForecast(s);
    assert.equal(f.income, b.totalIncome);
    assert.equal(f.upkeep, b.totalExpense);
    assert.ok(s.economy.people.prosperity > 0);
    assert.ok(s.economy.people.foodAccess > 0);
    assert.ok(s.economy.people.allegiance > 0);
  });

  it("is deterministic for the same seed", () => {
    const a = computeBudget(fresh());
    const b = computeBudget(fresh());
    assert.deepEqual(a.income, b.income);
    assert.deepEqual(a.expense, b.expense);
    assert.equal(a.net, b.net);
  });

  it("raises tax pressure when the tithe is hiked", () => {
    const s = fresh();
    const low = applyAction(s, { type: "SET_TAX", rate: 0.06 }).state;
    const high = applyAction(s, { type: "SET_TAX", rate: 0.22 }).state;
    const pLow = computePeople(low, low.economy.grainReserve);
    const pHigh = computePeople(high, high.economy.grainReserve);
    assert.ok(pHigh.taxPressure > pLow.taxPressure);
    const bLow = computeBudget(low);
    const bHigh = computeBudget(high);
    assert.ok(bHigh.totalIncome > bLow.totalIncome);
  });

  it("opens and repays a Galata loan without AI", () => {
    const s = fresh();
    assert.equal(canBorrow(s, "galata", 1500), true);
    const borrowed = applyAction(s, { type: "BORROW", holder: "galata", amount: 1500 }).state;
    assert.ok(borrowed.treasury > s.treasury);
    assert.equal(borrowed.economy.loans.length, 1);
    assert.equal(borrowed.economy.loans[0].holder, "galata");
    assert.ok(totalDebt(borrowed) >= 1500);
    const paid = applyAction(borrowed, { type: "REPAY", loanId: borrowed.economy.loans[0].id, amount: 1500 }).state;
    assert.equal(paid.economy.loans.length, 0);
    assert.ok(paid.treasury < borrowed.treasury);
  });

  it("blocks waqf credit when piety is too low", () => {
    const s = { ...fresh(), piety: 10 };
    assert.equal(canBorrow(s, "ulema_vakif", 1000), false);
    const next = applyAction(s, { type: "BORROW", holder: "ulema_vakif", amount: 1000 }).state;
    assert.equal(next.economy.loans.length, 0);
  });

  it("charges a campaign cost when the host marches", () => {
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
  });

  it("turns a bad year into grain loss, unrest and revolt risk", () => {
    let s = clearEvents(fresh());
    s = {
      ...s,
      taxRate: 0.24,
      treasury: 200,
      economy: { ...s.economy, grainReserve: 40, tariffRate: 0.18 },
      provinces: s.provinces.map((p) =>
        p.ownerId === s.realm.id ? { ...p, loyalty: 28, grain: 18, unrest: 62, prosperity: 24 } : p,
      ),
    };
    const year = applyAction(s, { type: "ADVANCE_YEAR" }).state;
    assert.ok(year.economy.people.taxPressure > 50);
    assert.ok(year.economy.revoltRisk > 20);
    assert.ok(year.economy.lastBudget);
    assert.equal(year.economy.lastBudget?.year, year.year);
  });

  it("opens relief that spends treasury and feeds the granary", () => {
    const s = fresh();
    const next = applyAction(s, { type: "GRAIN_RELIEF", amount: 800 }).state;
    assert.ok(next.treasury < s.treasury);
    assert.ok(next.economy.grainReserve > s.economy.grainReserve);
    assert.ok(next.economy.people.foodAccess >= s.economy.people.foodAccess);
  });

  it("migrates old saves onto version 6 without dropping the court", () => {
    const s = fresh();
    const raw = JSON.parse(JSON.stringify(s)) as GameState;
    delete (raw as { economy?: unknown }).economy;
    raw.version = 5;
    raw.provinces = raw.provinces.map((p) => ({
      ...p,
      agriculture: 0,
      production: 0,
      trade: 0,
      grain: 0,
    }));
    const migrated = migrateState(raw);
    assert.equal(migrated.version, STATE_VERSION);
    assert.ok(migrated.economy);
    assert.ok(migrated.provinces[0].agriculture > 0);
    assert.ok(migrated.court.length >= 10);
    assert.ok(migrated.harem.bonds.length >= 1);
    const twice = migrateState(migrated);
    assert.equal(twice.economy.tariffRate, migrated.economy.tariffRate);
    assert.equal(twice.provinces[0].id, migrated.provinces[0].id);
  });

  it("keeps yearlyForecast wrappers used by Divan counsel", () => {
    const s = ensureEconomy(fresh());
    const f = yearlyForecast(s);
    assert.ok(typeof f.income === "number");
    assert.ok(typeof f.upkeep === "number");
    assert.ok(typeof f.power === "number");
    assert.ok(f.budget.provinces.length >= 8);
  });

  it("does not let a loan exceed the debt cap", () => {
    let s = fresh();
    s = openLoan(s, "galata", 8000);
    s = openLoan(s, "galata", 8000);
    s = openLoan(s, "galata", 8000);
    const before = s.economy.loans.length;
    const blocked = openLoan(s, "galata", 8000);
    assert.equal(blocked.economy.loans.length, before);
    const paid = repayLoan(s, s.economy.loans[0].id, 500);
    assert.ok(paid.economy.loans[0].principal < s.economy.loans[0].principal);
  });

  it("survives high tax, famine, debt and war spending without NaN", () => {
    let s = drainModals(fresh());
    s = applyAction(s, { type: "SET_TAX", rate: 0.22 }).state;
    s = applyAction(s, { type: "BORROW", holder: "galata", amount: 2500 }).state;
    s = applyAction(s, { type: "RAISE_TROOPS", kind: "janissary", count: 800 }).state;
    s = applyAction(s, { type: "LAUNCH_CAMPAIGN", provinceId: "konya" }).state;
    s = playYears(s, 40);
    assert.equal(Number.isFinite(s.treasury), true);
    assert.equal(Number.isFinite(s.economy.grainReserve), true);
    assert.ok(s.treasury > -50_000 && s.treasury < 90_000, `treasury ${s.treasury}`);
    const people = computePeople(s, s.economy.grainReserve);
    assert.ok(people.taxPressure >= 0 && people.taxPressure <= 100);
  });
});
