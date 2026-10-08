import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import { PortraitActor } from "@/components/game/PortraitActor";
import { akce } from "@/components/game/format";
import { takeRealmSnapshot } from "@/domains/dynasty/reigns";
import type { ClaimPower, GameAction, GameState } from "@/domains/types";

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[0.65rem] uppercase tracking-wider text-silk">
        <span>{label}</span>
        <span className="tabular-nums text-ivory">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink">
        <div className="h-full rounded-full bg-gilt" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

const CLAIM_KEYS: { id: keyof ClaimPower; key: string }[] = [
  { id: "court", key: "claim.court" },
  { id: "army", key: "claim.army" },
  { id: "people", key: "claim.people" },
  { id: "province", key: "claim.province" },
  { id: "talent", key: "claim.talent" },
  { id: "blood", key: "claim.blood" },
];

export function SuccessionView({
  state,
  t,
  act,
  busy,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  act: (a: GameAction) => void;
  busy: boolean;
}) {
  const suc = state.succession;
  if (!suc) return null;
  const snap = takeRealmSnapshot(state);
  const chosen = suc.heirMemberId;
  const wars = snap.wars.length;
  const pretenders = suc.pretenders;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 p-3 sm:p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <Panel>
          <p className="text-xs uppercase tracking-[0.2em] text-gilt">{t("succession.title")}</p>
          <h2 className="mt-1 font-display text-3xl sm:text-4xl">
            {t("succession.lead", { name: suc.deceasedName })}
          </h2>
          <p className="mt-2 text-sm text-silk">{t("succession.hint")}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <InheritStat label={t("hud.treasury")} value={akce(snap.treasury)} />
            <InheritStat label={t("succession.debt")} value={akce(snap.debt)} />
            <InheritStat label={t("hud.stability")} value={String(snap.stability)} />
            <InheritStat
              label={t("hud.army")}
              value={akce(snap.army.janissary + snap.army.sipahi + snap.army.azab)}
            />
            <InheritStat label={t("succession.wars")} value={String(wars)} />
            <InheritStat label={t("succession.friends")} value={String(snap.friends.length)} />
            <InheritStat label={t("succession.enemies")} value={String(snap.enemies.length)} />
            <InheritStat label={t("succession.provinces")} value={String(snap.provincesOwned)} />
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[0.65rem] uppercase tracking-wider text-silk">
              <span>{t("succession.tension")}</span>
              <span className="tabular-nums text-ivory">{suc.tension}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink">
              <div className="h-full rounded-full bg-crimson" style={{ width: `${suc.tension}%` }} />
            </div>
            {suc.tension >= 50 && pretenders.length > 1 && (
              <p className="mt-2 text-sm text-silk">{t("succession.struggle")}</p>
            )}
          </div>
        </Panel>

        <div className="grid gap-3 md:grid-cols-2">
          {pretenders.map((p) => {
            const age = state.year - p.birthYear;
            const active = p.memberId === chosen;
            const mother = p.motherId ? state.members.find((m) => m.id === p.motherId) : undefined;
            return (
              <button
                key={p.memberId}
                type="button"
                disabled={busy}
                onClick={() => act({ type: "BACK_PRETENDER", memberId: p.memberId })}
                className={`rounded-xl bg-panel/95 p-4 text-left text-ivory shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gilt)_28%,transparent)] transition-colors ${
                  active ? "ring-1 ring-gilt" : ""
                }`}
              >
                <div className="flex gap-3">
                  <div className="w-16 shrink-0">
                    <PortraitActor portrait={p.portrait} name={p.name} age={age} compact />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-gilt">
                      {t("succession.pretender")} · {t("hanedan.gen", { n: p.generation })}
                    </p>
                    <h3 className="font-display text-2xl">{p.name}</h3>
                    <p className="text-xs text-silk">
                      {age} {t("hud.age")}
                      {mother ? ` · ${mother.givenName}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-gilt">
                      {t("hanedan.claim")} {p.strength}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {CLAIM_KEYS.map((c) => (
                    <Meter key={c.id} label={t(c.key)} value={p.claim[c.id]} />
                  ))}
                </div>
                {p.backers.length > 0 && (
                  <p className="mt-2 text-xs text-silk">
                    {t("hanedan.supporters")}:{" "}
                    {p.backers
                      .map((id) => state.npcs.find((n) => n.id === id)?.name)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        <div className="sticky bottom-3">
          <Button
            size="block"
            disabled={busy || !chosen}
            onClick={() => act({ type: "CONFIRM_SUCCESSION" })}
          >
            {t("succession.cta")} · {suc.heirName}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InheritStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-raised px-3 py-2">
      <p className="text-[0.65rem] uppercase tracking-wider text-silk">{label}</p>
      <p className="tabular-nums text-ivory">{value}</p>
    </div>
  );
}
