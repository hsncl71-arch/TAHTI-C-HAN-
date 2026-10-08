import { clamp, nid } from "@/domains/ids";
import type { DebtHolder, GameState, Loan } from "@/domains/types";
import { DEBT_CAP, LOAN_MAX, LOAN_MIN, fillEconomy } from "@/domains/economy/model";
import { totalDebt } from "@/domains/economy/budget";

export const LOAN_RATE: Record<DebtHolder, number> = {
  galata: 0.09,
  ulema_vakif: 0.06,
  timar: 0.07,
};

export function canBorrow(s: GameState, holder: DebtHolder, amount: number): boolean {
  if (amount < LOAN_MIN || amount > LOAN_MAX) return false;
  if (totalDebt(s) + amount > DEBT_CAP) return false;
  if (holder === "ulema_vakif" && s.piety < 38) return false;
  if (holder === "timar" && s.army.morale < 40) return false;
  return true;
}

export function openLoan(s: GameState, holder: DebtHolder, amount: number): GameState {
  const principal = Math.round(clamp(amount, LOAN_MIN, LOAN_MAX));
  if (!canBorrow(s, holder, principal)) return s;
  const loan: Loan = {
    id: nid("loan"),
    holder,
    principal,
    rate: LOAN_RATE[holder],
    yearOpened: s.year,
  };
  const eco = fillEconomy(s.economy);
  let next: GameState = {
    ...s,
    treasury: Math.round(s.treasury + principal),
    economy: { ...eco, loans: [...eco.loans, loan] },
    ledger: [
      { id: nid("led"), year: s.year, kind: "gelir", amount: principal, noteKey: `ledger.loan.${holder}` },
      ...s.ledger,
    ].slice(0, 80),
  };
  if (holder === "galata") next = { ...next, prestige: clamp(next.prestige - 1, 0, 100) };
  if (holder === "ulema_vakif") next = { ...next, piety: clamp(next.piety - 2, 0, 100) };
  if (holder === "timar") next = { ...next, army: { ...next.army, morale: clamp(next.army.morale - 2, 10, 100) } };
  return next;
}

export function repayLoan(s: GameState, loanId: string, amount: number): GameState {
  const eco = fillEconomy(s.economy);
  const loan = eco.loans.find((l) => l.id === loanId);
  if (!loan || amount <= 0) return s;
  const pay = Math.min(Math.round(amount), loan.principal, Math.max(0, s.treasury));
  if (pay <= 0) return s;
  const remain = loan.principal - pay;
  const loans = remain <= 0 ? eco.loans.filter((l) => l.id !== loanId) : eco.loans.map((l) => (l.id === loanId ? { ...l, principal: remain } : l));
  return {
    ...s,
    treasury: Math.round(s.treasury - pay),
    economy: { ...eco, loans },
    prestige: clamp(s.prestige + (remain <= 0 ? 2 : 0), 0, 100),
    ledger: [
      { id: nid("led"), year: s.year, kind: "gider", amount: -pay, noteKey: "ledger.repay" },
      ...s.ledger,
    ].slice(0, 80),
  };
}

export function absorbDeficit(s: GameState): GameState {
  if (s.treasury >= 0) return s;
  const need = Math.min(LOAN_MAX, Math.max(LOAN_MIN, Math.ceil(-s.treasury / 100) * 100 + 200));
  if (!canBorrow(s, "galata", need)) return s;
  return openLoan(s, "galata", need);
}
