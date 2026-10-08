import { useMemo, useState } from "react";
import { BookOpen, Columns2, ScrollText } from "lucide-react";
import { Panel } from "@/components/ornament";
import { Button } from "@/components/ui/button";
import { PortraitActor } from "@/components/game/PortraitActor";
import { formatLog } from "@/components/game/format";
import { PremiumLock } from "@/components/game/BazaarView";
import { cn } from "@/lib/cn";
import {
  CANON_FACTS,
  citeSource,
  type CanonFact,
  type GameState,
  type HistoryDivergence,
  type PlayerHistoryEvent,
} from "@/domains/index";
import type { Wallet } from "@/domains/commerce/model";
import { hasFeature } from "@/domains/commerce/entitlements";

type Lane = "canon" | "yours" | "compare";

export function TarihView({
  state,
  t,
  wallet,
  onShop,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  wallet?: Wallet | null;
  onShop?: () => void;
}) {
  const [lane, setLane] = useState<Lane>("compare");
  const reigns = [...(state.reigns ?? [])].slice().reverse();
  const history = state.history;
  const playerEvents = history?.playerEvents ?? [];
  const divergences = history?.divergences ?? [];
  const dueCanon = useMemo(() => CANON_FACTS.filter((f) => f.year <= state.year + 40), [state.year]);
  const reports = Boolean(wallet && hasFeature(wallet, "reports"));

  return (
    <div className="grid gap-4">
      <Panel>
        <p className="text-xs uppercase tracking-wider text-gilt">{t("tarih.kicker")}</p>
        <h2 className="font-display text-2xl">{t("tarih.title")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-silk">{t("tarih.lead")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <LaneBtn id="canon" active={lane === "canon"} label={t("tarih.canon")} onClick={() => setLane("canon")} icon={BookOpen} />
          <LaneBtn id="yours" active={lane === "yours"} label={t("tarih.yours")} onClick={() => setLane("yours")} icon={ScrollText} />
          <LaneBtn id="compare" active={lane === "compare"} label={t("tarih.compare")} onClick={() => setLane("compare")} icon={Columns2} />
        </div>
      </Panel>

      {lane === "canon" && <CanonLane facts={dueCanon} year={state.year} t={t} />}
      {lane === "yours" && <YoursLane events={playerEvents} state={state} t={t} />}
      {lane === "compare" && (
        <CompareLane
          facts={dueCanon}
          events={playerEvents}
          divergences={divergences}
          year={state.year}
          state={state}
          t={t}
        />
      )}

      <Panel>
        <h2 className="font-display text-2xl">{t("tarih.reigns")}</h2>
        <p className="mt-1 text-sm text-silk">{t("tarih.reignsLead")}</p>
        <ol className="mt-4 space-y-3">
          {reigns.map((r) => {
            const snap = r.snapshotEnd ?? r.snapshotStart;
            return (
              <li key={r.id} className="rounded-md bg-raised p-3">
                <div className="flex gap-3">
                  <div className="w-12 shrink-0">
                    <PortraitActor portrait={r.portrait} name={r.givenName} age={r.deathAge ?? state.year - r.startYear + 28} compact />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-gilt">
                      {t("tarih.ordinal", { n: r.ordinal })} · {t("hanedan.gen", { n: r.generation })}
                    </p>
                    <h3 className="font-display text-xl">{r.givenName}</h3>
                    <p className="text-xs tabular-nums text-silk">
                      {r.startYear}–{r.endYear ?? t("tarih.ongoing")}
                    </p>
                    <p className="mt-1 text-sm text-silk">
                      {t("tarih.reignSnap", {
                        treasury: snap.treasury,
                        provinces: snap.provincesOwned,
                        wars: snap.wars.length,
                        debt: snap.debt,
                      })}
                    </p>
                    {r.heirName && <p className="text-xs text-gilt">{t("tarih.heir", { name: r.heirName })}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>

      <PremiumLock
        entitled={reports}
        title={t("shop.perk.reports")}
        body={t("shop.lock.reports")}
        onShop={onShop ?? (() => undefined)}
        t={t}
      >
        <Panel>
          <h2 className="font-display text-2xl">{t("shop.report.title")}</h2>
          <p className="mt-1 text-sm text-silk">{t("shop.report.lead")}</p>
          <p className="mt-3 text-sm text-ivory">
            {t("shop.report.stats", {
              events: playerEvents.length,
              div: divergences.length,
              reigns: (state.reigns ?? []).length,
              year: state.year,
            })}
          </p>
          <ol className="mt-4 space-y-2">
            {reigns.slice(0, 8).map((r) => {
              const a = r.snapshotStart;
              const b = r.snapshotEnd ?? r.snapshotStart;
              return (
                <li key={`rep-${r.id}`} className="rounded-md bg-raised p-3 text-sm text-silk">
                  <p className="font-medium text-ivory">{r.givenName}</p>
                  <p>
                    {t("shop.report.delta", {
                      treasury: b.treasury - a.treasury,
                      provinces: b.provincesOwned - a.provincesOwned,
                      wars: b.wars.length,
                    })}
                  </p>
                </li>
              );
            })}
          </ol>
          <Button
            className="mt-4"
            variant="ghost"
            onClick={() => {
              const blob = new Blob(
                [JSON.stringify({ year: state.year, reigns: state.reigns, history: state.history }, null, 2)],
                { type: "application/json" },
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `taht-tarih-${state.year}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t("shop.export")}
          </Button>
        </Panel>
      </PremiumLock>
    </div>
  );
}

function LaneBtn({
  id,
  active,
  label,
  onClick,
  icon: Icon,
}: {
  id: string;
  active: boolean;
  label: string;
  onClick: () => void;
  icon: typeof BookOpen;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm",
        active ? "bg-raised text-ivory" : "text-silk hover:bg-raised/60 hover:text-ivory",
      )}
    >
      <Icon className="size-4" strokeWidth={1.6} />
      {label}
      <span className="sr-only">{id}</span>
    </button>
  );
}

function CanonLane({
  facts,
  year,
  t,
}: {
  facts: CanonFact[];
  year: number;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <Panel>
      <h3 className="font-display text-xl">{t("tarih.canon")}</h3>
      <p className="mt-1 text-sm text-silk">{t("tarih.canonLead")}</p>
      <ol className="timeline-rail mt-4 space-y-4 pl-4">
        {facts.map((f) => (
          <CanonCard key={f.id} fact={f} year={year} t={t} />
        ))}
      </ol>
    </Panel>
  );
}

function YoursLane({
  events,
  state,
  t,
}: {
  events: PlayerHistoryEvent[];
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <Panel>
      <h3 className="font-display text-xl">{t("tarih.yours")}</h3>
      <p className="mt-1 text-sm text-silk">{t("tarih.yoursLead")}</p>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-silk">{t("tarih.yoursEmpty")}</p>
      ) : (
        <ol className="timeline-rail mt-4 space-y-4 pl-4">
          {events.map((e) => (
            <PlayerCard key={e.id} event={e} state={state} t={t} />
          ))}
        </ol>
      )}
    </Panel>
  );
}

function CompareLane({
  facts,
  events,
  divergences,
  year,
  state,
  t,
}: {
  facts: CanonFact[];
  events: PlayerHistoryEvent[];
  divergences: HistoryDivergence[];
  year: number;
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const byCanon = new Map(divergences.map((d) => [d.canonId, d]));
  return (
    <div className="grid gap-4">
      <Panel>
        <h3 className="font-display text-xl">{t("tarih.compare")}</h3>
        <p className="mt-1 text-sm text-silk">{t("tarih.compareLead")}</p>
        {divergences.length === 0 ? (
          <p className="mt-4 text-sm text-silk">{t("tarih.noDiv")}</p>
        ) : (
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {divergences.map((d) => {
              const f = formatLog(t, { id: d.id, year: d.year, kind: d.kind, titleKey: d.titleKey, bodyKey: d.bodyKey, vars: d.vars }, state);
              const fact = facts.find((x) => x.id === d.canonId);
              return (
                <li key={d.id} className="rounded-md bg-raised p-3">
                  <p className="text-xs uppercase tracking-wider text-gilt">{t(`tarih.div.${d.kind}`)}</p>
                  <p className="text-xs tabular-nums text-silk">{d.year}</p>
                  <p className="font-medium">{fact ? t(fact.titleKey) : f.title}</p>
                  <p className="text-sm text-silk">{f.body}</p>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <p className="text-xs uppercase tracking-wider text-gilt">{t("tarih.badge.canon")}</p>
          <ol className="timeline-rail mt-3 space-y-4 pl-4">
            {facts.map((f) => (
              <CanonCard key={f.id} fact={f} year={year} t={t} mark={byCanon.get(f.id)} />
            ))}
          </ol>
        </Panel>
        <Panel>
          <p className="text-xs uppercase tracking-wider text-gilt">{t("tarih.badge.yours")}</p>
          <ol className="timeline-rail mt-3 space-y-4 pl-4">
            {events.map((e) => (
              <PlayerCard key={e.id} event={e} state={state} t={t} />
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}

function CanonCard({
  fact,
  year,
  t,
  mark,
}: {
  fact: CanonFact;
  year: number;
  t: (k: string, v?: Record<string, string | number>) => string;
  mark?: HistoryDivergence;
}) {
  const future = fact.year > year;
  return (
    <li className={cn("relative", future && "opacity-70")}>
      <p className="text-xs tabular-nums text-silk">{fact.year}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <span className="rounded-sm bg-raised px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wider text-gilt">
          {t("tarih.badge.canon")}
        </span>
        {fact.starting && (
          <span className="text-[0.65rem] uppercase tracking-wider text-silk">{t("tarih.starting")}</span>
        )}
        {future && <span className="text-[0.65rem] uppercase tracking-wider text-silk">{t("tarih.future")}</span>}
        {mark && <span className="text-[0.65rem] uppercase tracking-wider text-crimson">{t(`tarih.div.${mark.kind}`)}</span>}
      </div>
      <p className="font-medium">{t(fact.titleKey)}</p>
      <p className="text-sm text-silk">{t(fact.bodyKey)}</p>
      {future && <p className="mt-1 text-xs text-silk">{t("tarih.canonFuture", { year: fact.year })}</p>}
      <p className="mt-1 text-xs text-silk/80">
        {t("tarih.source")}: {fact.sources.map((id) => citeSource(id)).join(" · ")}
      </p>
    </li>
  );
}

function PlayerCard({
  event,
  state,
  t,
}: {
  event: PlayerHistoryEvent;
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const f = formatLog(t, event, state);
  return (
    <li>
      <p className="text-xs tabular-nums text-silk">{event.year}</p>
      <span className="rounded-sm bg-crimson/30 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wider text-ivory">
        {t("tarih.badge.yours")}
      </span>
      <p className="font-medium">{f.title}</p>
      <p className="text-sm text-silk">{f.body}</p>
    </li>
  );
}
