import { Button } from "@/components/ui/button";
import { PortraitActor } from "@/components/game/PortraitActor";
import { INTIMATE_STEPS, sceneArt, sceneLine } from "@/domains/dynasty/intimacy";
import { canRomance } from "@/domains/dynasty/bonds";
import type { GameAction, GameState, Locale } from "@/domains/types";
import { cn } from "@/lib/cn";

export function IntimateCinematic({
  state,
  locale,
  t,
  busy,
  act,
}: {
  state: GameState;
  locale: Locale;
  t: (k: string, v?: Record<string, string | number>) => string;
  busy: boolean;
  act: (a: GameAction) => void;
}) {
  const scene = state.harem?.scene;
  if (!scene) return null;
  const partner = state.members.find((m) => m.id === scene.partnerId);
  if (!partner || !canRomance(state, partner.id)) {
    return null;
  }
  const art = sceneArt(scene.step);
  const idx = INTIMATE_STEPS.indexOf(scene.step);
  const last = idx >= INTIMATE_STEPS.length - 1;
  const age = state.year - partner.birthYear;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/90 p-3 sm:place-items-center">
      <article className="relative z-10 w-full max-w-2xl overflow-hidden rounded-xl bg-panel shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gilt)_40%,transparent)]">
        <div className={cn("relative aspect-[16/9] w-full bg-ink", scene.step === "fade" && "intimate-fade")}>
          {art && scene.step !== "fade" ? (
            <img src={art} alt="" className="h-full w-full object-cover" crossOrigin="anonymous" />
          ) : (
            <div className="h-full w-full bg-ink" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
          <p className="absolute bottom-4 left-4 right-4 font-display text-xl text-ivory sm:text-2xl">
            {sceneLine(scene.step, locale)}
          </p>
        </div>
        <div className="flex items-center gap-3 p-4">
          <div className="w-14 shrink-0">
            <PortraitActor portrait={partner.portrait} name={partner.givenName} age={age} compact expression="warm" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.2em] text-gilt">{t("harem.privacy")}</p>
            <p className="text-sm text-silk">{t("harem.privacyHint")}</p>
          </div>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ type: "SKIP_SCENE" })}>
            {t("harem.skip")}
          </Button>
          <Button size="sm" variant="gilt" disabled={busy} onClick={() => act(last ? { type: "SKIP_SCENE" } : { type: "ADVANCE_SCENE" })}>
            {last ? t("harem.dawn") : t("harem.next")}
          </Button>
        </div>
      </article>
    </div>
  );
}
