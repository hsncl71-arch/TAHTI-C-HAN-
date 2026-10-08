import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import { PortraitActor } from "@/components/game/PortraitActor";
import { adultConsorts, availableActions, bondWith, canRomance, childrenInHarem } from "@/domains/dynasty/bonds";
import { isAdult, isChild, motherOfRuler } from "@/domains/dynasty/age";
import type { BondAction, GameAction, GameState } from "@/domains/types";
import { cn } from "@/lib/cn";

const ACTS: BondAction[] = ["meet", "court", "kiss", "private_time", "marry", "halvet"];

export function HaremCourt({
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
  const valide = motherOfRuler(state) ?? state.members.find((m) => m.alive && m.role === "valide");
  const consorts = adultConsorts(state);
  const children = childrenInHarem(state);
  const canIntroduce = state.year - (state.harem?.lastIntroduceYear ?? 0) >= 2 && state.treasury >= 800;

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gilt">{t("harem.title")}</p>
            <h2 className="font-display text-2xl">{t("harem.lead")}</h2>
          </div>
          <div className="min-w-40">
            <p className="text-[0.65rem] uppercase tracking-wider text-silk">{t("harem.intrigue")}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink">
              <div className="h-full rounded-full bg-crimson" style={{ width: `${state.harem?.intrigue ?? 0}%` }} />
            </div>
          </div>
        </div>
        <Button
          className="mt-4"
          variant="gilt"
          disabled={busy || !canIntroduce}
          onClick={() => act({ type: "INTRODUCE_CONSORT" })}
        >
          {t("harem.introduce")}
        </Button>
      </Panel>

      {valide && (
        <Panel>
          <p className="text-xs uppercase tracking-wider text-gilt">{t("role.valide")}</p>
          <div className="mt-2 flex gap-3">
            <div className="w-16 shrink-0">
              <PortraitActor portrait={valide.portrait} name={valide.givenName} age={state.year - valide.birthYear} compact />
            </div>
            <div>
              <h3 className="font-display text-2xl">{valide.givenName}</h3>
              <p className="text-sm text-silk">
                {t("harem.valideHint")} · {t("hanedan.influence")} {valide.influence}
              </p>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {consorts.map((m) => {
          const bond = bondWith(state, m.id);
          const actions = availableActions(state, m.id);
          const fav = state.harem?.favoriteId === m.id;
          return (
            <Panel key={m.id}>
              <div className="flex gap-3">
                <div className="w-16 shrink-0">
                  <PortraitActor portrait={m.portrait} name={m.givenName} age={state.year - m.birthYear} compact expression="warm" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wider text-gilt">
                    {t(`rank.${m.haremRank}`)}
                    {fav ? ` · ${t("harem.favorite")}` : ""}
                  </p>
                  <h3 className="font-display text-2xl">{m.givenName}</h3>
                  <p className="text-sm text-silk">
                    {state.year - m.birthYear} {t("hud.age")} · {t(`bond.${bond?.stage ?? "none"}`)}
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink">
                <div className="h-full rounded-full bg-gilt" style={{ width: `${bond?.warmth ?? 20}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {ACTS.filter((a) => actions.includes(a)).map((a) => (
                  <Button
                    key={a}
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => act({ type: "HAREM_ACT", partnerId: m.id, act: a })}
                  >
                    {t(`harem.act.${a}`)}
                  </Button>
                ))}
                {!fav && (
                  <Button size="sm" variant="gilt" disabled={busy} onClick={() => act({ type: "FAVOR_CONSORT", memberId: m.id })}>
                    {t("harem.favor")}
                  </Button>
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      {children.length > 0 && (
        <Panel>
          <p className="text-xs uppercase tracking-wider text-gilt">{t("harem.children")}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {children.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-md bg-raised px-3 py-2">
                <div className="w-10 shrink-0">
                  <PortraitActor portrait={m.portrait} name={m.givenName} age={state.year - m.birthYear} compact />
                </div>
                <div>
                  <p className="text-ivory">{m.givenName}</p>
                  <p className="text-xs text-silk">
                    {t(`role.${m.role}`)} · {state.year - m.birthYear} {t("hud.age")} · {t("harem.childGuard")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <span className={cn("sr-only")}>
        {consorts.every((c) => canRomance(state, c.id) && isAdult(c, state.year) && !isChild(c, state.year)) ? "ok" : "err"}
      </span>
    </div>
  );
}
