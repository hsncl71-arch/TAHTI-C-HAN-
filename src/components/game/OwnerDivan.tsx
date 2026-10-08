import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  BarChart3,
  Bot,
  Flag,
  Globe2,
  Package,
  Scale,
  ScrollText,
  Server,
  Shield,
  Users,
} from "lucide-react";
import { AuthChip } from "@/components/game/AuthChip";
import { CrescentMark, Panel } from "@/components/ornament";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { listStoreAdmin, setProductPrice } from "@/server/api/commerce";
import {
  getOwnerBoard,
  ownerBanUser,
  ownerFreezeCampaign,
  ownerMuteUser,
  ownerReleaseSeat,
  ownerResolveReport,
  ownerSetWorldPace,
} from "@/server/api/admin";
import type { StoreProduct } from "@/domains/commerce/model";

type Tab =
  | "players"
  | "world"
  | "economy"
  | "packages"
  | "moderation"
  | "ban"
  | "analytics"
  | "server"
  | "ai"
  | "audit";

const TABS: { id: Tab; icon: typeof Shield }[] = [
  { id: "players", icon: Users },
  { id: "world", icon: Globe2 },
  { id: "economy", icon: Scale },
  { id: "packages", icon: Package },
  { id: "moderation", icon: Flag },
  { id: "ban", icon: Ban },
  { id: "analytics", icon: BarChart3 },
  { id: "server", icon: Server },
  { id: "ai", icon: Bot },
  { id: "audit", icon: ScrollText },
];

type Board = {
  ownerEmail: string;
  viewer: string | null;
  players: {
    user_id: string;
    display_name: string | null;
    email: string | null;
    role: string;
    banned: boolean;
    muted_until: string | null;
    created_at: string;
  }[];
  economy: {
    id: string;
    userId: string;
    realm: string;
    ruler: string;
    year: number;
    status: string;
    treasury: number;
    army: number;
    stability: number;
    updatedAt: string;
  }[];
  reports: {
    id: string;
    reporter_id: string;
    target_user_id: string;
    letter_id: string | null;
    reason: string;
    body: string | null;
    status: string;
    created_at: string;
  }[];
  audit: {
    id: string;
    actor_id: string;
    actor_email: string | null;
    action: string;
    target_user_id: string | null;
    scope: string;
    detail: string;
    created_at: string;
  }[];
  clock: { epoch_ms: number; ms_per_year: number; last_sweep_at: string };
  jobs: { status: string; c: number }[];
  ai: { calls: number; tokens_in: number; tokens_out: number; cost_milli: number };
  seats: { seat_id: string; kind: string; user_id: string | null; ruler_name: string }[];
  checks: { id: string; ok: boolean }[];
};

