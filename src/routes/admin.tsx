import { createFileRoute } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useT } from "@/lib/i18n";
import { OwnerDivan } from "@/components/game/OwnerDivan";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const t = useT();
  if (isPending) {
    return <main className="grid min-h-dvh place-items-center bg-ink text-silk">{t("app.loading")}</main>;
  }
  if (!user) return <RedirectToSignIn />;
  return <OwnerDivan />;
}
