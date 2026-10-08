import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import {
  BookOpen,
  Coins,
  Crown,
  Gem,
  Globe2,
  Landmark,
  Map as MapIcon,
  Scale,
  ScrollText,
  Settings,
  Swords,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { CrescentMark } from "@/components/ornament";
import { AuthChip } from "@/components/game/AuthChip";
import { EventModal } from "@/components/game/EventModal";
import { chime } from "@/components/game/chime";
import { MapBoard } from "@/components/game/MapBoard";
import { PalaceHall, RoomChrome } from "@/components/game/PalaceHall";
import { PortraitActor } from "@/components/game/PortraitActor";
import { DivanView } from "@/components/game/DivanView";
import { HanedanView } from "@/components/game/HanedanView";
import { IntimateCinematic } from "@/components/game/IntimateCinematic";
import { SiegeCinematic } from "@/components/game/SiegeCinematic";
import { SuccessionView } from "@/components/game/SuccessionView";
import { HazineView } from "@/components/game/HazineView";
import { OrduView } from "@/components/game/OrduView";
import { LiveMesh } from "@/components/game/DuelOverlay";
import { LiveBattle } from "@/components/game/LiveBattle";
import { DiplomacyDesk, UsurpBanner } from "@/components/game/DiplomacyDesk";
import { WorldCourt } from "@/components/game/WorldCourt";
import { EdictDesk } from "@/components/game/EdictDesk";
import { WorldBell } from "@/components/game/WorldBell";
import { TarihView } from "@/components/game/TarihView";
import { BazaarView, PremiumMark } from "@/components/game/BazaarView";
import { SettingsDesk } from "@/components/game/SettingsDesk";
import { crisisHudLabel } from "@/components/game/CrisisPulse";
import { akce, formatLog } from "@/components/game/format";
import { dispatchAction, getMyCampaign } from "@/server/api/campaign";
import { saveReignSlot } from "@/server/api/slots";
import { cancelCheckout, confirmPurchase, equipCosmetic, getStorefront, restorePurchases, startCheckout } from "@/server/api/commerce";
import { pulseWorld } from "@/server/api/worldclock";
import { secondsUntilYear } from "@/domains/worldclock/time";
import { detectStorePlatform, nativeManageSubscriptions, nativePurchase, nativeRestore } from "@/domains/commerce/platform";
import { emptyWallet } from "@/domains/commerce/entitlements";
import { bannerClass, palaceThemeClass } from "@/domains/commerce/wardrobe";
import { applyQualityToDocument, qualityClass, useQuality } from "@/domains/settings/quality";
import { registerPushIfPossible } from "@/lib/notify/client";
import type { CosmeticSlot, StoreProduct, Wallet } from "@/domains/commerce/model";
import { neighborTargets, yearlyForecast, migrateState, sceneSrc, VIEW_TO_ROOM, roomSceneSrc, expressionForSovereign, beatStill } from "@/domains/index";
import { INVEST_KINDS, realmPopulation } from "@/domains/governance/model";
import type { GameAction, GameState, InvestKind, ViewId } from "@/domains/types";

const NAV: { id: ViewId; icon: typeof Crown }[] = [
  { id: "saray", icon: Crown },
  { id: "divan", icon: Landmark },
  { id: "hazine", icon: Coins },
  { id: "ordu", icon: Swords },
  { id: "harita", icon: MapIcon },
  { id: "diplomasi", icon: ScrollText },
  { id: "hanedan", icon: Users },
  { id: "tarih", icon: BookOpen },
  { id: "cihan", icon: Globe2 },
  { id: "bazaar", icon: Gem },
];

export function GameApp() {
  const { user, isPending } = useCurrentUserState();
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const [state, setState] = useState<GameState | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [banned, setBanned] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ViewId>("saray");
  const [missing, setMissing] = useState(false);
  const [usurped, setUsurped] = useState(false);
  const [ferman, setFerman] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [eta, setEta] = useState(0);
  const [wallet, setWallet] = useState<Wallet>(() => emptyWallet());
  const [catalog, setCatalog] = useState<StoreProduct[]>([]);
  const quality = useQuality((s) => s.quality);
  const reducedMotion = useQuality((s) => s.reducedMotion);
  const busyRef = useRef(false);
  const lastNoticeRef = useRef<string | null>(null);
  const [order, setOrder] = useState<string | null>(null);

  useEffect(() => {
    applyQualityToDocument(quality, reducedMotion);
  }, [quality, reducedMotion]);

  useEffect(() => {
    if (isPending || !user) return;
    let live = true;
    getMyCampaign()
      .then((res) => {
        if (!live) return;
        setIsAdmin(Boolean(res.isOwner ?? res.isAdmin));
        setUsurped(Boolean(res.usurped));
        if (res.banned) {
          setBanned(res.banReason || "banned");
          setMissing(false);
        } else if (!res.campaign) setMissing(true);
        else setState(migrateState(res.campaign.state));
      })
      .catch(() => {
        if (live) setMissing(true);
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    getStorefront()
      .then((shop) => {
        if (!live) return;
        setWallet(shop.wallet);
        setCatalog(shop.catalog);
      })
      .catch(() => {
        /* shop is optional on first paint */
      });
    void registerPushIfPossible(locale);
    return () => {
      live = false;
    };
  }, [user, isPending]);

  useEffect(() => {
    if (!state) return;
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      void saveReignSlot({ data: { slot: "auto" } }).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [state]);

  async function act(action: GameAction) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setOrder(action.type);
    try {
      const nonce = (crypto.randomUUID?.() ?? `n${Date.now()}`).replace(/-/g, "").slice(0, 32);
      const res = await dispatchAction({ data: { action, nonce } });
      setState(migrateState(res.state));
      const n = res.notices[0];
      if (n) {
        const f = formatLog(t, n, res.state);
        toast(f.title, { description: f.body });
        const k = n.kind;
        if (k === "sefer") chime(n.titleKey.includes("conquest") || n.titleKey.includes("raid_win") ? "win" : "war");
        else if (k === "yil") chime("year");
        else if (k === "hazine" || k === "imar") chime("coin");
        else chime("tap");
      } else if (action.type !== "MARK_NOTICE" && action.type !== "MARK_NOTICES_READ") {
        chime("tap");
      }
    } catch (err) {
      const raw = String(err instanceof Error ? err.message : err);
      const key = `error.${raw}`;
      const msg = t(key);
      toast(msg === key ? t("error.generic") : msg);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setOrder(null);
    }
  }

  async function buySku(sku: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    let purchaseId: string | null = null;
    try {
      const platform = detectStorePlatform();
      const started = await startCheckout({ data: { sku, platform } });
      purchaseId = started.purchaseId;
      let receipt = started.sandboxReceipt;
      let used: typeof platform = platform;
      if (platform !== "sandbox") {
        const native = await nativePurchase(platform === "ios" ? started.appleProductId : started.googleProductId);
        receipt = native.receipt;
        used = native.platform;
      }
      if (!receipt) throw new Error("no_receipt");
      const done = await confirmPurchase({
        data: {
          purchaseId,
          platform: used,
          productId: sku,
          receipt,
        },
      });
      setWallet(done.wallet);
      if (used === "sandbox") {
        toast(t("shop.sandbox.thanks"), { description: t("shop.web.note") });
      } else {
        toast(t("shop.thanks"), { description: t("shop.thanks.body") });
      }
    } catch (err) {
      const raw = String(err instanceof Error ? err.message : err);
      if (purchaseId && raw !== "receipt_replay") {
        void cancelCheckout({ data: { purchaseId, reason: raw === "cancelled" ? "cancelled" : "failed" } }).catch(() => undefined);
      }
      const key = `error.${raw}`;
      toast(t(key) === key ? t("error.generic") : t(key));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function restoreShop() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const native = await nativeRestore();
      const done = await restorePurchases({
        data: {
          platform: native?.platform ?? detectStorePlatform(),
          receipts: native?.receipts ?? [],
        },
      });
      setWallet(done.wallet);
      toast(t("shop.restore.ok"));
    } catch (err) {
      const raw = String(err instanceof Error ? err.message : err);
      const key = `error.${raw}`;
      toast(t(key) === key ? t("error.generic") : t(key));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function wearCosmetic(slot: CosmeticSlot, itemId: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await equipCosmetic({ data: { slot, itemId } });
      setState(migrateState(res.state));
      setWallet(res.wallet);
    } catch (err) {
      const raw = String(err instanceof Error ? err.message : err);
      const key = `error.${raw}`;
      toast(t(key) === key ? t("error.generic") : t(key));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!state) return;
    const room = VIEW_TO_ROOM[view];
    if (!room) return;
    if (state.palace?.currentRoom === room) return;
    void act({ type: "VISIT_ROOM", room });
  }, [view, state?.palace?.currentRoom]);

  useEffect(() => {
    if (!loaded || missing) return;
    let live = true;
    async function beat() {
      if (!live || busyRef.current) return;
      try {
        const res = await pulseWorld();
        if (!live || !res.state) return;
        setState(migrateState(res.state));
        if (res.years > 0) {
          toast(t("nizam.catchup.title"), { description: t("nizam.catchup.body", { n: res.years, year: res.state.year }) });
        }
        const newest = res.state.world?.notices?.find((n) => n.severity === "critical" && !n.read);
        if (newest && newest.id !== lastNoticeRef.current) {
          lastNoticeRef.current = newest.id;
          const f = formatLog(t, {
            id: newest.id,
            year: newest.year,
            kind: newest.kind,
            titleKey: newest.titleKey,
            bodyKey: newest.bodyKey,
            vars: newest.vars,
          }, res.state);
          pushBrowserNotice(f.title, f.body);
        }
      } catch {
        /* world pulse is best-effort */
      }
    }
    const id = window.setInterval(() => void beat(), 15_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [loaded, missing, t]);

  useEffect(() => {
    if (!state?.world) return;
    const tick = () => setEta(secondsUntilYear(state, Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state?.world?.lastSimAt, state?.world?.msPerYear, state?.year]);

  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink text-silk">
        <p className="font-display text-2xl text-ivory">{t("app.loading")}</p>
      </main>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (banned) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink p-6 text-ivory">
        <div className="max-w-md rounded-xl bg-panel p-6 ring-1 ring-line">
          <p className="text-xs uppercase tracking-[0.2em] text-gilt">{t("owner.kicker")}</p>
          <h1 className="mt-2 font-display text-3xl">{t("owner.you.banned")}</h1>
          <p className="mt-2 text-sm text-silk">{t("owner.you.banned.body")}</p>
        </div>
      </main>
    );
  }
  if (!loaded) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink text-silk">
        <p className="font-display text-2xl text-ivory">{t("app.loading")}</p>
      </main>
    );
  }
  if (missing || !state) return <Navigate to="/oyun/kur" />;

  const scene = state.succession
    ? "/art/succession.jpg"
    : state.siege?.cinema
      ? beatStill(state.siege.cinema.beats[state.siege.cinema.index] ?? "walls")
      : state.army.status === "siege"
        ? "/art/siege/walls.jpg"
        : view === "saray"
          ? roomSceneSrc(state.palace.currentRoom)
          : sceneSrc(view, false);
  const pending = state.pendingEvents[0];
  const blocked =
    state.pendingEvents.length > 0 ||
    Boolean(state.succession) ||
    Boolean(state.harem?.scene) ||
    Boolean(state.military?.pendingDuel) ||
    Boolean(state.siege?.cinema);
  const forecast = yearlyForecast(state);
  const age = state.year - state.ruler.birthYear;
  const crisisHud = crisisHudLabel(state, t);

  return (
    <LiveMesh state={state} act={act} busy={busy} t={t} userId={user.id}>
    <div className={cn("relative min-h-dvh bg-ink text-ivory", palaceThemeClass(wallet.wardrobe.palaceId), bannerClass(wallet.wardrobe.bannerId), qualityClass(quality))}>
      <img
        src={scene}
        alt=""
        className="scene-layer pointer-events-none absolute inset-0 h-full w-full object-cover"
        crossOrigin="anonymous"
      />
      <div className="vignette pointer-events-none absolute inset-0 bg-ink/55" />
      {usurped && (
        <UsurpBanner
          t={t}
          onOpen={() => setView("cihan")}
        />
      )}
      {state.world?.paused && (
        <div className="relative z-20 border-b border-crimson/50 bg-crimson/20 px-3 py-2 text-sm text-ivory sm:px-5">
          {t("nizam.pause.title")} — {t(`nizam.pause.${state.world.pauseReason ?? "event"}.body`)}
        </div>
      )}
      {crisisHud && !state.world?.paused && (
        <div className="relative z-20 border-b border-crimson/40 bg-crimson/15 px-3 py-1.5 text-xs text-ivory sm:px-5">
          {crisisHud}
        </div>
      )}

      <header className="relative z-20 flex flex-wrap items-center gap-3 border-b border-line/80 bg-ink/70 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-sm sm:px-5">
        <CrescentMark className={cn("size-7 text-gilt", wallet.wardrobe.bannerId !== "default" && "banner-mark")} />
        <div className="size-11 shrink-0">
          <PortraitActor
            portrait={state.ruler.portrait}
            name={state.ruler.givenName}
            age={age}
            expression={expressionForSovereign(state, false)}
            compact
            robeId={wallet.wardrobe.robeId}
          />
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight">{state.ruler.givenName}</p>
          <p className="text-xs text-silk">
            {state.ruler.dynastyName} · {age} {t("hud.age")} · {t(`constitution.${state.ruler.healthFlags.constitution}`)}
          </p>
        </div>
        <PremiumMark wallet={wallet} t={t} />
        <dl className="ml-auto grid grid-cols-3 gap-x-3 gap-y-1 text-xs tabular-nums sm:grid-cols-7">
          <Stat label={t("hud.year")} value={String(state.year)} />
          <Stat label={t("hud.treasury")} value={akce(state.treasury)} />
          <Stat label={t("hud.people")} value={akce(state.provinces.filter((p) => p.ownerId === state.realm.id).reduce((a, p) => a + p.manpower, 0))} />
          <Stat label={t("hud.stability")} value={String(state.stability)} />
          <Stat label={t("hud.army")} value={akce(forecast.power)} />
          <Stat label={t("hud.people")} value={akce(realmPopulation(state))} />
          <Stat label={t("hud.prestige")} value={String(state.prestige)} />
        </dl>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-silk hover:text-ivory"
            onClick={() => setLocale(locale === "tr" ? "en" : "tr")}
          >
            {locale === "tr" ? "EN" : "TR"}
          </button>
          {isAdmin && (
            <Link to="/admin" className="text-xs text-gilt hover:underline">
              {t("nav.admin")}
            </Link>
          )}
          <AuthChip />
          <WorldBell state={state} t={t} act={act} open={bellOpen} onToggle={() => setBellOpen((v) => !v)} />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="grid size-11 place-items-center rounded-md text-silk hover:bg-raised hover:text-ivory"
            aria-label={t("set.title")}
          >
            <Settings className="size-4" strokeWidth={1.6} />
          </button>
          <button
            type="button"
            onClick={() => {
              setFerman(true);
              void requestNoticePermission();
            }}
            className="grid size-11 place-items-center rounded-md text-silk hover:bg-raised hover:text-ivory"
            aria-label={t("nizam.title")}
          >
            <Scale className="size-4" strokeWidth={1.6} />
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-[calc(100dvh-7.5rem)]">
        <nav className="hidden w-16 flex-col gap-1 border-r border-line/70 bg-ink/60 p-2 md:flex">
          {NAV.map((item) => (
            <NavBtn key={item.id} id={item.id} icon={item.icon} active={view === item.id} label={t(`nav.${item.id}`)} onClick={() => setView(item.id)} />
          ))}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto p-3 pb-24 sm:p-5 md:pb-8">
          {order === "ADVANCE_YEAR" && <p className="mb-2 text-center text-xs tracking-wide text-gilt">{t("turn.ai")}</p>}
          {view === "saray" && <PalaceHall state={state} t={t} act={act} busy={busy} locale={locale} />}
          {view === "divan" && (
            <RoomChrome state={state} room="divan" t={t} locale={locale} act={act} busy={busy}>
              <DivanView state={state} t={t} act={act} busy={busy} />
            </RoomChrome>
          )}
          {view === "hazine" && (
            <RoomChrome state={state} room="hazine" t={t} locale={locale} act={act} busy={busy}>
              <HazineView state={state} t={t} act={act} busy={busy} onRestore={(next) => setState(migrateState(next))} />
            </RoomChrome>
          )}
          {view === "ordu" && (
            <RoomChrome state={state} room="askeri" t={t} locale={locale} act={act} busy={busy}>
              <OrduView state={state} t={t} act={act} busy={busy} />
            </RoomChrome>
          )}
          {view === "harita" && <HaritaView state={state} t={t} act={act} busy={busy} />}
          {view === "diplomasi" && (
            <RoomChrome state={state} room="elci" t={t} locale={locale} act={act} busy={busy}>
              <DiplomacyDesk state={state} t={t} act={act} busy={busy} />
            </RoomChrome>
          )}
          {view === "hanedan" && (
            <RoomChrome state={state} room="sehzade" t={t} locale={locale} act={act} busy={busy}>
              <HanedanView state={state} t={t} act={act} busy={busy} wallet={wallet} onShop={() => setView("bazaar")} />
            </RoomChrome>
          )}
          {view === "tarih" && <TarihView state={state} t={t} wallet={wallet} onShop={() => setView("bazaar")} />}
          {view === "cihan" && (
            <WorldCourt
              state={state}
              t={t}
              usurped={usurped}
              onRebound={(next) => {
                setState(next);
                setUsurped(false);
              }}
            />
          )}
          {view === "bazaar" && (
            <BazaarView
              wallet={wallet}
              catalog={catalog}
              locale={locale}
              t={t}
              busy={busy}
              onBuy={buySku}
              onEquip={wearCosmetic}
              onRestore={() => void restoreShop()}
              onManage={() => void nativeManageSubscriptions()}
              liveStore={detectStorePlatform() !== "sandbox"}
            />
          )}
        </main>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/85 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm md:static md:bg-ink/70">
        <div className="flex gap-1 overflow-x-auto px-2 py-1 md:hidden">
          {NAV.map((item) => (
            <NavBtn key={item.id} id={item.id} icon={item.icon} active={view === item.id} label={t(`nav.${item.id}`)} onClick={() => setView(item.id)} compact />
          ))}
        </div>
        <div className="flex items-center justify-end gap-3 px-3 py-2 sm:px-5">
          <p className="mr-auto hidden text-xs text-silk sm:block">
            {blocked
              ? state.military?.pendingDuel
                ? t("hud.duelBlocked")
                : state.siege?.cinema
                  ? t("hud.siegeBlocked")
                  : t("hud.advanceBlocked")
              : state.world?.paused
                ? t("hud.worldPaused")
                : `${t("hazine.net")}: ${akce(forecast.net)}${forecast.debt > 0 ? ` · ${t("hazine.debt")}: ${akce(forecast.debt)}` : ""}${crisisHud ? ` · ${crisisHud}` : ""} · ${t("hud.worldLive", { n: eta })}`}
          </p>
          <Button
            variant="primary"
            disabled={busy || blocked}
            onClick={() => act({ type: "ADVANCE_YEAR" })}
          >
            {t("hud.advance")}
          </Button>
        </div>
      </footer>

      {state.succession && <SuccessionView state={state} t={t} act={act} busy={busy} />}

      {state.harem?.scene && !state.succession && (
        <IntimateCinematic state={state} locale={locale} t={t} busy={busy} act={act} />
      )}

      {state.siege?.cinema && !state.succession && !state.harem?.scene && (
        <SiegeCinematic state={state} t={t} busy={busy} act={act} premiumReplay={wallet.grants.includes("replay")} />
      )}

      {pending && !state.succession && !state.harem?.scene && !state.military?.pendingDuel && !state.siege?.cinema && (
        <EventModal
          state={state}
          event={pending}
          t={t}
          busy={busy}
          onChoose={(choiceId) => act({ type: "RESOLVE_EVENT", eventId: pending.id, choiceId })}
        />
      )}

      {ferman && (
        <EdictDesk
          state={state}
          t={t}
          act={act}
          busy={busy}
          onClose={() => setFerman(false)}
        />
      )}
      {settingsOpen && <SettingsDesk t={t} onClose={() => setSettingsOpen(false)} />}
      <LiveBattle state={state} t={t} onState={(s) => setState(migrateState(s))} />
    </div>
    </LiveMesh>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.65rem] uppercase tracking-wider text-silk">{label}</dt>
      <dd className="font-medium text-ivory">{value}</dd>
    </div>
  );
}

function requestNoticePermission() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    /* preview may block the API */
  }
}

