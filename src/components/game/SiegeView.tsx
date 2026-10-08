import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import { cn } from "@/lib/cn";
import { SIEGE_ACTIONS, type GameAction, type GameState, type SiegeActionId } from "@/domains/types";
import { commanderLabel } from "@/domains/military/campaign";
import { isImportantSiege, siegeProgressOf } from "@/domains/military/siege";

function Meter({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-[0.65rem] uppercase tracking-wider text-silk">
        <span>{label}</span>
        <span className="tabular-nums text-ivory">{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink">
        <div
          className={cn("h-full rounded-full", warn && value < 35 ? "bg-crimson" : "bg-gilt")}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function SiegeView({
  state,
  t,
  act,
  busy,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  act: (a: GameAction) => void;
  busy: boolean;
}) {
  const siege = state.siege;
  if (!siege || siege.cinema) return null;
  const p = state.provinces.find((x) => x.id === siege.provinceId);
  const progress = siegeProgressOf(siege);
  const important = isImportantSiege(state, siege.provinceId);
  const ratio = siege.defPower > 0 ? siege.atkPower / siege.defPower : 1;
  const stormReady = siege.host.preparation >= 18 || siege.defense.walls < 70 || siege.defense.gates < 65;

  return (
    <Panel className="lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.22em] text-gilt">{t("siege.kicker")}</p>
          <h2 className="font-display text-2xl">{t("siege.title", { prov: p ? t(p.nameKey) : siege.provinceId })}</h2>
          <p className="mt-1 text-sm text-silk">
            {t(`siege.phase.${siege.phase}`)} · {t("siege.year", { n: siege.yearOpened })} · {t("ordu.commander")}: {commanderLabel(state)}
            {important ? ` · ${t("siege.important")}` : ""}
          </p>
        </div>
        <p className="tabular-nums text-gilt">{t("siege.progress", { n: progress })}</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-raised p-3">
          <h3 className="font-display text-lg">{t("siege.city")}</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Meter label={t("siege.walls")} value={siege.defense.walls} warn />
            <Meter label={t("siege.gates")} value={siege.defense.gates} warn />
            <Meter label={t("siege.defense")} value={siege.defense.defense} />
            <Meter label={t("siege.provisions")} value={siege.defense.provisions} warn />
            <Meter label={t("siege.morale")} value={siege.defense.morale} warn />
            <div>
              <p className="text-[0.65rem] uppercase tracking-wider text-silk">{t("siege.garrison")}</p>
              <p className="mt-1 tabular-nums text-ivory">{Math.round(siege.defense.garrison)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-raised p-3">
          <h3 className="font-display text-lg">{t("siege.host")}</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[0.65rem] uppercase tracking-wider text-silk">{t("siege.artillery")}</p>
              <p className="mt-1 tabular-nums text-ivory">{siege.host.artillery}</p>
            </div>
            <Meter label={t("siege.preparation")} value={siege.host.preparation} />
            <Meter label={t("ordu.supply")} value={siege.host.supply} warn />
            <div>
              <p className="text-[0.65rem] uppercase tracking-wider text-silk">{t("siege.men")}</p>
              <p className="mt-1 tabular-nums text-ivory">{Math.round(siege.host.men)}</p>
            </div>
            <Meter label={t("siege.command")} value={siege.host.commanderScore} />
            <p className="col-span-2 text-xs text-silk">
              {t("siege.forecast")}: {Math.round(siege.atkPower)} / {Math.round(siege.defPower)}
              {ratio >= 1.1 ? ` · ${t("siege.edge")}` : ratio <= 0.8 ? ` · ${t("siege.risk")}` : ""}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-silk">{t("siege.simFirst")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SIEGE_ACTIONS.map((action: SiegeActionId) => (
          <Button
            key={action}
            size="sm"
            variant={action === "storm" ? "crimson" : siege.lastAction === action ? "gilt" : "ghost"}
            disabled={busy || (action === "storm" && !stormReady)}
            onClick={() => act(action === "storm" ? { type: "STORM_FORT" } : { type: "SIEGE_ACTION", action })}
          >
            {t(`siege.act.${action}`)}
          </Button>
        ))}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ type: "RECALL_ARMY" })}>
          {t("ordu.retreat")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-silk">{t(`siege.hint.${siege.lastAction ?? "open"}`)}</p>
      {siege.log[0] && (
        <p className="mt-2 text-sm text-ivory">{t(siege.log[0].noteKey, siege.log[0].vars)}</p>
      )}
    </Panel>
  );
}
