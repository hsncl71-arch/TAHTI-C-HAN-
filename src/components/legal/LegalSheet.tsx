import { Link } from "@tanstack/react-router";
import { CrescentMark } from "@/components/ornament";
import { useT } from "@/lib/i18n";
import { OWNER_EMAIL } from "@/domains/security/owner";
import { BUNDLE_APPLE, PACKAGE_GOOGLE } from "@/domains/commerce/catalog";

export type LegalKind = "privacy" | "account" | "store" | "terms";

export function LegalSheet({ kind }: { kind: LegalKind }) {
  const t = useT();
  return (
    <main className="min-h-dvh bg-ink px-5 py-8 text-ivory">
      <div className="mx-auto max-w-2xl">
        <CrescentMark className="size-8 text-gilt" />
        <p className="mt-4 text-xs uppercase tracking-[0.2em] text-gilt">{t("app.name")}</p>
        <h1 className="mt-2 font-display text-4xl">{t(`legal.${kind}.title`)}</h1>
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-paper">{t(`legal.${kind}.body`, { email: OWNER_EMAIL, apple: BUNDLE_APPLE, google: PACKAGE_GOOGLE })}</p>
        <nav className="mt-8 flex flex-wrap gap-4 text-sm text-gilt">
          <Link to="/" className="hover:underline">
            {t("login.back")}
          </Link>
          <Link to="/gizlilik" className="hover:underline">
            {t("legal.privacy")}
          </Link>
          <Link to="/hesap" className="hover:underline">
            {t("legal.account")}
          </Link>
          <Link to="/magaza" className="hover:underline">
            {t("legal.store")}
          </Link>
          <Link to="/kosullar" className="hover:underline">
            {t("legal.terms")}
          </Link>
        </nav>
      </div>
    </main>
  );
}
