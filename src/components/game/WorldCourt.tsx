import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import { cn } from "@/lib/cn";
import { useLiveMesh } from "@/components/game/DuelOverlay";
import { issueChallenge } from "@/components/game/LiveBattle";
import { fetchIceServers } from "@/lib/multiplayer";
import type { GameState, SeatClaim } from "@/domains/types";
import { flagLetter, listLetters, listWorld, rebindSeat, sendLetter, createSeatInvite, redeemSeatInvite } from "@/server/api/diplomacy";
import { listPresence } from "@/server/api/world";
import { blockUser, reportUser } from "@/server/api/safety";
import { SEAT_CATALOG } from "@/domains/map/provinces";

export function WorldCourt({
  state,
  t,
  usurped,
  onRebound,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  usurped?: boolean;
  onRebound?: (next: GameState) => void;
}) {
  const mesh = useLiveMesh();
  const p2p = mesh?.p2p;
  const [seats, setSeats] = useState<SeatClaim[]>(state.diplomacy.seats);
  const [peers, setPeers] = useState<Awaited<ReturnType<typeof listPresence>>>([]);
  const [letters, setLetters] = useState<Awaited<ReturnType<typeof listLetters>>>([]);
  const [to, setTo] = useState("");
  const [toSeat, setToSeat] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [iceNote, setIceNote] = useState<string | null>(null);

  function refresh() {
    void listWorld()
      .then((w) => setSeats(w.seats))
      .catch(() => undefined);
    void listPresence()
      .then(setPeers)
      .catch(() => undefined);
    void fetchIceServers()
      .then((ice) => setIceNote(ice.status.noteKey))
      .catch(() => setIceNote("ice.stunOnly"));
  }

  useEffect(() => {
    refresh();
  }, [state.year]);

  async function dispatchLetter() {
    if (!to || msg.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      await sendLetter({ data: { toUserId: to, toSeat, body: msg.trim() } });
      setMsg("");
      refresh();
    } catch (e) {
      const raw = String(e instanceof Error ? e.message : e);
      setErr(t(raw.startsWith("moderation_") ? `mod.${raw.slice(11)}` : raw.startsWith("rate_") ? "mod.rate" : raw === "blocked" ? "mod.blocked" : raw === "muted" ? "mod.muted" : "cihan.sendFail"));
    } finally {
      setBusy(false);
    }
  }

  async function claim(seatId: string) {
    setBusy(true);
    try {
      const res = await rebindSeat({ data: { seatId } });
      onRebound?.(res.state);
      toast(t("diplomasi.claimed"));
      refresh();
    } catch (e) {
      const raw = String(e instanceof Error ? e.message : e);
      const key = `error.${raw}`;
      toast(t(key) === key ? t("error.generic") : t(key));
    } finally {
      setBusy(false);
    }
  }

  async function invite(seatId: string) {
    setBusy(true);
    try {
      const res = await createSeatInvite({ data: { seatId } });
      setIssued(res.token);
      toast(t("cihan.invite.ok", { token: res.token }));
    } catch (e) {
      const raw = String(e instanceof Error ? e.message : e);
      const key = `error.${raw}`;
      toast(t(key) === key ? t("error.generic") : t(key));
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    if (code.trim().length < 6) return;
    setBusy(true);
    try {
      const res = await redeemSeatInvite({ data: { token: code.trim() } });
      onRebound?.(res.state);
      setCode("");
      toast(t("cihan.invite.joined"));
      refresh();
    } catch (e) {
      const raw = String(e instanceof Error ? e.message : e);
      const key = `error.${raw}`;
      toast(t(key) === key ? t("error.generic") : t(key));
    } finally {
      setBusy(false);
    }
  }

  const livePeers = peers.filter((p) => !p.isSelf);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <p className="text-xs uppercase tracking-[0.2em] text-gilt">{t("cihan.kicker")}</p>
        <h2 className="font-display text-3xl">{t("cihan.thrones")}</h2>
        <p className="mt-1 text-sm text-silk">{t("cihan.thronesLead")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t("cihan.invite.placeholder")}
            className="min-h-11 min-w-40 flex-1 rounded-md bg-ink/60 px-3 text-sm ring-1 ring-line"
          />
          <Button size="sm" disabled={busy || code.trim().length < 6} onClick={() => void redeem()}>
            {t("cihan.invite.redeem")}
          </Button>
        </div>
        {issued && <p className="mt-2 text-sm text-gilt">{t("cihan.invite.code", { token: issued })}</p>}
        {usurped && <p className="mt-3 rounded-md bg-crimson/20 px-3 py-2 text-sm">{t("diplomasi.usurped")}</p>}
        <ul className="mt-4 space-y-2">
          {SEAT_CATALOG.map((cat) => {
            const seat = seats.find((s) => s.realmId === cat.id);
            const live = Boolean(seat?.live);
            const mine = seat?.realmId === state.diplomacy.seatId && !usurped;
            return (
              <li key={cat.id} className="flex items-center justify-between gap-2 rounded-md bg-raised px-3 py-2">
                <span>
                  <span className="block font-medium">{cat.name}</span>
                  <span className="text-xs text-silk">
                    {live ? `${seat?.rulerName} · ${t("diplomasi.player")}` : `${seat?.rulerName ?? t("diplomasi.ai")} · ${t("diplomasi.ai")}`}
                    {seat?.claimable ? ` · ${t("diplomasi.claimable")}` : ""}
                  </span>
                </span>
                {mine ? (
                  <span className="text-xs text-gilt">{t("diplomasi.yours")}</span>
                ) : seat?.claimable ? (
                  <span className="flex gap-1">
                    <Button size="sm" variant="gilt" disabled={busy} onClick={() => void claim(cat.id)}>
                      {t("diplomasi.claim")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void invite(cat.id)}>
                      {t("cihan.invite")}
                    </Button>
                  </span>
                ) : (
                  <span className="text-xs text-silk">{t("diplomasi.occupied")}</span>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel>
        <h2 className="font-display text-2xl">{t("cihan.peers")}</h2>
        <p className="mt-1 text-xs text-silk">
          {p2p?.joined ? t("cihan.mesh", { n: p2p.peers.length }) : t("cihan.meshWait")}
          {iceNote ? ` · ${t(iceNote)}` : ""}
        </p>
        {p2p && p2p.peers.length > 0 && (
          <ul className="mt-3 space-y-2">
            {p2p.peers.map((peer) => (
              <li key={peer.id} className="flex items-center justify-between gap-2 rounded-md bg-raised px-3 py-2">
                <span>
                  <span className="block font-medium">{peer.name}</span>
                  <span className="text-xs text-silk">{t(`ice.state.${peer.connectionState}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {livePeers.length === 0 ? (
          <p className="mt-3 text-sm text-silk">{t("cihan.empty")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {livePeers.map((p) => (
              <li key={p.userId}>
                <button
                  type="button"
                  className={cn("w-full rounded-md bg-raised px-3 py-2 text-left", to === p.userId && "ring-1 ring-gilt")}
                  onClick={() => {
                    setTo(p.userId);
                    const match = seats.find((s) => s.rulerName === p.rulerName && s.live);
                    setToSeat(match?.realmId ?? "");
                  }}
                >
                  <span className="block font-medium">{p.rulerName}</span>
                  <span className="text-xs text-silk">
                    {p.realmName} · {p.year}
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="crimson"
                  className="mt-1"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void issueChallenge(p.userId, state.army.provinceId)
                      .then(() => toast(t("meydan.sent")))
                      .catch((e) => {
                        const raw = String(e instanceof Error ? e.message : e);
                        const key = `error.${raw}`;
                        toast(t(key) === key ? t("error.generic") : t(key));
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  {t("cihan.challenge")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder={t("cihan.message")}
          className="mt-3 min-h-20 w-full rounded-md bg-ink/60 p-3 text-sm ring-1 ring-line"
        />
        {err && <p className="mt-2 text-xs text-crimson">{err}</p>}
        <Button className="mt-2" variant="gilt" disabled={!to || msg.trim().length < 2 || busy} onClick={() => void dispatchLetter()}>
          {t("cihan.send")}
        </Button>
        <p className="mt-2 text-xs text-silk">{t("cihan.modNote")}</p>
      </Panel>

      <Panel className="lg:col-span-2">
        <h2 className="font-display text-2xl">{t("cihan.inbox")}</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {letters.length === 0 && <li className="text-silk">{t("cihan.noLetters")}</li>}
          {letters.map((e) => (
            <li key={e.id} className="rounded-md bg-raised p-3">
              <p className="text-xs text-silk">
                {e.fromRuler} · {e.fromRealm} · {e.year}
                {e.status === "flagged" ? ` · ${t("cihan.flagged")}` : ""}
              </p>
              <p className="mt-1">{e.body}</p>
              {!e.isSelf && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {e.status !== "flagged" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void flagLetter({ data: { id: e.id } }).then(refresh);
                        void reportUser({ data: { userId: e.fromUserId, letterId: e.id, reason: "abuse" } });
                      }}
                    >
                      {t("cihan.flag")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void blockUser({ data: { userId: e.fromUserId, on: true } }).then(() => toast(t("cihan.blocked")));
                    }}
                  >
                    {t("cihan.block")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
