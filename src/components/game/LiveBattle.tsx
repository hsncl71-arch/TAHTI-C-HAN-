import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TACTICS, type GameState, type TacticId } from "@/domains/types";
import { MATCH_LOCK_MS } from "@/domains/battle/model";
import {
  acceptMatch,
  challengePlayer,
  declineMatch,
  forfeitMatch,
  listLiveMatches,
  pollMatch,
  readyMatch,
  submitMatchTactic,
  type PublicMatch,
} from "@/server/api/battle";
import { meydanFromLocation } from "@/lib/notify/client";
import { getMyCampaign } from "@/server/api/campaign";

export function LiveBattle({
  state,
  t,
  onState,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  onState: (s: GameState) => void;
}) {
  const [match, setMatch] = useState<PublicMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const seenDone = useRef<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(() => (typeof window === "undefined" ? null : meydanFromLocation()));

  useEffect(() => {
    const onDeep = () => setFocusId(meydanFromLocation());
    window.addEventListener("taht-deeplink", onDeep);
    window.addEventListener("popstate", onDeep);
    return () => {
      window.removeEventListener("taht-deeplink", onDeep);
      window.removeEventListener("popstate", onDeep);
    };
  }, []);

  useEffect(() => {
    let live = true;
    async function beat() {
      try {
        const res = match?.id
          ? await pollMatch({ data: { matchId: match.id } })
          : focusId
            ? await pollMatch({ data: { matchId: focusId } })
            : await listLiveMatches();
        if (!live) return;
        setMatch(res.match);
      } catch {
        /* next tick */
      }
    }
    void beat();
    const id = window.setInterval(() => void beat(), 1200);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [match?.id, focusId, state.year]);

  useEffect(() => {
    if (!match) return;
    if (match.status !== "done" && match.status !== "forfeit") return;
    if (seenDone.current === match.id) return;
    seenDone.current = match.id;
    void getMyCampaign()
      .then((res) => {
        if (res.campaign) onState(res.campaign.state);
      })
      .catch(() => undefined);
  }, [match?.id, match?.status, onState]);

  async function run(fn: () => Promise<{ match: PublicMatch | null }>) {
    setBusy(true);
    try {
      const res = await fn();
      setMatch(res.match);
    } catch (err) {
      const raw = String(err instanceof Error ? err.message : err);
      toast(t(`error.${raw}`) === `error.${raw}` ? t("error.generic") : t(`error.${raw}`));
    } finally {
      setBusy(false);
    }
  }

  if (!match || match.status === "abandoned") return null;
  if (match.status === "done" || match.status === "forfeit") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-lg border border-line bg-raised p-5 shadow-lg">
          <p className="text-[0.65rem] uppercase tracking-wider text-gilt">{t("meydan.kicker")}</p>
          <h2 className="mt-1 font-display text-3xl text-ivory">{t("meydan.result")}</h2>
          <p className="mt-2 text-sm text-silk">
            {match.status === "forfeit"
              ? t("meydan.forfeit.done")
              : t(`result.${match.report?.result ?? match.result ?? "stalemate"}`)}
            {" · "}
            {match.opponentName}
          </p>
          {match.report && (
            <p className="mt-2 text-xs text-silk">
              {t("meydan.power", { atk: match.report.atkPower, def: match.report.defPower })}
            </p>
          )}
          <Button className="mt-4" variant="gilt" onClick={() => setMatch(null)}>
            {t("meydan.close")}
          </Button>
        </div>
      </div>
    );
  }

  if (match.status === "open" && match.selfSide === "guest") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-lg border border-line bg-raised p-5 shadow-lg">
          <p className="text-[0.65rem] uppercase tracking-wider text-gilt">{t("meydan.kicker")}</p>
          <h2 className="mt-1 font-display text-3xl text-ivory">{t("meydan.incoming")}</h2>
          <p className="mt-2 text-sm text-silk">{t("meydan.from", { name: match.hostName })}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="gilt" disabled={busy} onClick={() => void run(() => acceptMatch({ data: { matchId: match.id } }))}>
              {t("meydan.accept")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void run(() => declineMatch({ data: { matchId: match.id } }))}>
              {t("meydan.decline")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (match.status === "open") {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex justify-center px-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-line bg-raised/95 px-3 py-2 text-sm text-silk">
          <span>{t("meydan.waiting", { name: match.guestName })}</span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => declineMatch({ data: { matchId: match.id } }))}>
            {t("meydan.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  if (match.status === "lobby") {
    const selfReady = match.selfSide === "host" ? match.ready.host : match.ready.guest;
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-lg border border-line bg-raised p-5 shadow-lg">
          <p className="text-[0.65rem] uppercase tracking-wider text-gilt">{t("meydan.kicker")}</p>
          <h2 className="mt-1 font-display text-3xl text-ivory">{t("meydan.lobby")}</h2>
          <p className="mt-2 text-sm text-silk">
            {match.hostName} · {match.guestName}
          </p>
          <p className="mt-1 text-xs text-silk">
            {t("meydan.readyHost")}: {match.ready.host ? t("meydan.yes") : t("meydan.no")} · {t("meydan.readyGuest")}:{" "}
            {match.ready.guest ? t("meydan.yes") : t("meydan.no")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="gilt" disabled={busy || selfReady} onClick={() => void run(() => readyMatch({ data: { matchId: match.id } }))}>
              {selfReady ? t("meydan.readyWait") : t("meydan.ready")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void run(() => declineMatch({ data: { matchId: match.id } }))}>
              {t("meydan.leave")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (match.status === "live" || match.status === "resolving") {
    return (
      <LiveCommand
        match={match}
        busy={busy}
        t={t}
        onPick={(tactic) => {
          const nonce = (crypto.randomUUID?.() ?? `n${Date.now()}`).replace(/-/g, "").slice(0, 32);
          void run(() => submitMatchTactic({ data: { matchId: match.id, tactic, nonce } }));
        }}
        onForfeit={() => void run(() => forfeitMatch({ data: { matchId: match.id } }))}
      />
    );
  }

  return null;
}

function LiveCommand({
  match,
  busy,
  t,
  onPick,
  onForfeit,
}: {
  match: PublicMatch;
  busy: boolean;
  t: (k: string, v?: Record<string, string | number>) => string;
  onPick: (tactic: TacticId) => void;
  onForfeit: () => void;
}) {
  const [remain, setRemain] = useState(MATCH_LOCK_MS);
  useEffect(() => {
    const end = match.lockAt ?? Date.now() + MATCH_LOCK_MS;
    let raf = 0;
    const tick = () => {
      setRemain(Math.max(0, end - Date.now()));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [match.id, match.lockAt]);

  const secs = Math.ceil(remain / 1000);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-line bg-raised p-5 shadow-lg">
        <p className="text-[0.65rem] uppercase tracking-wider text-gilt">{t("meydan.kicker")}</p>
        <h2 className="mt-1 font-display text-3xl text-ivory">{match.opponentName}</h2>
        <p className="mt-2 text-sm text-silk">
          {t("duel.lock")} · {secs}
          {match.foeLocked ? ` · ${t("meydan.foeLocked")}` : ""}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink">
          <div className="h-full bg-crimson" style={{ width: `${(remain / MATCH_LOCK_MS) * 100}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {TACTICS.map((tactic) => (
            <Button
              key={tactic}
              variant={match.selfTactic === tactic ? "gilt" : "ghost"}
              disabled={busy || Boolean(match.selfTactic) || remain <= 0}
              onClick={() => onPick(tactic)}
            >
              {t(`tactic.${tactic}`)}
            </Button>
          ))}
        </div>
        <Button className="mt-3" size="sm" variant="ghost" disabled={busy} onClick={onForfeit}>
          {t("meydan.forfeit")}
        </Button>
      </div>
    </div>
  );
}

export async function issueChallenge(opponentUserId: string, provinceId: string) {
  return challengePlayer({ data: { opponentUserId, provinceId } });
}
