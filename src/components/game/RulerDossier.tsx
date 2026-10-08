import { Panel } from "@/components/ornament";
import { PortraitActor } from "@/components/game/PortraitActor";
import type { GameState } from "@/domains/types";
import { ageBandOf, expressionForSovereign } from "@/domains/palace/identity";
import { cn } from "@/lib/cn";

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[0.65rem] uppercase tracking-wider text-silk">
        <span>{label}</span>
        <span className="tabular-nums text-ivory">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink">
        <div className="h-full rounded-full bg-gilt" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function RulerDossier({
  state,
  t,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const age = state.year - state.ruler.birthYear;
  const face = state.ruler.identity.face;
  const expr = expressionForSovereign(state, false);
  const band = ageBandOf(age);

  return (
    <Panel className="grid gap-4">
      <PortraitActor
        portrait={state.ruler.portrait}
        name={state.ruler.givenName}
        age={age}
        expression={expr}
        robeId={state.wardrobe?.robeId}
      />
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-gilt">{t("dossier.sovereign")}</p>
        <h2 className="font-display text-3xl leading-tight">{state.ruler.givenName}</h2>
        <p className="text-sm text-silk">
          {state.ruler.title} · {state.ruler.dynastyName} · {age} {t("hud.age")} · {t(`age.${band}`)}
        </p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-gilt">{t("dossier.face")}</p>
        <ul className="mt-1 space-y-0.5 text-sm text-silk">
          <li>{t("face.bone")}: <span className="text-ivory">{face.bone}</span></li>
          <li>{t("face.eyes")}: <span className="text-ivory">{face.eyes}</span></li>
          <li>{t("face.beard")}: <span className="text-ivory">{face.beard}</span></li>
          <li>{t("face.marks")}: <span className="text-ivory">{face.marks}</span></li>
        </ul>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-gilt">{t("dossier.clothing")}</p>
        <p className="text-sm text-ivory">{t(`regalia.${state.ruler.clothing}`)}</p>
        {state.wardrobe?.robeId && state.wardrobe.robeId !== "default" && (
          <p className="text-xs text-gilt">{t(`shop.sku.${state.wardrobe.robeId}.title`)}</p>
        )}
      </div>

      <div className="grid gap-2">
        <p className="text-xs uppercase tracking-wider text-gilt">{t("dossier.health")}</p>
        <Meter label={t("health.vigor")} value={state.ruler.healthFlags.vigor} />
        <Meter label={t("health.fatigue")} value={state.ruler.healthFlags.fatigue} />
        <p className="text-sm text-silk">
          {t("health.constitution")}: <span className="text-ivory">{t(`constitution.${state.ruler.healthFlags.constitution}`)}</span>
        </p>
      </div>

      <div className="grid gap-2">
        <p className="text-xs uppercase tracking-wider text-gilt">{t("dossier.reputation")}</p>
        <Meter label={t("rep.court")} value={state.ruler.reputation.court} />
        <Meter label={t("rep.people")} value={state.ruler.reputation.people} />
        <Meter label={t("rep.ulema")} value={state.ruler.reputation.ulema} />
        <Meter label={t("rep.army")} value={state.ruler.reputation.army} />
      </div>

      <div className="grid gap-2">
        <p className="text-xs uppercase tracking-wider text-gilt">{t("dossier.authority")}</p>
        <Meter label={t("auth.divan")} value={state.ruler.authority.divan} />
        <Meter label={t("auth.army")} value={state.ruler.authority.army} />
        <Meter label={t("auth.harem")} value={state.ruler.authority.harem} />
        <Meter label={t("auth.ulema")} value={state.ruler.authority.ulema} />
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-gilt">{t("dossier.personality")}</p>
        <p className="text-sm text-ivory">{t(`temper.${state.ruler.personality.temper}`)}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {state.ruler.traits.map((tr) => (
            <span key={tr} className="rounded-full bg-raised px-2 py-1 text-xs text-gilt">
              {t(`trait.${tr}`)}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-gilt">{t("dossier.family")}</p>
        <ul className="mt-1 space-y-1 text-sm">
          {state.members
            .filter((m) => m.alive && m.id !== state.ruler.memberId)
            .map((m) => (
              <li key={m.id} className="flex justify-between gap-2 text-silk">
                <span className="text-ivory">{m.givenName}</span>
                <span>
                  {t(`role.${m.role}`)} · {state.year - m.birthYear}
                </span>
              </li>
            ))}
        </ul>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-gilt">{t("dossier.circle")}</p>
        <ul className="mt-1 space-y-1 text-sm">
          {state.courtTies.slice(0, 6).map((tie) => {
            const npc = state.npcs.find((n) => n.id === tie.targetId);
            const mem = state.members.find((m) => m.id === tie.targetId);
            const name = npc?.name ?? mem?.givenName;
            if (!name) return null;
            return (
              <li key={tie.targetId} className="flex justify-between text-silk">
                <span className="text-ivory">{name}</span>
                <span className="tabular-nums">{tie.affinity}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-gilt">{t("dossier.decisions")}</p>
        <ol className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm">
          {state.decisions.slice(0, 8).map((d) => (
            <li key={d.id} className={cn("border-l border-gilt/40 pl-2 text-silk")}>
              <span className="tabular-nums">{d.year}</span> · {t(d.titleKey)}
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}
