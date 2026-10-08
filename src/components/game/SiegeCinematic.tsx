import { Button } from "@/components/ui/button";
import { beatStill, beatVideo, isImportantSiege } from "@/domains/military/siege";
import { allowsKenBurns, allowsVideo, useQuality } from "@/domains/settings/quality";
import type { GameAction, GameState } from "@/domains/types";
import { cn } from "@/lib/cn";

export function SiegeCinematic({
  state,
  t,
  busy,
  act,
  premiumReplay = false,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  busy: boolean;
  act: (a: GameAction) => void;
  premiumReplay?: boolean;
}) {
  const cinema = state.siege?.cinema;
  const quality = useQuality((s) => s.quality);
  const reduced = useQuality((s) => s.reducedMotion);
  if (!cinema) return null;
  const beat = cinema.beats[cinema.index] ?? cinema.beats[0];
  const important = isImportantSiege(state, cinema.provinceId) || premiumReplay;
  const video = allowsVideo(quality) ? beatVideo(beat, important) : null;
  const still = beatStill(beat);
  const last = cinema.index >= cinema.beats.length - 1;
  const p = state.provinces.find((x) => x.id === cinema.provinceId);
  const win = cinema.outcome === "captured" || cinema.outcome === "surrender" || cinema.outcome === "starved";

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/92 p-3 sm:place-items-center">
      <article className="relative z-10 w-full max-w-3xl overflow-hidden rounded-xl bg-panel shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gilt)_40%,transparent)]">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink">
          {video ? (
            <video
              key={beat}
              src={video}
              poster={still}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <img
              src={still}
              alt=""
              className={cn("h-full w-full object-cover", allowsKenBurns(quality, reduced) && "siege-kenburns")}
              crossOrigin="anonymous"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent" />
          <p className="absolute left-4 top-4 text-[0.65rem] uppercase tracking-[0.24em] text-gilt">
            {t("siege.cinema.kicker")}
          </p>
          <p className="absolute bottom-4 left-4 right-4 font-display text-xl text-ivory sm:text-3xl">
            {t(`siege.beat.${beat}`)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.2em] text-gilt">
              {p ? t(p.nameKey) : cinema.provinceId} · {t(`siege.outcome.${cinema.outcome}`)}
            </p>
            <p className="mt-1 text-sm text-silk">
              {t("siege.cinema.resultFirst", {
                atk: cinema.atkPower,
                def: cinema.defPower,
              })}
            </p>
          </div>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ type: "SKIP_SIEGE_CINEMA" })}>
            {t("siege.cinema.skip")}
          </Button>
          <Button
            size="sm"
            variant={win ? "gilt" : "crimson"}
            disabled={busy}
            onClick={() => act(last ? { type: "SKIP_SIEGE_CINEMA" } : { type: "ADVANCE_SIEGE_CINEMA" })}
          >
            {last ? t("siege.cinema.close") : t("siege.cinema.next")}
          </Button>
        </div>
      </article>
    </div>
  );
}
