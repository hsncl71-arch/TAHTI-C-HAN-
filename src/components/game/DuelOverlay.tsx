import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useP2PRoom, type P2PRoomHandle } from "@/lib/multiplayer";
import type { PeerInfo } from "@/lib/multiplayer/p2p";
import { nid } from "@/domains/ids";
import { doctrineTactic } from "@/domains/military/combat";
import { TACTICS, type GameAction, type GameState, type TacticId } from "@/domains/types";

const LOCK_MS = 8000;

type MeshApi = {
  p2p: P2PRoomHandle;
  challenge: (peer: PeerInfo) => void;
  drillAi: () => void;
};

const MeshCtx = createContext<MeshApi | null>(null);

export function useLiveMesh(): MeshApi | null {
  return useContext(MeshCtx);
}

export function LiveMesh({
  state,
  act,
  busy,
  t,
  userId,
  children,
}: {
  state: GameState;
  act: (a: GameAction) => void;
  busy: boolean;
  t: (k: string, v?: Record<string, string | number>) => string;
  userId?: string;
  children: ReactNode;
}) {
  const p2p = useP2PRoom({ room: "taht-cihan", name: state.ruler.givenName.slice(0, 24), userId });
  const duel = state.military.pendingDuel;
  const aiDrill = Boolean(duel && duel.peerId === "ai");

  const challenge = useCallback((_peer: PeerInfo) => {
    /* Player fields go through `issueChallenge` / live_matches, not P2P. */
  }, []);

  const drillAi = useCallback(() => {
    act({
      type: "START_DUEL",
      peerId: "ai",
      peerName: "Serdar-ı Talim",
      provinceId: state.army.provinceId,
      seed: 0,
      host: true,
      duelId: nid("duel"),
    });
  }, [act, state.army.provinceId]);

  const api: MeshApi = { p2p, challenge, drillAi };

  return (
    <MeshCtx.Provider value={api}>
      {children}
      {aiDrill && duel && duel.phase === "live" && (
        <DuelOverlay state={state} t={t} busy={busy} act={act} />
      )}
    </MeshCtx.Provider>
  );
}

function DuelOverlay({
  state,
  t,
  busy,
  act,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  busy: boolean;
  act: (a: GameAction) => void;
}) {
  const duel = state.military.pendingDuel!;
  const [remain, setRemain] = useState(LOCK_MS);
  const locked = useRef(false);
  const actRef = useRef(act);
  actRef.current = act;
  const self = duel.selfTactic ?? state.military.liveOrders;
  const pickRef = useRef({ self, doctrine: state.military.doctrine });
  pickRef.current = { self, doctrine: state.military.doctrine };

  useEffect(() => {
    locked.current = false;
    setRemain(LOCK_MS);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const left = Math.max(0, LOCK_MS - (now - start));
      setRemain(left);
      if (left <= 0) {
        if (!locked.current) {
          locked.current = true;
          const cur = pickRef.current;
          actRef.current({
            type: "RESOLVE_DUEL",
            tactic: cur.self,
            foeTactic: doctrineTactic(cur.doctrine, "duel"),
          });
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duel.id]);

  const secs = Math.ceil(remain / 1000);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-line bg-raised p-5 shadow-lg">
        <p className="text-[0.65rem] uppercase tracking-wider text-gilt">{t("duel.title")}</p>
        <h2 className="mt-1 font-display text-3xl text-ivory">{t("duel.ai")}</h2>
        <p className="mt-2 text-sm text-silk">
          {t("duel.lock")} · {secs} · {t("duel.offline")}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink">
          <div className="h-full bg-crimson transition-none" style={{ width: `${(remain / LOCK_MS) * 100}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {TACTICS.map((tactic) => (
            <Button
              key={tactic}
              variant={self === tactic ? "gilt" : "ghost"}
              disabled={busy || remain <= 0}
              onClick={() => act({ type: "SET_TACTIC", tactic })}
            >
              {t(`tactic.${tactic}`)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
