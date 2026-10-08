import { Panel } from "@/components/ornament";
import { cn } from "@/lib/cn";
import { CRISIS_KINDS, type GameState } from "@/domains/types";
import { hottestKind } from "@/domains/crisis/heat";

export function CrisisPulse({
  state,
  t,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const heat = state.crisis?.heat;
  if (!heat) return null;
  const top = hottestKind(state);
  const seeds = [...(state.crisis.seeds ?? [])].sort((a, b) => a.ripeYear - b.ripeYear || a.id.localeCompare(b.id));
  const log = (state.crisis.log ?? []).slice(0, 5);
  return (
    <Panel>
      <p className="text-xs uppercase tracking-[0.2em] text-gilt">{t("crisis.kicker")}</p>
      <h3 className="font-display text-xl">{t("crisis.title")}</h3>
      <p className="mt-1 text-sm text-silk">{t("crisis.lead")}</p>
      <p className="mt-2 text-xs text-silk">
        {t("crisis.hottest", { kind: t(`crisis.kind.${top.kind}`), n: top.value })}
        {seeds.length > 0 ? ` · ${t("crisis.seeds", { n: seeds.length })}` : ""}
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {CRISIS_KINDS.map((kind) => (
          <li key={kind}>
            <div className="flex items-center justify-between text-xs">
              <span className={cn(heat[kind] >= 60 ? "text-crimson" : "text-silk")}>{t(`crisis.kind.${kind}`)}</span>
              <span className="tabular-nums text-ivory">{heat[kind]}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
              <div
                className={cn("h-full origin-left bg-gilt", heat[kind] >= 60 && "bg-crimson")}
                style={{ transform: `scaleX(${Math.max(0.02, heat[kind] / 100)})` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {seeds.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs uppercase tracking-wider text-gilt">{t("crisis.planted")}</p>
          <ul className="mt-2 space-y-2">
            {seeds.slice(0, 6).map((seed) => {
              const left = seed.ripeYear - state.year;
              return (
                <li key={seed.id} className="text-sm">
                  <p className="text-ivory">{t(seed.titleKey, seed.payload)}</p>
                  <p className="text-xs text-silk">
                    {t(`crisis.kind.${seed.kind}`)}
                    {" · "}
                    {left <= 0 ? t("crisis.ripeNow") : t("crisis.ripe", { n: left })}
                    {seed.sequel ? ` · ${t("crisis.returns")}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {log.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs uppercase tracking-wider text-gilt">{t("crisis.log")}</p>
          <ol className="mt-2 space-y-1 text-xs text-silk">
            {log.map((row) => (
              <li key={row.id} className="flex justify-between gap-3">
                <span>
                  {row.year} · {t(`crisis.kind.${row.kind}`)}
                </span>
                <span className="text-ivory">{row.choiceId}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}

export function crisisHudLabel(
  state: GameState,
  t: (k: string, v?: Record<string, string | number>) => string,
): string | null {
  const top = hottestKind(state);
  if (top.value < 50) return null;
  return t("crisis.hud", { n: top.value, kind: t(`crisis.kind.${top.kind}`) });
}