import { useState, useSyncExternalStore } from "react";
import { signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";

const subscribeToNothing = () => () => {};
const noGateOnServer = () => false;

export function AuthChip({ className }: { className?: string }) {
  const { user, isPending } = useCurrentUserState();
  const t = useT();
  const [signingOut, setSigningOut] = useState(false);
  const gateSession = useSyncExternalStore(subscribeToNothing, hasGateSessionMarker, noGateOnServer);

  if (isPending) {
    return <div className={cn("h-8 w-24 animate-pulse rounded-full bg-ivory/10", className)} />;
  }
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "—";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {user.profileImageUrl ? (
        <img src={user.profileImageUrl} alt="" className="size-8 rounded-full object-cover" />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-raised text-xs text-gilt">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="hidden max-w-28 truncate text-xs text-silk sm:block">{label}</span>
      {!gateSession && (
        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOut().catch(() => setSigningOut(false));
          }}
          className="text-xs text-silk underline-offset-4 hover:text-ivory hover:underline disabled:opacity-50"
        >
          {t("app.signout")}
        </button>
      )}
    </div>
  );
}
