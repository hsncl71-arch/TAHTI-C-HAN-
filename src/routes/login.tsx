import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GROK_PROVIDERS, authEnabled, signIn, authClient } from "@/lib/auth/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { CrescentMark } from "@/components/ornament";
import { getAuthFlags } from "@/server/api/notify";

export const Route = createFileRoute("/login")({ component: Login });

async function signInApple(callbackURL: string) {
  const native = (globalThis as { TahtNative?: { appleSignIn?: () => Promise<string> } }).TahtNative;
  if (typeof native?.appleSignIn === "function") {
    const token = await native.appleSignIn();
    const { error } = await authClient.signIn.social({ provider: "apple", idToken: { token } });
    if (error) throw new Error(error.message ?? "apple_failed");
    window.location.href = callbackURL;
    return;
  }
  await authClient.signIn.social({ provider: "apple", callbackURL });
}

function Login() {
  const t = useT();
  const [apple, setApple] = useState(false);
  useEffect(() => {
    void getAuthFlags()
      .then((f) => setApple(Boolean(f.apple)))
      .catch(() => setApple(false));
  }, []);
  return (
    <main className="relative grid min-h-dvh place-items-center bg-ink p-6 text-ivory">
      <img src="/art/courtyard.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" crossOrigin="anonymous" />
      <div className="absolute inset-0 bg-ink/75" />
      <div className="relative z-10 w-full max-w-sm space-y-4 rounded-xl bg-panel/90 p-6 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gilt)_30%,transparent)]">
        <CrescentMark className="size-10 text-gilt" />
        <h1 className="font-display text-4xl">{t("login.title")}</h1>
        <p className="text-sm text-silk">{t("login.lead")}</p>
        {authEnabled ? (
          <>
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                variant="ghost"
                size="block"
                type="button"
                onClick={() => signIn(p.providerId, { callbackURL: "/oyun" })}
              >
                {p.idp === "google" ? t("login.google") : t("login.x")}
              </Button>
            ))}
            {apple && (
              <Button variant="ghost" size="block" type="button" onClick={() => void signInApple("/oyun")}>
                {t("login.apple")}
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-silk">{t("login.disabled")}</p>
        )}
        <Link to="/" className="block text-center text-sm text-gilt hover:underline">
          {t("login.back")}
        </Link>
      </div>
    </main>
  );
}
