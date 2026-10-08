import {
  ATTACK_EDICTS,
  DEBT_EDICTS,
  FAMINE_EDICTS,
  OFFENSIVE_EDICTS,
  PEACE_EDICTS,
  TAX_EDICTS,
  TRADE_EDICTS,
  ULUFE_EDICTS,
  WAR_OFFER_EDICTS,
  WORKS_EDICTS,
  type GameAction,
  type GameState,
  type StandingEdicts,
} from "@/domains/types";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import { cn } from "@/lib/cn";

const GROUPS: { key: keyof StandingEdicts; options: readonly string[] }[] = [
  { key: "onAttack", options: ATTACK_EDICTS },
  { key: "offensive", options: OFFENSIVE_EDICTS },
  { key: "peace", options: PEACE_EDICTS },
  { key: "famine", options: FAMINE_EDICTS },
  { key: "ulufe", options: ULUFE_EDICTS },
  { key: "debt", options: DEBT_EDICTS },
  { key: "tax", options: TAX_EDICTS },
  { key: "trade", options: TRADE_EDICTS },
  { key: "warOffer", options: WAR_OFFER_EDICTS },
  { key: "works", options: WORKS_EDICTS },
];

export function EdictDesk({
  state,
  t,
  act,
  busy,
  onClose,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  act: (a: GameAction) => void;
  busy: boolean;
  onClose: () => void;
}) {
  const edicts = state.world.edicts;
  const works = state.world.works;

  function set<K extends keyof StandingEdicts>(key: K, value: StandingEdicts[K]) {
    if (edicts[key] === value) return;
    act({ type: "SET_EDICTS", edicts: { [key]: value } });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-3 backdrop-blur-sm">
      <Panel className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-gilt">{t("nizam.kicker")}</p>
            <h2 className="font-display text-3xl">{t("nizam.title")}</h2>
            <p className="mt-1 text-sm text-silk">{t("nizam.lead")}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("nizam.close")}
          </Button>
        </div>

        <div className="mt-5 grid gap-4">
          {GROUPS.map((g) => (
            <div key={g.key}>
              <p className="text-sm text-ivory">{t(`nizam.${g.key}`)}</p>
              <p className="text-xs text-silk">{t(`nizam.${g.key}.d`)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {g.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={busy}
                    onClick={() => set(g.key, opt as StandingEdicts[typeof g.key])}
                    className={cn(
                      "min-h-11 rounded-md px-3 text-sm ring-1 ring-line transition-colors",
                      edicts[g.key] === opt ? "bg-raised text-ivory ring-gilt/50" : "text-silk hover:text-ivory",
                    )}
                  >
                    {t(`edict.${g.key}.${opt}`)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {works.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-sm text-ivory">{t("nizam.queue")}</p>
            <ul className="mt-2 space-y-1 text-sm text-silk">
              {works.map((w) => (
                <li key={w.id}>
                  {t(`building.${w.building}`)} · {t("nizam.eta", { year: w.etaYear })}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="gilt"
            size="sm"
            disabled={busy || state.treasury < 1500}
            onClick={() => act({ type: "COMMISSION_WORK", building: "kervansaray" })}
          >
            {t("nizam.commission.caravan")}
          </Button>
          <Button
            variant="gilt"
            size="sm"
            disabled={busy || state.treasury < 2200}
            onClick={() => act({ type: "COMMISSION_WORK", building: "hisar" })}
          >
            {t("nizam.commission.hisar")}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
