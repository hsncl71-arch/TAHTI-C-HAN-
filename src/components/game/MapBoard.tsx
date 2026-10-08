import { useMemo, useRef, useState } from "react";
import type { GameState, MapLayer } from "@/domains/types";
import { realmPopulation } from "@/domains/governance/model";
import { cn } from "@/lib/cn";
import { terrainOf, weatherOf } from "@/domains/military/terrain";
import { canonOwnersAt } from "@/domains/history/canon";
import { holderSeat, playerSeatId, seatLabel } from "@/domains/history/model";
import { provinceDivergence } from "@/domains/history/engine";
import { deriveHost } from "@/domains/military/realms";

const LAYERS: MapLayer[] = ["siyasi", "ekonomi", "sadakat", "nufus", "ordu", "diplomasi", "uretim", "isyan"];

const REALM_COLOR: Record<string, string> = {
  player: "#8f2d2d",
  karaman: "#6b5340",
  akkoyunlu: "#3f5c4c",
  memluk: "#8a6a2f",
  venedik: "#3d5a73",
  macar: "#5c3d55",
  trabzon: "#4d6270",
  kirim: "#6a4a32",
};

export function MapBoard({
  state,
  t,
  onSelect,
}: {
  state: GameState;
  t: (k: string) => string;
  onSelect?: (id: string) => void;
}) {
  const [sel, setSel] = useState<string | null>(state.realm.capitalId);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [layer, setLayer] = useState<MapLayer>("siyasi");
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  const selected = state.provinces.find((p) => p.id === sel);
  const ownerName = (id: string) =>
    id === state.realm.id ? state.realm.name : state.foreign.find((f) => f.id === id)?.name ?? id;
  const route = new Set(state.campaign?.route ?? []);
  const here = state.army.provinceId;
  const canonNow = selected ? canonOwnersAt(state.year)[selected.id] : null;
  const liveSeat = selected ? holderSeat(state, selected.id) : null;
  const div = selected ? provinceDivergence(state, selected.id) : undefined;
  const yours = liveSeat === playerSeatId(state);
  const hosts = useMemo(() => state.foreign.map((f) => ({ realm: f, host: deriveHost(state, f) })), [state]);

  function colorOf(ownerId: string) {
    if (ownerId === state.realm.id) return REALM_COLOR.player;
    return state.foreign.find((f) => f.id === ownerId)?.color ?? REALM_COLOR[ownerId] ?? "#c6a15a";
  }

  function tone(ownerId: string, value: number): string {
    if (layer === "siyasi") return colorOf(ownerId);
    const t = Math.max(0, Math.min(1, value / 100));
    const hot = layer === "isyan";
    const r = hot ? Math.round(90 + t * 130) : Math.round(48 + t * 150);
    const g = hot ? Math.round(70 - t * 30) : Math.round(40 + t * 100);
    const b = hot ? 42 : Math.round(36 + (1 - t) * 24);
    return `rgb(${r},${g},${b})`;
  }

  function layerValue(p: (typeof state.provinces)[number]): number {
    const pop = state.governance?.population?.[p.id] ?? p.manpower * 18;
    if (layer === "ekonomi") return Math.min(100, p.taxBase / 4);
    if (layer === "sadakat") return p.loyalty;
    if (layer === "nufus") return Math.min(100, pop / 3500);
    if (layer === "ordu") return Math.min(100, p.manpower / 70);
    if (layer === "diplomasi") {
      if (p.ownerId === state.realm.id) return 70;
      const rel = state.relations.find((r) => r.realmId === p.ownerId);
      return ((rel?.value ?? 0) + 100) / 2;
    }
    if (layer === "uretim") return Math.min(100, (p.agriculture + p.production) / 2);
    return p.unrest;
  }

  function pinchDistance(): number {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      pinch.current = pinchDistance();
      drag.current = null;
      return;
    }
    if ((e.target as HTMLElement).closest("button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current > 0) {
      const d = pinchDistance();
      if (d > 0) {
        const ratio = d / pinch.current;
        setZoom((z) => Math.max(1, Math.min(2.8, Math.round(z * ratio * 100) / 100)));
        pinch.current = d;
      }
      return;
    }
    if (!drag.current) return;
    setPan({
      x: drag.current.px + (e.clientX - drag.current.x),
      y: drag.current.py + (e.clientY - drag.current.y),
    });
  }
  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    pinch.current = 0;
    drag.current = null;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_16rem]">
      <div>
        <div
          className="relative touch-none overflow-hidden rounded-lg bg-marble"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={(e) => {
            e.preventDefault();
            setZoom((z) => Math.max(1, Math.min(2.8, Math.round((z + (e.deltaY < 0 ? 0.12 : -0.12)) * 100) / 100)));
          }}
        >
          <div
            className="origin-center"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <img
              src="/art/world-map.jpg"
              alt=""
              draggable={false}
              className="aspect-video w-full select-none object-cover"
              crossOrigin="anonymous"
            />
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              {state.provinces.flatMap((p) =>
                p.neighbors
                  .filter((n) => n > p.id)
                  .map((n) => {
                    const o = state.provinces.find((x) => x.id === n);
                    if (!o) return null;
                    const same = p.ownerId === o.ownerId;
                    return (
                      <line
                        key={`${p.id}-${n}`}
                        x1={p.x}
                        y1={p.y}
                        x2={o.x}
                        y2={o.y}
                        stroke={same ? colorOf(p.ownerId) : "rgba(244,236,216,0.28)"}
                        strokeWidth={same ? 0.55 : 0.28}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  }),
              )}
            </svg>
            {state.provinces.map((p) => {
              const mine = p.ownerId === state.realm.id;
              const active = sel === p.id;
              const onRoute = route.has(p.id);
              const armyHere = here === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  title={t(p.nameKey)}
                  aria-label={t(p.nameKey)}
                  onClick={() => {
                    setSel(p.id);
                    onSelect?.(p.id);
                  }}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                >
                  <span
                    className={cn(
                      "relative block size-3 rounded-full ring-2 ring-ink/80 after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2",
                      onRoute && "ring-gilt",
                      armyHere && "scale-150",
                      active && "scale-125 ring-ivory",
                    )}
                    style={{ background: active || armyHere ? "#f4ecd8" : tone(p.ownerId, layerValue(p)) }}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="min-h-11 min-w-11 rounded-md bg-raised px-3 text-ivory ring-1 ring-line" onClick={() => setZoom((z) => Math.min(2.4, Math.round((z + 0.2) * 10) / 10))}>
            {t("harita.zoomIn")}
          </button>
          <button type="button" className="min-h-11 min-w-11 rounded-md bg-raised px-3 text-ivory ring-1 ring-line" onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.2) * 10) / 10))}>
            {t("harita.zoomOut")}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md bg-raised px-3 text-ivory ring-1 ring-line"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            {t("harita.reset")}
          </button>
          <div className="flex max-w-full gap-1 overflow-x-auto">
            {LAYERS.map((id) => (
              <button
                key={id}
                type="button"
                className={cn("min-h-11 shrink-0 rounded-md px-2 text-xs ring-1 ring-line", layer === id ? "bg-ink text-gilt" : "bg-raised text-silk")}
                onClick={() => setLayer(id)}
              >
                {t(`harita.layer.${id}`)}
              </button>
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem] text-silk">
            <li className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full" style={{ background: REALM_COLOR.player }} />
              {state.realm.name}
            </li>
            {state.foreign.slice(0, 6).map((f) => (
              <li key={f.id} className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full" style={{ background: colorOf(f.id) }} />
                {f.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {selected && (
        <aside className="rounded-lg bg-raised p-4">
          <p className="font-display text-xl text-ivory">{t(selected.nameKey)}</p>
          <dl className="mt-3 space-y-1.5 text-sm text-silk">
            <div className="flex justify-between gap-2">
              <dt>{t("harita.owner")}</dt>
              <dd className="text-ivory">{ownerName(selected.ownerId)}</dd>
            </div>
            {canonNow && (
              <div className="flex justify-between gap-2">
                <dt>{t("tarih.canonOwner")}</dt>
                <dd className="text-ivory">{seatLabel(state, canonNow)}</dd>
              </div>
            )}
            {liveSeat && (
              <div className="flex justify-between gap-2">
                <dt>{t("tarih.yourOwner")}</dt>
                <dd className="text-ivory">{yours ? t("tarih.badge.yours") : seatLabel(state, liveSeat)}</dd>
              </div>
            )}
            {div && (
              <div className="flex justify-between gap-2">
                <dt>{t("tarih.compare")}</dt>
                <dd className="text-gilt">{t(`tarih.div.${div.kind}`)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt>{t("ordu.terrain")}</dt>
              <dd className="text-ivory">{t(`terrain.${terrainOf(selected)}`)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t("ordu.weather")}</dt>
              <dd className="text-ivory">{t(`weather.${weatherOf(state.year, selected)}`)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t("harita.loyalty")}</dt>
              <dd className="tabular-nums text-ivory">{selected.loyalty}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t("harita.dev")}</dt>
              <dd className="tabular-nums text-ivory">{selected.development}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t("harita.fort")}</dt>
              <dd className="tabular-nums text-ivory">{selected.fort}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t("harita.population")}</dt>
              <dd className="tabular-nums text-ivory">{state.governance?.population?.[selected.id] ?? selected.manpower * 18}</dd>
            </div>
            {state.siege?.provinceId === selected.id && (
              <>
                <div className="flex justify-between gap-2">
                  <dt>{t("siege.walls")}</dt>
                  <dd className="tabular-nums text-ivory">{Math.round(state.siege.defense.walls)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t("siege.gates")}</dt>
                  <dd className="tabular-nums text-ivory">{Math.round(state.siege.defense.gates)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t("siege.garrison")}</dt>
                  <dd className="tabular-nums text-ivory">{Math.round(state.siege.defense.garrison)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t("siege.provisions")}</dt>
                  <dd className="tabular-nums text-ivory">{Math.round(state.siege.defense.provisions)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t("siege.morale")}</dt>
                  <dd className="tabular-nums text-ivory">{Math.round(state.siege.defense.morale)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between gap-2">
              <dt>{t("hazine.tax")}</dt>
              <dd className="tabular-nums text-ivory">{selected.taxBase}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t("people.prosperity")}</dt>
              <dd className="tabular-nums text-ivory">{Math.round(selected.prosperity)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t("hazine.unrest")}</dt>
              <dd className="tabular-nums text-ivory">{Math.round(selected.unrest)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t("budget.in.agriculture")}</dt>
              <dd className="tabular-nums text-ivory">{Math.round(selected.agriculture)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t("budget.in.trade")}</dt>
              <dd className="tabular-nums text-ivory">{Math.round(selected.trade)}</dd>
            </div>
          </dl>
          {selected.ownerId !== state.realm.id && (
            <p className="mt-3 text-xs text-silk">
              {hosts.find((h) => h.realm.id === selected.ownerId)
                ? `${t("harita.host")} ${Math.round((hosts.find((h) => h.realm.id === selected.ownerId)?.host.men ?? 0) / 100) * 100}`
                : ""}
            </p>
          )}
        </aside>
      )}
    </div>
  );
}