function pushBrowserNotice(title: string, body: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification(title, { body, icon: "/favicon.svg", tag: "taht-cihan-world" });
  } catch {
    /* ignore */
  }
}

function NavBtn({
  id,
  icon: Icon,
  active,
  label,
  onClick,
  compact,
}: {
  id: string;
  icon: typeof Crown;
  active: boolean;
  label: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-[0.65rem] text-silk transition-colors duration-150",
        active && "bg-raised text-ivory",
        compact && "flex-1",
      )}
    >
      <Icon className="size-4" strokeWidth={1.6} />
      <span className="max-w-16 truncate">{label}</span>
      <span className="sr-only">{id}</span>
    </button>
  );
}

function HaritaView({
  state,
  t,
  act,
  busy,
}: {
  state: GameState;
  t: (k: string) => string;
  act: (a: GameAction) => void;
  busy: boolean;
}) {
  const [sel, setSel] = useState(state.realm.capitalId);
  const p = state.provinces.find((x) => x.id === sel);
  const canMarch = p && neighborTargets(state).some((n) => n.id === p.id);
  const owned = p?.ownerId === state.realm.id;
  const marching = state.army.status === "campaign" || state.army.status === "siege";
  const foe = p && !owned ? state.relations.find((r) => r.realmId === p.ownerId) : undefined;
  return (
    <div className="grid gap-3">
      <MapBoard state={state} t={t} onSelect={setSel} />
      {p && (
        <div className="flex flex-wrap gap-2">
          {canMarch && (
            <Button disabled={busy || marching} onClick={() => act({ type: "LAUNCH_CAMPAIGN", provinceId: p.id })}>
              {owned ? t("harita.garrisonMarch") : t("harita.attack")} · {t(p.nameKey)}
            </Button>
          )}
          {owned && (
            <>
              <Button variant="gilt" disabled={busy || marching} onClick={() => act({ type: "GARRISON", provinceId: p.id })}>
                {t("harita.garrison")}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => act({ type: "INVEST_PROVINCE", provinceId: p.id })}>
                {t("harita.invest")}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => act({ type: "SOOTHE_PROVINCE", provinceId: p.id })}>
                {t("harita.soothe")}
              </Button>
              {p.unrest >= 32 && (
                <Button variant="crimson" disabled={busy || marching} onClick={() => act({ type: "SUPPRESS_REVOLT", provinceId: p.id })}>
                  {t("harita.suppress")}
                </Button>
              )}
              {INVEST_KINDS.map((kind: InvestKind) => (
                <Button key={kind} size="sm" variant="ghost" disabled={busy} onClick={() => act({ type: "INVEST_KIND", provinceId: p.id, kind })}>
                  {t(`invest.${kind}`)}
                </Button>
              ))}
            </>
          )}
          {foe && foe.treaty !== "war" && (
            <Button
              variant="crimson"
              disabled={busy}
              onClick={() => act({ type: "DIP_OFFER", realmId: foe.realmId, kind: "war", terms: { tribute: 0, durationYears: 0, againstRealmId: null, note: "" } })}
            >
              {t("harita.declare")}
            </Button>
          )}
          {foe && foe.treaty === "war" && (
            <Button variant="gilt" disabled={busy} onClick={() => act({ type: "OFFER_PEACE", realmId: foe.realmId })}>
              {t("ordu.peace")}
            </Button>
          )}
        </div>
      )}
      {state.governance && state.governance.tutorialStep < 10 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-raised px-3 py-2 text-sm text-ivory ring-1 ring-line">
          <p>{t(`tutor.${state.governance.tutorialStep}`)}</p>
          <Button size="sm" variant="gilt" disabled={busy} onClick={() => act({ type: "TUTORIAL_STEP", step: state.governance.tutorialStep + 1 })}>
            {t("tutor.next")}
          </Button>
        </div>
      )}
    </div>
  );
}

