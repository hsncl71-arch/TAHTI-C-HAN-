import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import { akce } from "@/components/game/format";
import { cn } from "@/lib/cn";
import { BUILDING_COST, START_YEAR, type Building, type DebtHolder, type DifficultyId, type GameAction, type GameSpeed, type GameState, type ReformId, type TaxBand } from "@/domains/types";
import { DIFFICULTIES, REFORM_IDS, SPEEDS, TAX_BANDS, realmPopulation } from "@/domains/governance/model";
import { campaignCost, computeBudget, totalDebt } from "@/domains/economy/budget";
import { canBorrow, LOAN_RATE } from "@/domains/economy/credit";
import { ownedOf } from "@/domains/economy/model";
import { listReignSlots, loadReignSlot, saveReignSlot } from "@/server/api/slots";

const BUILDINGS: Building[] = ["cami", "medrese", "kervansaray", "tersane", "hisar"];
const HOLDERS: DebtHolder[] = ["galata", "ulema_vakif", "timar"];
const PULSE: (keyof GameState["economy"]["people"])[] = [
  "prosperity",
  "peace",
  "taxPressure",
  "foodAccess",
  "allegiance",
];

export function HazineView({
  state,
  t,
  act,
  busy,
  onRestore,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  act: (a: GameAction) => void;
  busy: boolean;
  onRestore: (s: GameState) => void;
}) {
  const budget = computeBudget(state);
  const debt = totalDebt(state);
  const people = state.economy.people;
  const [borrowAmt, setBorrowAmt] = useState(1500);
  const [holder, setHolder] = useState<DebtHolder>("galata");
  const owned = ownedOf(state).slice().sort((a, b) => b.taxBase - a.taxBase);
  const march = campaignCost(state);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <h2 className="font-display text-2xl">{t("hazine.title")}</h2>
        <p className="mt-1 text-3xl tabular-nums text-gilt">{akce(state.treasury)}</p>
        <p className="mt-1 text-sm text-silk">
          {t("hazine.debt")}: <span className="tabular-nums text-ivory">{akce(debt)}</span>
          {" · "}
          {t("hazine.grain")}: <span className="tabular-nums text-ivory">{akce(state.economy.grainReserve)}</span>
        </p>

        <label className="mt-4 block text-sm text-silk">
          {t("hazine.tax")} · {Math.round(state.taxRate * 100)}%
          <input
            type="range"
            min={4}
            max={24}
            value={Math.round(state.taxRate * 100)}
            disabled={busy}
            onChange={(e) => act({ type: "SET_TAX", rate: Number(e.target.value) / 100 })}
            className="mt-2 w-full accent-crimson"
          />
        </label>
        <label className="mt-3 block text-sm text-silk">
          {t("hazine.tariff")} · {Math.round(state.economy.tariffRate * 100)}%
          <input
            type="range"
            min={2}
            max={18}
            value={Math.round(state.economy.tariffRate * 100)}
            disabled={busy}
            onChange={(e) => act({ type: "SET_TARIFF", rate: Number(e.target.value) / 100 })}
            className="mt-2 w-full accent-gilt"
          />
        </label>
        <p className="mt-3 text-xs uppercase tracking-wider text-silk">{t("tax.band")}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {TAX_BANDS.map((band: TaxBand) => (
            <Button key={band} size="sm" variant={state.governance?.taxBand === band ? "gilt" : "ghost"} disabled={busy} onClick={() => act({ type: "SET_TAX_BAND", band })}>
              {t(`tax.${band}`)}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-silk">{t("divan.effect")}</p>
        {state.relations.some((r) => r.treaty === "war") && state.army.navy >= 24 && (
          <p className="mt-2 text-xs text-gilt">{t("blockade.note")}</p>
        )}

        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-silk">{t("hazine.income")}</dt>
            <dd className="tabular-nums">{akce(budget.totalIncome)}</dd>
          </div>
          <div>
            <dt className="text-silk">{t("hazine.upkeep")}</dt>
            <dd className="tabular-nums">{akce(budget.totalExpense)}</dd>
          </div>
          <div>
            <dt className="text-silk">{t("hazine.net")}</dt>
            <dd className={cn("tabular-nums", budget.net < 0 && "text-crimson")}>{akce(budget.net)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-silk">
          {t("hazine.campaignCost")}: {akce(march)}
        </p>
      </Panel>

      <Panel>
        <h2 className="font-display text-2xl">{t("hazine.people")}</h2>
        <p className="mt-1 text-sm text-silk">{t("hazine.peopleLead")}</p>
        <ul className="mt-4 space-y-3">
          {PULSE.map((key) => (
            <li key={key}>
              <div className="flex justify-between text-sm">
                <span className="text-silk">{t(`people.${key}`)}</span>
                <span className="tabular-nums">{people[key]}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className={cn(
                    "h-full rounded-full",
                    key === "taxPressure" ? "bg-crimson" : "bg-gilt",
                  )}
                  style={{ width: `${people[key]}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        {state.economy.revoltRisk > 45 && (
          <p className="mt-3 text-sm text-crimson">{t("hazine.revoltWarn", { n: state.economy.revoltRisk })}</p>
        )}
        <Button
          className="mt-4"
          size="sm"
          variant="gilt"
          disabled={busy || state.treasury < 400}
          onClick={() => act({ type: "GRAIN_RELIEF", amount: 800 })}
        >
          {t("hazine.relief")}
        </Button>
      </Panel>

      <Panel>
        <h2 className="font-display text-2xl">{t("hazine.forecast")}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <BudgetCol title={t("hazine.income")} lines={budget.income} t={t} />
          <BudgetCol title={t("hazine.upkeep")} lines={budget.expense} t={t} />
        </div>
        <ul className="mt-4 max-h-40 space-y-1 overflow-y-auto text-sm text-silk">
          {state.ledger.slice(0, 10).map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <span>
                {l.year} · {t(l.noteKey)}
              </span>
              <span className="tabular-nums text-ivory">{akce(l.amount)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <h2 className="font-display text-2xl">{t("hazine.credit")}</h2>
        <p className="mt-1 text-sm text-silk">{t("hazine.creditLead")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {HOLDERS.map((h) => (
            <Button key={h} size="sm" variant={holder === h ? "primary" : "ghost"} disabled={busy} onClick={() => setHolder(h)}>
              {t(`debt.${h}`)} · {Math.round(LOAN_RATE[h] * 100)}%
            </Button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={500}
            max={8000}
            step={100}
            value={borrowAmt}
            onChange={(e) => setBorrowAmt(Number(e.target.value))}
            className="h-10 w-28 rounded-md bg-ink/60 px-2 text-sm text-ivory ring-1 ring-line"
          />
          <Button
            size="sm"
            disabled={busy || !canBorrow(state, holder, borrowAmt)}
            onClick={() => act({ type: "BORROW", holder, amount: borrowAmt })}
          >
            {t("hazine.borrow")}
          </Button>
        </div>
        <ul className="mt-4 space-y-2">
          {state.economy.loans.length === 0 && <li className="text-sm text-silk">{t("hazine.noLoans")}</li>}
          {state.economy.loans.map((loan) => (
            <li key={loan.id} className="flex items-center justify-between gap-2 rounded-md bg-raised px-3 py-2">
              <span className="text-sm">
                {t(`debt.${loan.holder}`)} · {akce(loan.principal)} · {Math.round(loan.rate * 100)}%
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || state.treasury < 100}
                onClick={() => act({ type: "REPAY", loanId: loan.id, amount: Math.min(loan.principal, 1000) })}
              >
                {t("hazine.repay")}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <h2 className="font-display text-2xl">{t("reform.lead")}</h2>
        <div className="mt-3 flex flex-wrap gap-1">
          {REFORM_IDS.map((reform: ReformId) => (
            <Button
              key={reform}
              size="sm"
              variant={state.governance?.reforms.includes(reform) ? "gilt" : "ghost"}
              disabled={busy || state.governance?.reforms.includes(reform) || state.treasury < 1600}
              onClick={() => act({ type: "REFORM", reform })}
            >
              {t(`reform.${reform}`)}
            </Button>
          ))}
        </div>
        <p className="mt-4 text-xs text-silk">{t("diff.lead")}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {DIFFICULTIES.map((d: DifficultyId) => (
            <Button key={d} size="sm" variant={state.governance?.difficulty === d ? "gilt" : "ghost"} disabled={busy} onClick={() => act({ type: "SET_DIFFICULTY", difficulty: d })}>
              {t(`diff.${d}`)}
            </Button>
          ))}
        </div>
        <p className="mt-4 text-xs text-silk">{t("speed.lead")}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {SPEEDS.map((speed: GameSpeed) => (
            <Button key={speed} size="sm" variant={state.governance?.speed === speed ? "gilt" : "ghost"} disabled={busy} onClick={() => act({ type: "SET_SPEED", speed })}>
              {t(`speed.${speed}`)}
            </Button>
          ))}
        </div>
        <p className="mt-4 text-xs text-silk">{t("ironman.note")}</p>
        <Button
          className="mt-2"
          size="sm"
          variant={state.governance?.ironman ? "gilt" : "ghost"}
          disabled={busy || state.governance?.ironman || state.year !== START_YEAR}
          onClick={() => act({ type: "SET_IRONMAN", on: true })}
        >
          {t("ironman.on")}
        </Button>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-silk">{t("stat.lands")}</dt><dd className="tabular-nums">{state.provinces.filter((p) => p.ownerId === state.realm.id).length}</dd></div>
          <div><dt className="text-silk">{t("stat.pop")}</dt><dd className="tabular-nums">{akce(realmPopulation(state))}</dd></div>
          <div><dt className="text-silk">{t("stat.income")}</dt><dd className="tabular-nums">{akce(budget.totalIncome)}</dd></div>
          <div><dt className="text-silk">{t("stat.conquests")}</dt><dd className="tabular-nums">{state.governance?.conquests ?? 0}</dd></div>
          <div><dt className="text-silk">{t("stat.wins")}</dt><dd className="tabular-nums">{state.military.battles.filter((b) => b.result === "win").length}</dd></div>
          <div><dt className="text-silk">{t("stat.losses")}</dt><dd className="tabular-nums">{state.governance?.warsLost ?? 0}</dd></div>
          <div><dt className="text-silk">{t("stat.reign")}</dt><dd className="tabular-nums">{state.year - state.ruler.reignStart}</dd></div>
        </dl>
        <details className="mt-4 text-sm text-silk">
          <summary className="cursor-pointer text-ivory">{t("help.title")}</summary>
          <p className="mt-2">{t("help.lead")}</p>
          <p className="mt-2">{t("help.economy")}</p>
          <p className="mt-2">{t("help.loyalty")}</p>
          <p className="mt-2">{t("help.army")}</p>
          <p className="mt-2">{t("help.supply")}</p>
          <p className="mt-2">{t("help.siege")}</p>
          <p className="mt-2">{t("help.diplomacy")}</p>
          <p className="mt-2">{t("help.dynasty")}</p>
          <p className="mt-2">{t("help.revolt")}</p>
          <p className="mt-2">{t("help.trade")}</p>
          <p className="mt-2">{t("help.reform")}</p>
        </details>
      </Panel>

      <ReignSlots state={state} t={t} busy={busy} onRestore={onRestore} />

      <Panel>
        <h2 className="font-display text-2xl">{t("hazine.build")}</h2>
        <ul className="mt-3 space-y-2">
          {BUILDINGS.map((b) => (
            <li key={b} className="flex items-center justify-between gap-3 rounded-md bg-raised px-3 py-2">
              <span>
                {t(`building.${b}`)} · {state.buildings[b]}
                <span className="ml-2 text-xs text-silk">{akce(BUILDING_COST[b])}</span>
              </span>
              <Button size="sm" variant="ghost" disabled={busy || state.treasury < BUILDING_COST[b]} onClick={() => act({ type: "BUILD", building: b })}>
                +
              </Button>
            </li>
          ))}
        </ul>
        {state.world?.works?.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-silk">
            {state.world.works.map((w) => (
              <li key={w.id}>
                {t("nizam.queue")} · {t(`building.${w.building}`)} · {t("nizam.eta", { year: w.etaYear })}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <h2 className="font-display text-2xl">{t("hazine.provinces")}</h2>
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto text-sm">
          {owned.map((p) => {
            const y = budget.provinces.find((x) => x.id === p.id);
            return (
              <li key={p.id} className="flex justify-between gap-2 rounded-md bg-raised/60 px-3 py-1.5">
                <span>
                  {t(p.nameKey)}
                  <span className="ml-2 text-xs text-silk">
                    {t("people.prosperity")} {Math.round(p.prosperity)} · {t("hazine.unrest")} {Math.round(p.unrest)}
                  </span>
                </span>
                <span className="tabular-nums text-gilt">{akce(y?.total ?? 0)}</span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

const SLOT_IDS = ["auto", "a", "b", "c"] as const;

function ReignSlots({
  state,
  t,
  busy,
  onRestore,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  busy: boolean;
  onRestore: (s: GameState) => void;
}) {
  const iron = Boolean(state.governance?.ironman);
  const [rows, setRows] = useState<{ slot: string; year: number; ruler_name: string; lands: number }[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    listReignSlots()
      .then((list) => {
        if (live) setRows(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (live) setRows([]);
      });
    return () => {
      live = false;
    };
  }, [state.year, state.governance?.conquests, state.governance?.peaces]);

  async function write(slot: string) {
    setNote("");
    try {
      await saveReignSlot({ data: { slot } });
      const list = await listReignSlots();
      setRows(Array.isArray(list) ? list : []);
      setNote(t("slot.wrote"));
    } catch (err) {
      const raw = String(err instanceof Error ? err.message : err);
      const key = `error.${raw}`;
      const msg = t(key);
      setNote(msg === key ? t("error.generic") : msg);
    }
  }

  async function open(slot: string) {
    setNote("");
    try {
      const res = await loadReignSlot({ data: { slot } });
      onRestore(res.state);
      setNote(t("slot.opened"));
    } catch (err) {
      const raw = String(err instanceof Error ? err.message : err);
      const key = `error.${raw}`;
      const msg = t(key);
      setNote(msg === key ? t("error.generic") : msg);
    }
  }

  return (
    <Panel>
      <h2 className="font-display text-2xl">{t("slot.lead")}</h2>
      {iron && <p className="mt-2 text-xs text-silk">{t("slot.ironman")}</p>}
      <ul className="mt-3 space-y-2">
        {SLOT_IDS.map((slot) => {
          const row = rows.find((r) => r.slot === slot);
          const locked = iron && slot !== "auto";
          return (
            <li key={slot} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-raised px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-ivory">{t(`slot.${slot}`)}</p>
                <p className="text-xs text-silk">
                  {row ? t("slot.meta", { year: row.year, ruler: row.ruler_name, lands: row.lands }) : t("slot.empty")}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => void write(slot)}>
                  {t("slot.save")}
                </Button>
                <Button size="sm" variant="gilt" disabled={busy || iron || !row} onClick={() => void open(slot)}>
                  {t("slot.load")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {note && <p className="mt-2 text-xs text-gilt">{note}</p>}
    </Panel>
  );
}

function BudgetCol({
  title,
  lines,
  t,
}: {
  title: string;
  lines: { key: string; amount: number }[];
  t: (k: string) => string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-silk">{title}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {lines.map((l) => (
          <li key={l.key} className="flex justify-between gap-2">
            <span className="text-silk">{t(l.key)}</span>
            <span className="tabular-nums">{akce(l.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
