import { Panel } from "@/components/ornament";
import { Button } from "@/components/ui/button";
import { PortraitActor } from "@/components/game/PortraitActor";
import { PremiumLock } from "@/components/game/BazaarView";
import { byGeneration } from "@/domains/dynasty/tree";
import { currentReign, generationCount } from "@/domains/dynasty/reigns";
import type { GameState } from "@/domains/types";
import type { Wallet } from "@/domains/commerce/model";
import { hasFeature } from "@/domains/commerce/entitlements";
import { cn } from "@/lib/cn";

export function DynastyTree({
  state,
  t,
  wallet,
  onShop,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  wallet?: Wallet | null;
  onShop?: () => void;
}) {
  const gens = byGeneration(state);
  const keys = [...gens.keys()].sort((a, b) => a - b);
  const reign = currentReign(state);
  const depth = generationCount(state);
  const archive = Boolean(wallet && hasFeature(wallet, "archive"));

  return (
    <>
    <Panel>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-gilt">{t("tree.title")}</p>
          <h2 className="font-display text-2xl">{state.ruler.dynastyName}</h2>
        </div>
        <p className="text-xs text-silk">
          {t("tree.summary", {
            gen: depth,
            reigns: (state.reigns ?? []).length,
            ordinal: reign?.ordinal ?? 1,
          })}
        </p>
      </div>
      <div className="mt-4 space-y-4">
        {keys.map((g) => {
          const row = gens.get(g) ?? [];
          return (
            <div key={g}>
              <p className="mb-2 text-[0.65rem] uppercase tracking-wider text-silk">
                {t("hanedan.gen", { n: g })}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {row.map((m) => {
                  const current = m.id === state.ruler.memberId;
                  const father = m.fatherId ? state.members.find((x) => x.id === m.fatherId) : undefined;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "min-w-28 shrink-0 rounded-md bg-raised px-2 py-2",
                        !m.alive && "opacity-50",
                        current && "ring-1 ring-gilt",
                      )}
                    >
                      <div className="mx-auto w-12">
                        <PortraitActor
                          portrait={m.portrait}
                          name={m.givenName}
                          age={state.year - m.birthYear}
                          compact
                        />
                      </div>
                      <p className="mt-1 truncate text-center text-sm">{m.givenName}</p>
                      <p className="truncate text-center text-[0.65rem] uppercase tracking-wider text-silk">
                        {t(`role.${m.role}`)}
                      </p>
                      <p className="text-center text-[0.65rem] tabular-nums text-silk">
                        {m.birthYear}
                        {m.deathYear ? `–${m.deathYear}` : ""}
                      </p>
                      {father && (
                        <p className="truncate text-center text-[0.65rem] text-silk">
                          {t("tree.sonof", { name: father.givenName })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
    <PremiumLock
      entitled={archive}
      title={t("shop.perk.archive")}
      body={t("shop.lock.archive")}
      onShop={onShop ?? (() => undefined)}
      t={t}
    >
      <Panel>
        <h3 className="font-display text-2xl">{t("shop.archive.title")}</h3>
        <p className="mt-1 text-sm text-silk">{t("shop.archive.lead")}</p>
        <p className="mt-3 text-sm text-ivory">
          {t("shop.archive.stats", {
            members: state.members.length,
            alive: state.members.filter((m) => m.alive).length,
            gen: depth,
          })}
        </p>
        <Button
          className="mt-4"
          variant="ghost"
          onClick={() => {
            const blob = new Blob(
              [JSON.stringify({ dynasty: state.ruler.dynastyName, members: state.members, reigns: state.reigns }, null, 2)],
              { type: "application/json" },
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `taht-hanedan-${state.year}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          {t("shop.export")}
        </Button>
      </Panel>
    </PremiumLock>
    </>
  );
}
