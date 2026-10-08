import { eventByKey } from "@/domains/events/catalog";
import { crisisByKey } from "@/domains/crisis/catalog";
import type { GameState, PendingEvent } from "@/domains/types";
import { Button } from "@/components/ui/button";

export function EventModal({
  state,
  event,
  t,
  busy,
  onChoose,
}: {
  state: GameState;
  event: PendingEvent;
  t: (k: string, vars?: Record<string, string | number>) => string;
  busy: boolean;
  onChoose: (choiceId: string) => void;
}) {
  const def = eventByKey(event.key);
  if (!def) return null;
  const crisis = crisisByKey(event.key);
  const vars: Record<string, string | number> = { name: state.ruler.givenName, ...event.payload };
  if (typeof vars.prov === "string") {
    const label = t(vars.prov);
    if (label !== vars.prov) vars.prov = label;
  }
  if (typeof vars.foe === "string") {
    const name = state.foreign.find((r) => r.id === vars.foe || r.name === vars.foe)?.name;
    if (name) vars.foe = name;
  }
  const heat = crisis ? state.crisis?.heat?.[crisis.kind] ?? 0 : 0;
  return (
    <div className="fixed inset-0 z-40 grid place-items-end p-3 sm:place-items-center">
      <button type="button" className="absolute inset-0 bg-ink/70" aria-label="close overlay" tabIndex={-1} />
      <article className="relative z-10 w-full max-w-lg rounded-xl bg-panel p-5 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gilt)_40%,transparent)] sm:p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-gilt">{crisis ? t("crisis.kicker") : t("event.decide")}</p>
        {crisis && (
          <p className="mt-1 text-xs text-crimson">
            {t(`crisis.kind.${crisis.kind}`)}
            {heat >= 42 ? ` · ${t("crisis.heat", { n: heat })}` : ""}
          </p>
        )}
        <h2 className="mt-2 font-display text-3xl text-ivory">{t(def.titleKey, vars)}</h2>
        <p className="mt-3 text-sm leading-relaxed text-silk">{t(def.bodyKey, vars)}</p>
        {crisis && <p className="mt-3 text-xs leading-relaxed text-gilt">{t("crisis.memory")}</p>}
        <div className="mt-5 grid gap-2">
          {def.choices.map((c) => (
            <div key={c.id} className="grid gap-1">
              <Button variant="ghost" size="block" disabled={busy} onClick={() => onChoose(c.id)}>
                {t(c.labelKey)}
              </Button>
              {c.hintKey && <p className="px-1 text-[0.7rem] leading-snug text-silk">{t(c.hintKey)}</p>}
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}