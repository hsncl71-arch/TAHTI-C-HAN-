import type { GameAction, GameState } from "@/domains/types";
import { formatLog } from "@/components/game/format";
import { cn } from "@/lib/cn";
import { Bell } from "lucide-react";

export function WorldBell({
  state,
  t,
  act,
  open,
  onToggle,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  act: (a: GameAction) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const unread = (state.world?.notices ?? []).filter((n) => !n.read);
  const list = (state.world?.notices ?? []).slice(0, 8);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          onToggle();
          if (!open && unread.length) act({ type: "MARK_NOTICES_READ" });
        }}
        className="relative grid size-11 place-items-center rounded-md text-silk hover:bg-raised hover:text-ivory"
        aria-label={t("nizam.bell")}
      >
        <Bell className="size-4" strokeWidth={1.6} />
        {unread.length > 0 && (
          <span className="absolute right-2 top-2 size-2 rounded-full bg-crimson" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg bg-panel p-3 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gilt)_28%,transparent)]">
          <p className="text-xs uppercase tracking-widest text-gilt">{t("nizam.bell")}</p>
          {list.length === 0 && <p className="mt-2 text-sm text-silk">{t("nizam.bellEmpty")}</p>}
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {list.map((n) => {
              const f = formatLog(t, { id: n.id, year: n.year, kind: n.kind, titleKey: n.titleKey, bodyKey: n.bodyKey, vars: n.vars });
              return (
                <li key={n.id} className={cn("text-sm", n.severity === "critical" ? "text-ivory" : "text-silk")}>
                  <p className="font-medium text-ivory">{f.title}</p>
                  <p className="text-xs">{f.body}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
