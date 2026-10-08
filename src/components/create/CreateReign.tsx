import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useLocale, useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { CrescentMark } from "@/components/ornament";
import { AuthChip } from "@/components/game/AuthChip";
import { createCampaign } from "@/server/api/campaign";
import { listWorld } from "@/server/api/diplomacy";
import { cn } from "@/lib/cn";
import type { Focus, PortraitKey, SeatClaim, TraitId } from "@/domains/types";
import { FACE_DNA, portraitSrc, SEAT_CATALOG } from "@/domains/index";

const TRAITS: TraitId[] = ["adalet", "cesaret", "ilim", "siyaset", "comertlik", "zahid"];
const FOCUSES: Focus[] = ["fatih", "kanuni", "hunkar"];
const PORTRAITS: PortraitKey[] = ["sultan-a", "sultan-b", "sultan-c"];

export function CreateReign() {
  const { user, isPending } = useCurrentUserState();
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const navigate = useNavigate();
  const [givenName, setGivenName] = useState("Alparslan");
  const [dynastyName, setDynastyName] = useState("Han-ı Cihan");
  const [traits, setTraits] = useState<TraitId[]>(["adalet", "cesaret", "siyaset"]);
  const [focus, setFocus] = useState<Focus>("fatih");
  const [portrait, setPortrait] = useState<PortraitKey>("sultan-a");
  const [seatId, setSeatId] = useState("osmanli");
  const [seats, setSeats] = useState<SeatClaim[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void listWorld()
      .then((w) => {
        setSeats(w.seats);
        const free = w.seats.find((s) => s.claimable);
        if (free) setSeatId(free.realmId);
      })
      .catch(() => undefined);
  }, []);

  function toggle(tr: TraitId) {
    setTraits((cur) => {
      if (cur.includes(tr)) return cur.filter((x) => x !== tr);
      if (cur.length >= 3) return [...cur.slice(1), tr];
      return [...cur, tr];
    });
  }

  async function submit() {
    if (traits.length !== 3) {
      setErr(t("create.needTraits"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await createCampaign({
        data: { givenName, dynastyName, traits, focus, portrait, locale, seatId },
      });
      await navigate({ to: "/oyun" });
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink text-silk">
        {t("app.loading")}
      </main>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <main className="relative min-h-dvh bg-ink text-ivory">
      <img src="/art/throne-room.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" crossOrigin="anonymous" />
      <div className="absolute inset-0 bg-ink/70" />
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6 flex items-center gap-3">
          <CrescentMark className="size-8 text-gilt" />
          <h1 className="font-display text-4xl">{t("create.title")}</h1>
          <div className="ml-auto">
            <AuthChip />
          </div>
        </header>
        <p className="max-w-2xl text-silk">{t("create.lead")}</p>
        <div className="mt-6 grid gap-5">
          <label className="grid gap-1 text-sm">
            {t("create.given")}
            <input
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              className="h-11 rounded-md bg-panel px-3 ring-1 ring-line"
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t("create.dynasty")}
            <input
              value={dynastyName}
              onChange={(e) => setDynastyName(e.target.value)}
              className="h-11 rounded-md bg-panel px-3 ring-1 ring-line"
            />
          </label>
          <fieldset>
            <legend className="text-sm">{t("create.seat")}</legend>
            <p className="mt-1 text-xs text-silk">{t("create.seatLead")}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {SEAT_CATALOG.map((cat) => {
                const seat = seats.find((s) => s.realmId === cat.id);
                const free = !seat || seat.claimable;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    disabled={!free}
                    onClick={() => free && setSeatId(cat.id)}
                    className={cn(
                      "rounded-lg bg-panel p-3 text-left ring-1 ring-line",
                      seatId === cat.id && "ring-gilt",
                      !free && "opacity-40",
                    )}
                  >
                    <span className="block font-display text-xl">{cat.name}</span>
                    <span className="text-xs text-silk">
                      {free ? t("diplomasi.claimable") : t("diplomasi.occupied")}
                      {seat?.live ? ` · ${seat.rulerName}` : ` · ${t("diplomasi.ai")}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm">{t("create.portrait")}</legend>
            <p className="mt-1 text-xs text-silk">{t("create.identity")}</p>
            <div className="mt-2 flex gap-3">
              {PORTRAITS.map((p) => (
                <button key={p} type="button" onClick={() => setPortrait(p)} className={cn("overflow-hidden rounded-md ring-2", portrait === p ? "ring-gilt" : "ring-transparent")}>
                  <img src={portraitSrc(p)} alt="" className="h-32 w-24 object-cover" crossOrigin="anonymous" />
                </button>
              ))}
            </div>
            <ul className="mt-3 space-y-0.5 text-sm text-silk">
              <li>{t("face.bone")}: <span className="text-ivory">{FACE_DNA[portrait].bone}</span></li>
              <li>{t("face.eyes")}: <span className="text-ivory">{FACE_DNA[portrait].eyes}</span></li>
              <li>{t("face.beard")}: <span className="text-ivory">{FACE_DNA[portrait].beard}</span></li>
              <li>{t("face.marks")}: <span className="text-ivory">{FACE_DNA[portrait].marks}</span></li>
            </ul>
          </fieldset>
          <fieldset>
            <legend className="text-sm">
              {t("create.traits")} · {t("create.traitsHint")}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {TRAITS.map((tr) => (
                <button
                  key={tr}
                  type="button"
                  onClick={() => toggle(tr)}
                  className={cn("rounded-full px-3 py-2 text-sm ring-1 ring-line", traits.includes(tr) && "bg-raised text-gilt")}
                >
                  {t(`trait.${tr}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm">{t("create.focus")}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {FOCUSES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFocus(f)}
                  className={cn("rounded-lg bg-panel p-3 text-left ring-1 ring-line", focus === f && "ring-gilt")}
                >
                  <span className="block font-display text-xl">{t(`focus.${f}`)}</span>
                  <span className="text-xs text-silk">{t(`focus.${f}.d`)}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {err && <p className="text-sm text-crimson">{err}</p>}
          <Button disabled={busy} onClick={() => void submit()}>
            {t("create.submit")}
          </Button>
        </div>
      </div>
    </main>
  );
}