export function OwnerDivan() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("players");
  const [board, setBoard] = useState<Board | null>(null);
  const [catalog, setCatalog] = useState<StoreProduct[]>([]);
  const [purchases, setPurchases] = useState<{ id: string; user_id: string; sku: string; platform: string; status: string; created_at: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    getOwnerBoard()
      .then(setBoard)
      .catch((e) => setErr(String(e instanceof Error ? e.message : e)));
    listStoreAdmin()
      .then((res) => {
        setCatalog(res.catalog);
        setPurchases(res.purchases);
      })
      .catch((e) => setErr(String(e instanceof Error ? e.message : e)));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  if (err === "forbidden" || err?.includes("forbidden")) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink p-6 text-ivory">
        <Panel className="max-w-md">
          <h1 className="font-display text-3xl">{t("owner.denied")}</h1>
          <p className="mt-2 text-sm text-silk">{t("owner.denied.body")}</p>
          <Link to="/oyun" className="mt-4 inline-block text-gilt hover:underline">
            {t("app.continue")}
          </Link>
        </Panel>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-ink p-5 text-ivory">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <CrescentMark className="size-8 text-gilt" />
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.22em] text-gilt">{t("owner.kicker")}</p>
          <h1 className="font-display text-3xl">{t("admin.title")}</h1>
        </div>
        <Link to="/oyun" className="text-sm text-gilt hover:underline">
          {t("app.continue")}
        </Link>
        <div className="ml-auto">
          <AuthChip />
        </div>
      </header>
      {err && err !== "forbidden" && <p className="mb-3 text-sm text-crimson">{err}</p>}
      <p className="mb-4 max-w-2xl text-sm text-silk">{t("owner.lead", { email: board?.ownerEmail ?? "" })}</p>
      <nav className="mb-5 flex flex-wrap gap-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-md px-3 text-sm",
                tab === item.id ? "bg-raised text-gilt ring-1 ring-gilt/40" : "text-silk hover:bg-raised hover:text-ivory",
              )}
            >
              <Icon className="size-4" strokeWidth={1.6} />
              {t(`owner.tab.${item.id}`)}
            </button>
          );
        })}
      </nav>

      {tab === "players" && (
        <Panel>
          <h2 className="font-display text-2xl">{t("owner.tab.players")}</h2>
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-silk">
              <tr>
                <th className="py-2">{t("create.given")}</th>
                <th>{t("owner.role")}</th>
                <th>{t("owner.status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(board?.players ?? []).map((p) => (
                <tr key={p.user_id} className="border-t border-line">
                  <td className="py-2">
                    <span className="block">{p.display_name || p.user_id.slice(0, 10)}</span>
                    <span className="text-xs text-silk">{p.email || "—"}</span>
                  </td>
                  <td>{p.role === "owner" ? t("owner.role.owner") : t("owner.role.player")}</td>
                  <td>{p.banned ? t("owner.banned") : t("owner.active")}</td>
                  <td className="text-right">
                    {p.role !== "owner" && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void run(() => ownerMuteUser({ data: { userId: p.user_id, hours: p.muted_until ? 0 : 24 } }))}
                        >
                          {p.muted_until ? t("owner.unmute") : t("owner.mute")}
                        </Button>
                        <Button
                          size="sm"
                          variant="crimson"
                          disabled={busy}
                          onClick={() => void run(() => ownerBanUser({ data: { userId: p.user_id, on: !p.banned } }))}
                        >
                          {p.banned ? t("owner.unban") : t("owner.ban")}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {tab === "world" && (
        <Panel>
          <h2 className="font-display text-2xl">{t("owner.tab.world")}</h2>
          <ul className="mt-4 space-y-2">
            {(board?.seats ?? []).map((s) => (
              <li key={s.seat_id} className="flex items-center justify-between rounded-md bg-raised px-3 py-2">
                <span>
                  <span className="block font-medium">{s.seat_id}</span>
                  <span className="text-xs text-silk">
                    {s.ruler_name} · {s.kind}
                  </span>
                </span>
                {s.kind === "player" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => ownerReleaseSeat({ data: { seatId: s.seat_id } }))}>
                    {t("owner.release")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === "economy" && (
        <Panel>
          <h2 className="font-display text-2xl">{t("owner.tab.economy")}</h2>
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-silk">
              <tr>
                <th className="py-2">{t("nav.saray")}</th>
                <th>{t("hud.year")}</th>
                <th>{t("hud.treasury")}</th>
                <th>{t("hud.army")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(board?.economy ?? []).map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-2">
                    {r.ruler} · {r.realm}
                  </td>
                  <td className="tabular-nums">{r.year}</td>
                  <td className="tabular-nums">{r.treasury}</td>
                  <td className="tabular-nums">{r.army}</td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void run(() => ownerFreezeCampaign({ data: { campaignId: r.id, on: r.status !== "frozen" } }))}
                    >
                      {r.status === "frozen" ? t("owner.unfreeze") : t("owner.freeze")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {tab === "packages" && (
        <div className="grid gap-4">
          <Panel>
            <h2 className="font-display text-2xl">{t("admin.store")}</h2>
            <p className="mt-1 text-sm text-silk">{t("admin.store.lead")}</p>
            <div className="mt-4 grid gap-3">
              {catalog.map((p) => (
                <PriceRow
                  key={`${p.sku}-${p.priceTry}-${p.priceUsd}-${p.active}`}
                  product={p}
                  t={t}
                  busy={busy}
                  onSave={(sku, priceTry, priceUsd, active) =>
                    void run(async () => {
                      const res = await setProductPrice({ data: { sku, priceTry, priceUsd, active } });
                      setCatalog(res.catalog);
                    })
                  }
                />
              ))}
            </div>
          </Panel>
          <Panel>
            <h2 className="font-display text-2xl">{t("admin.purchases")}</h2>
            {purchases.length === 0 ? (
              <p className="mt-3 text-silk">{t("admin.purchases.none")}</p>
            ) : (
              <table className="mt-4 w-full text-left text-sm">
                <thead className="text-silk">
                  <tr>
                    <th className="py-2">SKU</th>
                    <th>{t("shop.platform")}</th>
                    <th>{t("owner.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="py-2">{r.sku}</td>
                      <td>{r.platform}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      )}

      {tab === "moderation" && (
        <Panel>
          <h2 className="font-display text-2xl">{t("owner.tab.moderation")}</h2>
          <ul className="mt-4 space-y-2">
            {(board?.reports ?? []).length === 0 && <li className="text-silk">{t("owner.reports.none")}</li>}
            {(board?.reports ?? []).map((r) => (
              <li key={r.id} className="rounded-md bg-raised p-3">
                <p className="text-xs text-silk">
                  {r.reason} · {r.status} · {r.created_at}
                </p>
                <p className="mt-1 text-sm">{r.body || t("cihan.flag")}</p>
                {r.status === "open" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void run(() => ownerResolveReport({ data: { id: r.id, status: "actioned" } }))}>
                      {t("owner.action")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => ownerResolveReport({ data: { id: r.id, status: "dismissed" } }))}>
                      {t("owner.dismiss")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === "ban" && (
        <Panel>
          <h2 className="font-display text-2xl">{t("owner.tab.ban")}</h2>
          <p className="mt-2 text-sm text-silk">{t("owner.ban.lead")}</p>
          <ul className="mt-4 space-y-2">
            {(board?.players ?? [])
              .filter((p) => p.banned)
              .map((p) => (
                <li key={p.user_id} className="flex items-center justify-between rounded-md bg-raised px-3 py-2">
                  <span>{p.display_name || p.email || p.user_id.slice(0, 8)}</span>
                  <Button size="sm" disabled={busy} onClick={() => void run(() => ownerBanUser({ data: { userId: p.user_id, on: false } }))}>
                    {t("owner.unban")}
                  </Button>
                </li>
              ))}
          </ul>
        </Panel>
      )}

      {tab === "analytics" && (
        <Panel>
          <h2 className="font-display text-2xl">{t("owner.tab.analytics")}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("owner.stat.players")} value={String(board?.players.length ?? 0)} />
            <Stat label={t("owner.stat.realms")} value={String(board?.economy.length ?? 0)} />
            <Stat label={t("owner.stat.reports")} value={String(board?.reports.filter((r) => r.status === "open").length ?? 0)} />
            <Stat label={t("owner.stat.ai")} value={String(board?.ai.calls ?? 0)} />
          </dl>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {(board?.checks ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md bg-raised px-3 py-2 text-sm">
                <span>{t(`owner.check.${c.id}`)}</span>
                <span className="text-gilt">{c.ok ? t("owner.check.ok") : t("owner.check.fail")}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === "server" && (
        <Panel>
          <h2 className="font-display text-2xl">{t("owner.tab.server")}</h2>
          <p className="mt-2 text-sm text-silk">
            {t("owner.pace", { ms: board?.clock.ms_per_year ?? 0 })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[60_000, 90_000, 180_000, 300_000].map((ms) => (
              <Button key={ms} size="sm" variant="gilt" disabled={busy} onClick={() => void run(() => ownerSetWorldPace({ data: { msPerYear: ms } }))}>
                {Math.round(ms / 1000)}s
              </Button>
            ))}
          </div>
          <ul className="mt-4 text-sm text-silk">
            {(board?.jobs ?? []).map((j) => (
              <li key={j.status}>
                {j.status}: {j.c}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === "ai" && (
        <Panel>
          <h2 className="font-display text-2xl">{t("owner.tab.ai")}</h2>
          <p className="mt-2 text-sm text-silk">{t("owner.ai.lead")}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("owner.stat.ai")} value={String(board?.ai.calls ?? 0)} />
            <Stat label={t("owner.ai.in")} value={String(board?.ai.tokens_in ?? 0)} />
            <Stat label={t("owner.ai.out")} value={String(board?.ai.tokens_out ?? 0)} />
            <Stat label={t("owner.ai.cost")} value={`${(((board?.ai.cost_milli ?? 0) / 1000) * 0.001).toFixed(4)}$`} />
          </dl>
        </Panel>
      )}

      {tab === "audit" && (
        <Panel>
          <h2 className="font-display text-2xl">{t("owner.tab.audit")}</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {(board?.audit ?? []).length === 0 && <li className="text-silk">{t("admin.none")}</li>}
            {(board?.audit ?? []).map((a) => (
              <li key={a.id} className="rounded-md bg-raised px-3 py-2">
                <p className="text-xs text-silk">
                  {a.scope} · {a.action} · {a.created_at}
                </p>
                <p>{a.actor_email || a.actor_id.slice(0, 8)}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-raised px-3 py-2">
      <dt className="text-[0.65rem] uppercase tracking-wider text-silk">{label}</dt>
      <dd className="font-display text-2xl tabular-nums">{value}</dd>
    </div>
  );
}

function PriceRow({
  product,
  t,
  busy,
  onSave,
}: {
  product: StoreProduct;
  t: (k: string) => string;
  busy: boolean;
  onSave: (sku: string, priceTry: number, priceUsd: number, active: boolean) => void;
}) {
  const [tryKurus, setTryKurus] = useState(String(product.priceTry));
  const [usdCents, setUsdCents] = useState(String(product.priceUsd));
  const [active, setActive] = useState(product.active);
  return (
    <form
      className="grid gap-2 rounded-md bg-raised p-3 sm:grid-cols-[1fr_6rem_6rem_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(product.sku, Number(tryKurus), Number(usdCents), active);
      }}
    >
      <div>
        <p className="text-xs uppercase tracking-wider text-gilt">{product.sku}</p>
        <p className="text-sm">{t(product.titleKey)}</p>
      </div>
      <label className="grid gap-1 text-[0.65rem] uppercase tracking-wider text-silk">
        {t("admin.price.try")}
        <input className="min-h-11 rounded-sm bg-ink px-2 text-sm text-ivory" inputMode="numeric" value={tryKurus} onChange={(e) => setTryKurus(e.target.value)} />
      </label>
      <label className="grid gap-1 text-[0.65rem] uppercase tracking-wider text-silk">
        {t("admin.price.usd")}
        <input className="min-h-11 rounded-sm bg-ink px-2 text-sm text-ivory" inputMode="numeric" value={usdCents} onChange={(e) => setUsdCents(e.target.value)} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-silk">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        {t("admin.active")}
      </label>
      <Button type="submit" size="sm" disabled={busy}>
        {t("admin.save")}
      </Button>
    </form>
  );
}
