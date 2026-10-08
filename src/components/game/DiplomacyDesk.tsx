import { useEffect, useMemo, useState } from "react";
import { Flag, Handshake, Mail, ScrollText, Shield, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import { cn } from "@/lib/cn";
import { akce } from "@/components/game/format";
import type { DipKind, DipTerms, GameAction, GameState, PeaceDemand, SeatClaim } from "@/domains/types";
import { PEACE_DEMANDS } from "@/domains/governance/model";
import { DIP_KINDS, emptyTerms, isPlayerHeld } from "@/domains/index";
import { listOffers, listWorld } from "@/server/api/diplomacy";

const KIND_ICON: Record<DipKind, typeof ScrollText> = {
  envoy: Mail,
  peace: Handshake,
  alliance: Shield,
  trade: ScrollText,
  war: Swords,
  coalition: Flag,
};

export function DiplomacyDesk({
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
  const [sel, setSel] = useState(state.relations[0]?.realmId ?? "");
  const [kind, setKind] = useState<DipKind>("envoy");
  const [terms, setTerms] = useState<DipTerms>(emptyTerms());
  const [seats, setSeats] = useState<SeatClaim[]>(state.diplomacy.seats);
  const [tab, setTab] = useState<"desk" | "inbox">("desk");

  useEffect(() => {
    void listWorld()
      .then((w) => setSeats(w.seats))
      .catch(() => undefined);
    void listOffers().catch(() => undefined);
  }, [state.year, state.diplomacy.pending.length]);

  const rel = state.relations.find((r) => r.realmId === sel);
  const realm = state.foreign.find((f) => f.id === sel);
  const seat = seats.find((s) => s.realmId === sel);
  const held = isPlayerHeld({ ...state, diplomacy: { ...state.diplomacy, seats } }, sel);
  const incoming = state.diplomacy.pending.filter((o) => o.toSeat === state.diplomacy.seatId && o.status === "pending");
  const outgoing = state.diplomacy.pending.filter((o) => o.fromSeat === state.diplomacy.seatId && o.status === "pending");

  const others = useMemo(() => state.foreign.filter((f) => f.id !== sel), [state.foreign, sel]);

  function send() {
    if (!sel) return;
    act({ type: "DIP_OFFER", realmId: sel, kind, terms });
    setTerms(emptyTerms());
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <Panel>
        <p className="text-xs uppercase tracking-[0.2em] text-gilt">{t("diplomasi.kicker")}</p>
        <h2 className="font-display text-3xl">{t("diplomasi.title")}</h2>
        <p className="mt-1 text-sm text-silk">{t("diplomasi.lead")}</p>
        <p className="mt-3 rounded-md bg-raised px-3 py-2 text-xs text-silk">{t("diplomasi.consent")}</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {state.relations.map((r) => {
            const f = state.foreign.find((x) => x.id === r.realmId);
            if (!f) return null;
            const st = seats.find((s) => s.realmId === r.realmId);
            const live = Boolean(st?.live);
            return (
              <li key={r.realmId}>
                <button
                  type="button"
                  onClick={() => setSel(r.realmId)}
                  className={cn(
                    "flex min-h-11 w-full items-start justify-between gap-2 rounded-md bg-raised px-3 py-2 text-left ring-1 ring-line transition-colors duration-150",
                    sel === r.realmId && "ring-gilt",
                  )}
                >
                  <span>
                    <span className="block font-medium">{f.name}</span>
                    <span className="text-xs text-silk">
                      {t(`treaty.${r.treaty}`)}
                      {r.tradePact ? ` · ${t("diplomasi.tradeOn")}` : ""}
                      {live ? ` · ${t("diplomasi.player")}` : ` · ${t("diplomasi.ai")}`}
                    </span>
                  </span>
                  <span className="tabular-nums text-gilt">{r.value}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="grid gap-4">
        <Panel>
          <div className="flex gap-2">
            <button
              type="button"
              className={cn("min-h-11 rounded-md px-3 text-sm", tab === "desk" ? "bg-raised text-ivory" : "text-silk")}
              onClick={() => setTab("desk")}
            >
              {t("diplomasi.desk")}
            </button>
            <button
              type="button"
              className={cn("min-h-11 rounded-md px-3 text-sm", tab === "inbox" ? "bg-raised text-ivory" : "text-silk")}
              onClick={() => setTab("inbox")}
            >
              {t("diplomasi.inbox")}
              {incoming.length > 0 ? ` (${incoming.length})` : ""}
            </button>
          </div>

          {tab === "desk" && realm && rel && (
            <div className="mt-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-2xl">{realm.name}</h3>
                  <p className="text-xs text-silk">
                    {held ? t("diplomasi.heldBy", { name: seat?.rulerName ?? t("diplomasi.player") }) : t("diplomasi.aiRegent", { name: seat?.rulerName ?? realm.adjective })}
                  </p>
                </div>
                <span className="tabular-nums text-gilt">{rel.value}</span>
              </div>
              {rel.treaty === "war" && (
                <div className="mt-4">
                  <p className="text-xs text-gilt">{t("peace.score", { n: state.governance?.warScore?.[sel] ?? 0 })}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {PEACE_DEMANDS.map((demand: PeaceDemand) => (
                      <Button
                        key={demand}
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          act({
                            type: "PEACE_TERMS",
                            realmId: sel,
                            demand,
                            provinceId: demand === "province" ? state.provinces.find((p) => p.ownerId === sel && p.neighbors.some((n) => state.provinces.find((x) => x.id === n)?.ownerId === state.realm.id))?.id : undefined,
                          })
                        }
                      >
                        {t(`peace.demand.${demand}`)}
                      </Button>
                    ))}
                  </div>
                  <Button className="mt-2" size="sm" variant="ghost" disabled={busy} onClick={() => act({ type: "SPY_REALM", realmId: sel })}>
                    {t("log.spy.title")}
                  </Button>
                  {state.governance?.spy?.[sel] && (
                    <p className="mt-2 text-xs text-silk">
                      {state.governance.spy[sel].year} · {state.governance.spy[sel].men} · {state.governance.spy[sel].confidence}
                    </p>
                  )}
                </div>
              )}
              {rel.treaty !== "war" && (
                <Button className="mt-3" size="sm" variant="ghost" disabled={busy} onClick={() => act({ type: "SPY_REALM", realmId: sel })}>
                  {t("log.spy.title")}
                </Button>
              )}
              {rel.coalitionAgainst && (
                <p className="mt-2 text-xs text-gilt">{t("diplomasi.coalitionVs", { realm: state.foreign.find((f) => f.id === rel.coalitionAgainst)?.name ?? rel.coalitionAgainst })}</p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DIP_KINDS.map((k) => {
                  const Icon = KIND_ICON[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        "flex min-h-11 items-center justify-center gap-2 rounded-md px-2 text-xs ring-1 ring-line",
                        kind === k ? "bg-raised text-gilt" : "text-silk",
                      )}
                    >
                      <Icon className="size-3.5" strokeWidth={1.6} />
                      {t(`dip.kind.${k}`)}
                    </button>
                  );
                })}
              </div>
              {kind === "peace" && (
                <label className="mt-4 grid gap-1 text-sm text-silk">
                  {t("diplomasi.tribute")}
                  <input
                    type="number"
                    min={0}
                    max={8000}
                    step={100}
                    value={terms.tribute}
                    onChange={(e) => setTerms((cur) => ({ ...cur, tribute: Number(e.target.value) }))}
                    className="h-11 rounded-md bg-ink/60 px-3 text-ivory ring-1 ring-line"
                  />
                </label>
              )}
              {(kind === "peace" || kind === "alliance" || kind === "trade") && (
                <label className="mt-3 grid gap-1 text-sm text-silk">
                  {t("diplomasi.duration")}
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={terms.durationYears}
                    onChange={(e) => setTerms((cur) => ({ ...cur, durationYears: Number(e.target.value) }))}
                    className="h-11 rounded-md bg-ink/60 px-3 text-ivory ring-1 ring-line"
                  />
                </label>
              )}
              {kind === "coalition" && (
                <label className="mt-3 grid gap-1 text-sm text-silk">
                  {t("diplomasi.against")}
                  <select
                    value={terms.againstRealmId ?? ""}
                    onChange={(e) => setTerms((cur) => ({ ...cur, againstRealmId: e.target.value || null }))}
                    className="h-11 rounded-md bg-ink/60 px-3 text-ivory ring-1 ring-line"
                  >
                    <option value="">{t("diplomasi.pickFoe")}</option>
                    {others.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="mt-3 grid gap-1 text-sm text-silk">
                {t("diplomasi.note")}
                <textarea
                  value={terms.note}
                  maxLength={280}
                  onChange={(e) => setTerms((cur) => ({ ...cur, note: e.target.value }))}
                  className="min-h-16 rounded-md bg-ink/60 p-3 text-sm text-ivory ring-1 ring-line"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant={kind === "war" ? "crimson" : "gilt"} disabled={busy || !sel} onClick={send}>
                  {held && kind !== "war" && kind !== "envoy" ? t("diplomasi.sendOffer") : t("diplomasi.dispatch")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || state.treasury < 400}
                  onClick={() => act({ type: "GIFT", realmId: sel, amount: 400 })}
                >
                  {t("diplomasi.gift")} · {akce(400)}
                </Button>
              </div>
              {held && kind !== "war" && kind !== "envoy" && (
                <p className="mt-2 text-xs text-silk">{t("diplomasi.needsConsent")}</p>
              )}
            </div>
          )}

          {tab === "inbox" && (
            <div className="mt-4 space-y-3">
              {incoming.length === 0 && outgoing.length === 0 && <p className="text-sm text-silk">{t("diplomasi.noOffers")}</p>}
              {incoming.map((o) => (
                <div key={o.id} className="rounded-md bg-raised p-3">
                  <p className="text-xs text-gilt">
                    {t(`dip.kind.${o.kind}`)} · {state.foreign.find((f) => f.id === o.fromSeat)?.name ?? o.fromSeat}
                  </p>
                  <p className="mt-1 text-sm text-silk">
                    {o.terms.tribute > 0 ? `${t("diplomasi.tribute")}: ${akce(o.terms.tribute)} · ` : ""}
                    {o.terms.durationYears} {t("diplomasi.years")}
                    {o.terms.againstRealmId ? ` · ${t("diplomasi.against")}: ${state.foreign.find((f) => f.id === o.terms.againstRealmId)?.name ?? o.terms.againstRealmId}` : ""}
                  </p>
                  {o.terms.note && <p className="mt-1 text-sm">{o.terms.note}</p>}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="gilt" disabled={busy} onClick={() => act({ type: "DIP_RESPOND", offerId: o.id, accept: true })}>
                      {t("diplomasi.accept")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ type: "DIP_RESPOND", offerId: o.id, accept: false })}>
                      {t("diplomasi.refuse")}
                    </Button>
                  </div>
                </div>
              ))}
              {outgoing.map((o) => (
                <div key={o.id} className="rounded-md bg-raised p-3">
                  <p className="text-xs text-silk">
                    {t("diplomasi.waiting")} · {t(`dip.kind.${o.kind}`)} · {state.foreign.find((f) => f.id === o.toSeat)?.name ?? o.toSeat}
                  </p>
                  <Button className="mt-2" size="sm" variant="ghost" disabled={busy} onClick={() => act({ type: "DIP_WITHDRAW", offerId: o.id })}>
                    {t("diplomasi.withdraw")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function UsurpBanner({
  t,
  onOpen,
}: {
  t: (k: string) => string;
  onOpen: () => void;
}) {
  return (
    <div className="relative z-30 border-b border-crimson/50 bg-crimson/20 px-3 py-2 text-sm text-ivory">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1">{t("diplomasi.usurped")}</p>
        <Button size="sm" variant="gilt" onClick={onOpen}>
          {t("diplomasi.chooseSeat")}
        </Button>
      </div>
    </div>
  );
}
