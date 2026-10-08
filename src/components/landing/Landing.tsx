import { Link } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useLocale, useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { CrescentMark } from "@/components/ornament";
import { AuthChip } from "@/components/game/AuthChip";

export function Landing() {
  const { user, isPending } = useCurrentUserState();
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);

  return (
    <main className="relative min-h-dvh overflow-hidden bg-ink text-ivory">
      <img
        src="/art/landing-bosphorus.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        crossOrigin="anonymous"
      />
      <div className="vignette absolute inset-0 bg-ink/50" />
      <div className="relative z-10 flex min-h-dvh flex-col px-5 py-6 sm:px-10">
        <header className="flex items-center gap-3">
          <CrescentMark className="size-8 text-gilt" />
          <span className="font-display text-lg tracking-wide">{t("app.name")}</span>
          <div className="ml-auto flex items-center gap-3">
            <button type="button" className="text-xs text-silk hover:text-ivory" onClick={() => setLocale(locale === "tr" ? "en" : "tr")}>
              {locale === "tr" ? "EN" : "TR"}
            </button>
            {isPending ? <div className="h-8 w-16 animate-pulse rounded-full bg-ivory/10" /> : user ? <AuthChip /> : null}
          </div>
        </header>

        <div className="mx-auto mt-auto max-w-2xl pb-8 pt-24">
          <p className="text-xs uppercase tracking-[0.28em] text-gilt">1453 · Konstantiniyye</p>
          <h1 className="mt-3 font-display text-5xl leading-none sm:text-7xl">{t("app.name")}</h1>
          <p className="mt-4 max-w-lg text-lg text-paper">{t("app.tagline")}</p>
          <ul className="mt-6 space-y-1.5 text-sm text-silk">
            <li>{t("land.k1")}</li>
            <li>{t("land.k2")}</li>
            <li>{t("land.k3")}</li>
            <li>{t("land.k4")}</li>
            <li>{t("land.k5")}</li>
          </ul>
          <p className="mt-4 text-sm text-silk">{t("land.note")}</p>
          <p className="mt-2 text-xs text-silk">{t("legal.age")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {isPending ? (
              <div className="h-11 w-40 animate-pulse rounded-sm bg-ivory/15" />
            ) : user ? (
              <Link to="/oyun">
                <Button>{t("app.continue")}</Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button>{t("app.signin")}</Button>
              </Link>
            )}
          </div>
          <nav className="mt-8 flex flex-wrap gap-4 text-xs text-silk">
            <Link to="/gizlilik" className="hover:text-gilt">
              {t("legal.privacy")}
            </Link>
            <Link to="/hesap" className="hover:text-gilt">
              {t("legal.account")}
            </Link>
            <Link to="/magaza" className="hover:text-gilt">
              {t("legal.store")}
            </Link>
            <Link to="/kosullar" className="hover:text-gilt">
              {t("legal.terms")}
            </Link>
          </nav>
        </div>
      </div>
    </main>
  );
}
