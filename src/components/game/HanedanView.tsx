import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import { PortraitActor } from "@/components/game/PortraitActor";
import { DynastyTree } from "@/components/game/DynastyTree";
import { isAdult, isChild } from "@/domains/dynasty/age";
import { heirScore } from "@/domains/dynasty/princes";
import { claimPower } from "@/domains/dynasty/claim";
import { ownedProvinces } from "@/domains/world/engine";
import type { Education, GameAction, GameState } from "@/domains/types";
import type { Wallet } from "@/domains/commerce/model";

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

export function HanedanView({
  state,
  t,
  act,
  busy,
  wallet,
  onShop,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  act: (a: GameAction) => void;
  busy: boolean;
  wallet?: Wallet | null;
  onShop?: () => void;
}) {
  const owned = ownedProvinces(state);
  const npcs = state.npcs.filter((n) => n.alive);
  return (
    <div className="grid gap-3">
      <DynastyTree state={state} t={t} wallet={wallet} onShop={onShop} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {state.members
        .filter((m) => m.alive)
        .sort((a, b) => a.birthYear - b.birthYear)
        .map((m) => {
          const age = state.year - m.birthYear;
          const adult = isAdult(m, state.year);
          const child = isChild(m, state.year);
          const prince = m.role === "sehzade" || m.role === "akraba";
          const claim = prince ? claimPower(state, m) : null;
          return (
            <Panel key={m.id}>
              <p className="text-xs uppercase tracking-wider text-gilt">
                {t(`role.${m.role}`)}
                {m.haremRank !== "none" ? ` · ${t(`rank.${m.haremRank}`)}` : ""}
              </p>
              <div className="mt-2 flex gap-3">
                <div className="w-16 shrink-0">
                  <PortraitActor portrait={m.portrait} name={m.givenName} age={age} compact />
                </div>
                <div>
                  <h3 className="font-display text-2xl">{m.givenName}</h3>
                  <p className="text-sm text-silk">
                    {age} {t("hud.age")} · {m.location}
                  </p>
                  {prince && adult && (
                    <p className="text-xs text-gilt">
                      {t("hanedan.claim")} {heirScore(state, m)} · {t("hanedan.gen", { n: m.generation })}
                    </p>
                  )}
                </div>
              </div>
              {prince && claim && (
                <div className="mt-3 grid gap-2">
                  <Meter label={t("claim.court")} value={claim.court} />
                  <Meter label={t("claim.army")} value={claim.army} />
                  <Meter label={t("claim.people")} value={claim.people} />
                  <Meter label={t("claim.province")} value={claim.province} />
                  <Meter label={t("claim.talent")} value={claim.talent} />
                  <Meter label={t("claim.blood")} value={claim.blood} />
                  {m.supporters.length > 0 && (
                    <p className="text-xs text-silk">
                      {t("hanedan.supporters")}:{" "}
                      {m.supporters
                        .map((id) => state.npcs.find((n) => n.id === id)?.name)
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  <select
                    className="rounded-md bg-ink/60 p-2 text-sm ring-1 ring-line"
                    disabled={busy}
                    value={m.education ?? ""}
                    onChange={(e) => act({ type: "EDUCATE", memberId: m.id, track: e.target.value as Education })}
                  >
                    <option value="">{t("hanedan.educate")}</option>
                    <option value="seyfiye">{t("edu.seyfiye")}</option>
                    <option value="kalemiye">{t("edu.kalemiye")}</option>
                    <option value="ilmiye">{t("edu.ilmiye")}</option>
                  </select>
                  {adult && (
                    <>
                      <select
                        className="rounded-md bg-ink/60 p-2 text-sm ring-1 ring-line"
                        disabled={busy}
                        value={m.location}
                        onChange={(e) => act({ type: "SANJAK", memberId: m.id, provinceId: e.target.value })}
                      >
                        {owned.map((p) => (
                          <option key={p.id} value={p.id}>
                            {t("hanedan.sanjak")} · {t(p.nameKey)}
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ type: "DRILL_PRINCE", memberId: m.id })}>
                          {t("hanedan.drill")}
                        </Button>
                      </div>
                      <select
                        className="rounded-md bg-ink/60 p-2 text-sm ring-1 ring-line"
                        disabled={busy}
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) act({ type: "CULTIVATE", memberId: m.id, npcId: e.target.value });
                        }}
                      >
                        <option value="">{t("hanedan.cultivate")}</option>
                        {npcs
                          .filter((n) => !m.supporters.includes(n.id))
                          .map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.name}
                            </option>
                          ))}
                      </select>
                    </>
                  )}
                  {child && <p className="text-xs text-silk">{t("harem.childGuard")}</p>}
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
