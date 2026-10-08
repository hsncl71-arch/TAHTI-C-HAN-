import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import { Audience } from "@/components/game/Audience";
import { PortraitActor } from "@/components/game/PortraitActor";
import { RulerDossier } from "@/components/game/RulerDossier";
import { HaremCourt } from "@/components/game/HaremCourt";
import { CINEMATIC_CULUS, ROOM_ORDER, findOccupantSubject, occupantsIn, roomCinematic, roomSceneSrc } from "@/domains/palace/rooms";
import { allowsVideo, useQuality } from "@/domains/settings/quality";
import { roomAtmosphere } from "@/domains/palace/dialogue";
import { expressionForSovereign } from "@/domains/palace/identity";
import type { GameAction, GameState, Locale, PalaceRoomId } from "@/domains/types";
import { cn } from "@/lib/cn";

export function PalaceHall({
  state,
  t,
  act,
  busy,
  locale,
}: {
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  act: (a: GameAction) => void;
  busy: boolean;
  locale: Locale;
}) {
  const room = state.palace.currentRoom;
  const [guest, setGuest] = useState<string | null>(null);
  const cinema = roomCinematic(state, room);
  const quality = useQuality((s) => s.quality);
  const [playCinema, setPlayCinema] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return Boolean(cinema) && allowsVideo(quality);
  });

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = !reduce && allowsVideo(quality) && Boolean(roomCinematic(state, room));
    setPlayCinema(next);
    setGuest(null);
  }, [room, quality, state.palace.seenCinematics.join("|")]);

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <RulerDossier state={state} t={t} />
      <div className="grid gap-4">
        <RoomStrip state={state} t={t} current={room} busy={busy} onVisit={(r) => act({ type: "VISIT_ROOM", room: r })} />
        <RoomStage
          state={state}
          room={room}
          t={t}
          locale={locale}
          playCinema={playCinema}
          onCinemaEnd={() => {
            setPlayCinema(false);
            act({ type: "MARK_CINEMATIC", id: CINEMATIC_CULUS.id });
          }}
          onMeet={setGuest}
        />
        {room === "harem" && <HaremCourt state={state} t={t} act={act} busy={busy} />}
        {room === "taht" && (
          <Panel>
            <h2 className="font-display text-2xl">{t("saray.welcome")}</h2>
            <p className="mt-2 text-sm text-silk">
              {t("app.tagline")} · {t("hud.year")} {state.year}
            </p>
            <Button
              className="mt-4"
              variant="gilt"
              disabled={busy || state.lastDivanYear === state.year}
              onClick={() => act({ type: "HOLD_DIVAN" })}
            >
              {state.lastDivanYear === state.year ? t("saray.held") : t("saray.hold")}
            </Button>
          </Panel>
        )}
        {guest && (
          <Audience
            state={state}
            characterId={guest}
            locale={locale}
            t={t}
            busy={busy}
            act={act}
            onClose={() => setGuest(null)}
          />
        )}
      </div>
    </div>
  );
}

export function RoomChrome({
  state,
  room,
  t,
  locale,
  act,
  busy,
  children,
}: {
  state: GameState;
  room: PalaceRoomId;
  t: (k: string, v?: Record<string, string | number>) => string;
  locale: Locale;
  act: (a: GameAction) => void;
  busy: boolean;
  children: ReactNode;
}) {
  const [guest, setGuest] = useState<string | null>(null);
  return (
    <div className="grid gap-4">
      <RoomStage state={state} room={room} t={t} locale={locale} playCinema={false} onCinemaEnd={() => undefined} onMeet={setGuest} />
      {guest && (
        <Audience state={state} characterId={guest} locale={locale} t={t} busy={busy} act={act} onClose={() => setGuest(null)} />
      )}
      {children}
    </div>
  );
}

function RoomStrip({
  state,
  t,
  current,
  busy,
  onVisit,
}: {
  state: GameState;
  t: (k: string) => string;
  current: PalaceRoomId;
  busy: boolean;
  onVisit: (room: PalaceRoomId) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {ROOM_ORDER.map((room) => (
        <button
          key={room}
          type="button"
          disabled={busy}
          onClick={() => onVisit(room)}
          className={cn(
            "min-h-11 shrink-0 overflow-hidden rounded-md ring-1 ring-line",
            current === room && "ring-gilt",
          )}
        >
          <span className="relative block h-16 w-28">
            <img src={roomSceneSrc(room)} alt="" className="h-full w-full object-cover" crossOrigin="anonymous" />
            <span className="absolute inset-x-0 bottom-0 bg-ink/70 px-1 py-0.5 text-[0.65rem] text-ivory">
              {t(`room.${room}`)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function RoomStage({
  state,
  room,
  t,
  locale,
  playCinema,
  onCinemaEnd,
  onMeet,
}: {
  state: GameState;
  room: PalaceRoomId;
  t: (k: string) => string;
  locale: Locale;
  playCinema: boolean;
  onCinemaEnd: () => void;
  onMeet: (id: string) => void;
}) {
  const people = occupantsIn(state, room);
  const rulerAge = state.year - state.ruler.birthYear;
  return (
    <Panel className="overflow-hidden p-0">
      <div className="relative aspect-[16/9] max-h-[28rem] w-full bg-ink">
        {playCinema ? (
          <video
            src={CINEMATIC_CULUS.src}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            onEnded={onCinemaEnd}
            onError={onCinemaEnd}
          />
        ) : (
          <img src={roomSceneSrc(room)} alt="" className="h-full w-full object-cover" crossOrigin="anonymous" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-ink/20" />
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-xs uppercase tracking-[0.2em] text-gilt">{t(`room.${room}`)}</p>
          <p className="mt-1 max-w-xl text-sm text-ivory">{roomAtmosphere(room, locale)}</p>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto p-3">
        {people.map((occ) => {
          const sub = findOccupantSubject(state, occ);
          if (!sub) return null;
          const speaking = false;
          const expr = occ.kind === "ruler" ? expressionForSovereign(state, speaking) : "idle";
          return (
            <div key={`${occ.room}-${occ.characterId}`} className="w-20 shrink-0">
              <PortraitActor
                portrait={sub.portrait}
                name={sub.name}
                age={sub.age}
                expression={expr}
                compact
                onClick={() => onMeet(sub.id)}
              />
              <p className="mt-1 truncate text-center text-[0.7rem] text-ivory">{sub.name}</p>
              <p className="truncate text-center text-[0.6rem] text-silk">
                {occ.kind === "ruler" ? t("role.sultan") : occ.kind === "npc" ? t(`office.${sub.subtitle}`) : t(`role.${sub.subtitle}`)}
              </p>
            </div>
          );
        })}
      </div>
      <span className="sr-only">{rulerAge}</span>
    </Panel>
  );
}
