import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { deleteMyAccount } from "@/server/api/account";
import { GFX_QUALITIES, useQuality } from "@/domains/settings/quality";
import { signOut } from "@/lib/auth/client";
import { clearPushOnSignOut } from "@/lib/notify/client";

export function SettingsDesk({
  t,
  onClose,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
  onClose: () => void;
}) {
  const quality = useQuality((s) => s.quality);
  const setQuality = useQuality((s) => s.setQuality);
  const reduced = useQuality((s) => s.reducedMotion);
  const setReduced = useQuality((s) => s.setReducedMotion);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [typed, setTyped] = useState("");

  async function wipe() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteMyAccount({ data: { confirm: "SIL" } });
      setGone(true);
      window.location.href = "/";
    } catch (e) {
      const raw = String(e instanceof Error ? e.message : e);
      const key = `error.${raw}`;
      setErr(t(key) === key ? t("error.generic") : t(key));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-end p-3 sm:place-items-center">
      <button type="button" className="absolute inset-0 bg-ink/70" aria-label={t("set.close")} onClick={onClose} />
      <article className="relative z-10 w-full max-w-md rounded-xl bg-panel p-5 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gilt)_40%,transparent)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gilt">{t("set.kicker")}</p>
            <h2 className="font-display text-2xl text-ivory">{t("set.title")}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center text-silk hover:text-ivory">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-silk">{t("set.lead")}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {GFX_QUALITIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuality(q)}
              className={cn(
                "min-h-11 rounded-md bg-raised px-2 text-sm text-silk ring-1 ring-line",
                quality === q && "text-ivory ring-gilt",
              )}
            >
              {t(`set.gfx.${q}`)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-silk">{t(`set.gfx.${quality}.hint`)}</p>
        <Button
          variant="ghost"
          className="mt-3"
          onClick={() => {
            void clearPushOnSignOut().finally(() => void signOut("/"));
          }}
        >
          {t("set.signout")}
        </Button>
        <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-silk">
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => setReduced(e.target.checked)}
            className="size-4 accent-[var(--color-gilt)]"
          />
          {t("set.motion")}
        </label>
        <p className="mt-1 text-xs text-silk">{t("set.motion.hint")}</p>
        <div className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
          <Link to="/gizlilik" className="block text-gilt hover:underline">
            {t("legal.privacy")}
          </Link>
          <Link to="/magaza" className="block text-gilt hover:underline">
            {t("legal.store")}
          </Link>
          <Link to="/kosullar" className="block text-gilt hover:underline">
            {t("legal.terms")}
          </Link>
          <Link to="/hesap" className="block text-gilt hover:underline">
            {t("legal.account")}
          </Link>
        </div>
        <div className="mt-4 rounded-md bg-raised p-3">
          <p className="text-sm text-ivory">{t("set.delete")}</p>
          <p className="mt-1 text-xs text-silk">{t("set.delete.body")}</p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            placeholder={t("set.delete.type")}
            className="mt-3 min-h-11 w-full rounded-md bg-ink/60 px-3 text-sm ring-1 ring-line"
            autoComplete="off"
          />
          {err && <p className="mt-2 text-xs text-crimson">{err}</p>}
          <Button variant="ghost" className="mt-3" disabled={busy || gone || typed !== "SIL"} onClick={() => void wipe()}>
            {t("set.delete.go")}
          </Button>
        </div>
      </article>
    </div>
  );
}
