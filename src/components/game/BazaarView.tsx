import type { ReactNode } from "react";
import { Crown, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import type { CosmeticSlot, StoreProduct, Wallet } from "@/domains/commerce/model";
import { canEquip } from "@/domains/commerce/entitlements";
import type { Locale } from "@/domains/types";

export function formatStorePrice(locale: Locale, product: StoreProduct): string {
  if (locale === "tr") {
    return `₺${(product.priceTry / 100).toLocaleString("tr-TR")}`;
  }
  return `$${(product.priceUsd / 100).toFixed(2)}`;
}

export function BazaarView({
  wallet,
  catalog,
  locale,
  t,
  busy,
  onBuy,
  onEquip,
  onRestore,
  onManage,
  liveStore = false,
}: {
  wallet: Wallet;
  catalog: StoreProduct[];
  locale: Locale;
  t: (k: string, v?: Record<string, string | number>) => string;
  busy: boolean;
  onBuy: (sku: string) => void;
  onEquip: (slot: CosmeticSlot, itemId: string) => void;
  onRestore?: () => void;
  onManage?: () => void;
  liveStore?: boolean;
}) {
  const subs = catalog.filter((p) => p.kind === "subscription" && p.active);
  const cosmetics = catalog.filter((p) => p.kind === "cosmetic" && p.active);
  return (
    <div className="grid gap-4">
      <Panel>
        <p className="text-xs uppercase tracking-[0.22em] text-gilt">{t("shop.kicker")}</p>
        <h2 className="font-display text-3xl">{t("shop.title")}</h2>
        <p className="mt-2 max-w-2xl text-sm text-silk">{t("shop.lead")}</p>
        {!liveStore && <p className="mt-2 text-sm text-gilt">{t("shop.web.note")}</p>}
        <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-raised px-3 py-2 text-sm text-ivory">
          <ShieldCheck className="size-4 text-gilt" strokeWidth={1.6} />
          {t("shop.fair")}
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label={t("shop.plan")} value={t(`shop.plan.${wallet.plan}`)} />
          <Stat
            label={t("shop.until")}
            value={wallet.premiumUntil ? new Date(wallet.premiumUntil).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-GB") : t("shop.until.none")}
          />
          <Stat label={t("shop.owned")} value={String(wallet.ownedSkus.filter((s) => s.includes("cosmetic")).length)} />
        </dl>
        {wallet.status !== "free" && (
          <p className="mt-3 text-sm text-gilt">{t(`shop.status.${wallet.status}`)}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRestore?.()}>
            {t("shop.restore")}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onManage?.()}>
            {t("shop.manage")}
          </Button>
        </div>
      </Panel>

      <Panel>
        <h3 className="font-display text-2xl">{t("shop.premium")}</h3>
        <p className="mt-1 text-sm text-silk">{t("shop.premium.lead")}</p>
        <ul className="mt-3 grid gap-2 text-sm text-silk sm:grid-cols-2">
          {["kaftan", "palace", "banner", "archive", "reports", "replay"].map((k) => (
            <li key={k} className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-gilt" strokeWidth={1.6} />
              {t(`shop.perk.${k}`)}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {subs.map((p) => (
            <article key={p.sku} className="rounded-md bg-raised p-4">
              <p className="text-xs uppercase tracking-wider text-gilt">{t(`shop.period.${p.period}`)}</p>
              <h4 className="font-display text-xl">{t(p.titleKey)}</h4>
              <p className="mt-1 text-sm text-silk">{t(p.bodyKey)}</p>
              <p className="mt-3 font-display text-2xl text-ivory">{formatStorePrice(locale, p)}</p>
              <Button
                className="mt-4"
                variant={wallet.plan === (p.period === "year" ? "yearly" : "monthly") ? "gilt" : "primary"}
                disabled={busy || wallet.plan === (p.period === "year" ? "yearly" : "monthly")}
                onClick={() => onBuy(p.sku)}
              >
                {wallet.plan === (p.period === "year" ? "yearly" : "monthly") ? t("shop.active") : t("shop.buy")}
              </Button>
            </article>
          ))}
        </div>
      </Panel>

      <Panel>
        <h3 className="font-display text-2xl">{t("shop.cosmetics")}</h3>
        <p className="mt-1 text-sm text-silk">{t("shop.cosmetics.lead")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cosmetics.map((p) => {
            const grant = p.grants[0];
            const owned = Boolean(grant && (wallet.grants.includes(grant) || wallet.ownedSkus.includes(p.sku)));
            const worn =
              p.slot === "robe"
                ? wallet.wardrobe.robeId
                : p.slot === "palace"
                  ? wallet.wardrobe.palaceId
                  : wallet.wardrobe.bannerId;
            const equipped = Boolean(p.slot && worn === grant);
            return (
              <article key={p.sku} className="rounded-md bg-raised p-4">
                <p className="text-xs uppercase tracking-wider text-gilt">{t(`shop.slot.${p.slot ?? "robe"}`)}</p>
                <h4 className="font-display text-xl">{t(p.titleKey)}</h4>
                <p className="mt-1 text-sm text-silk">{t(p.bodyKey)}</p>
                <p className="mt-3 text-ivory">{formatStorePrice(locale, p)}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!owned && (
                    <Button size="sm" disabled={busy} onClick={() => onBuy(p.sku)}>
                      {t("shop.buy")}
                    </Button>
                  )}
                  {owned && p.slot && (
                    <Button
                      size="sm"
                      variant={equipped ? "gilt" : "ghost"}
                      disabled={busy || equipped || !canEquip(wallet, p.slot, grant)}
                      onClick={() => onEquip(p.slot!, grant)}
                    >
                      {equipped ? t("shop.wearing") : t("shop.wear")}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["robe", "palace", "banner"] as CosmeticSlot[]).map((slot) => (
            <Button key={slot} size="sm" variant="ghost" disabled={busy} onClick={() => onEquip(slot, "default")}>
              {t(`shop.reset.${slot}`)}
            </Button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function PremiumLock({
  entitled,
  title,
  body,
  onShop,
  t,
  children,
}: {
  entitled: boolean;
  title: string;
  body: string;
  onShop: () => void;
  t: (k: string) => string;
  children: ReactNode;
}) {
  if (entitled) return children;
  return (
    <Panel>
      <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-gilt">
        <Lock className="size-3.5" strokeWidth={1.6} />
        {t("shop.locked")}
      </p>
      <h3 className="mt-1 font-display text-2xl">{title}</h3>
      <p className="mt-2 text-sm text-silk">{body}</p>
      <Button className="mt-4" variant="gilt" onClick={onShop}>
        {t("shop.open")}
      </Button>
    </Panel>
  );
}

export function PremiumMark({ wallet, t }: { wallet: Wallet; t: (k: string) => string }) {
  if (!wallet.premium) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-raised px-2 py-1 text-[0.65rem] uppercase tracking-wider text-gilt">
      <Crown className="size-3" strokeWidth={1.6} />
      {t("shop.plan.badge")}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-raised px-3 py-2">
      <dt className="text-[0.65rem] uppercase tracking-wider text-silk">{label}</dt>
      <dd className="font-medium text-ivory">{value}</dd>
    </div>
  );
}

