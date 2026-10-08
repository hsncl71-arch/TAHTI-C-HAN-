import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import { akce } from "@/components/game/format";
import { useLiveMesh } from "@/components/game/DuelOverlay";
import { cn } from "@/lib/cn";
import {
  DOCTRINES,
  TROOP_KINDS,
  type DoctrineId,
  type GameAction,
  type GameState,
  type TroopKind,
} from "@/domains/types";
import { commanderLabel, eligibleCommanders, marchTargets } from "@/domains/military/campaign";
import { hostPower } from "@/domains/military/combat";
import { shortestPath } from "@/domains/military/path";
import { terrainOf, weatherOf } from "@/domains/military/terrain";
import { yearlyForecast } from "@/domains/world/engine";
import { SiegeView } from "@/components/game/SiegeView";

const RAISE: Record<TroopKind, number> = {
  janissary: 500,
  sipahi: 500,
  azab: 500,
  akinji: 500,
  topcu: 5,
  navy: 5,
  levend: 400,
};

function Meter({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-[0.65rem] uppercase tracking-wider text-silk">
        <span>{label}</span>
        <span className="tabular-nums text-ivory">{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink">
        <div
          className={cn("h-full rounded-full", warn && value < 35 ? "bg-crimson" : "bg-gilt")}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function OrduView({
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
  const mesh = useLiveMesh();
  const targets = marchTargets(state);
  const f = yearlyForecast(state);
  const [target, setTarget] = useState(() => targets.find((p) => p.ownerId !== state.realm.id)?.id ?? targets[0]?.id ?? "");
  const dest = state.provinces.find((p) => p.id === target);
  const from = state.army.provinceId || state.realm.capitalId;
  const route = dest ? shortestPath(state.provinces, from, dest.id) : null;
  const here = state.provinces.find((p) => p.id === from) ?? state.provinces[0];
  const terrain = here ? terrainOf(here) : "plain";
  const weather = here ? weatherOf(state.year, here) : "fair";
  const power = hostPower(state, state.army, {
    terrain,
    weather,
    tactic: state.military.liveOrders,
    siege: state.army.status === "siege",
  });
  const commanders = useMemo(() => eligibleCommanders(state), [state]);
  const last = state.military.battles[0];
  const lastProv = last ? state.provinces.find((p) => p.id === last.provinceId) : undefined;
  const foeId = dest && dest.ownerId !== state.realm.id ? dest.ownerId : state.relations.find((r) => r.treaty === "war")?.realmId;
  const marching = state.army.status === "campaign" || state.army.status === "siege";
  const siege = state.campaign?.phase === "siege";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {state.siege && !state.siege.cinema && <SiegeView state={state} t={t} act={act} busy={busy} />}
      <Panel>
        <h2 className="font-display text-2xl">{t("ordu.title")}</h2>
        <p className="mt-1 text-sm text-silk">
          {t("ordu.power")} {akce(f.power)} · {t(`army.status.${state.army.status}`)}
          {" · "}
          {t("ordu.commander")}: {commanderLabel(state)}
          {" · "}
          {t("hazine.campaignCost")} {akce(f.campaignCost)}
        </p>
        <ul className="mt-4 space-y-2">
          {TROOP_KINDS.map((kind) => (
            <li key={kind} className="flex items-center justify-between gap-2 rounded-md bg-raised px-3 py-2">
              <span>
                {t(`troop.${kind}`)} · <span className="tabular-nums">{akce(state.army[kind])}</span>
              </span>
              <span className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || marching}
                  onClick={() => act({ type: "RAISE_TROOPS", kind, count: RAISE[kind] })}
                >
                  {t("ordu.raise")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || marching}
                  onClick={() => act({ type: "DISBAND", kind, count: RAISE[kind] })}
                >
                  {t("ordu.disband")}
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Meter label={t("ordu.morale")} value={state.army.morale} warn />
          <Meter label={t("ordu.drill")} value={state.army.drill} />
          <Meter label={t("ordu.experience")} value={state.army.experience} />
          <Meter label={t("ordu.supply")} value={state.army.supply} warn />
          <Meter label={t("ordu.pay")} value={state.army.pay} warn />
        </div>
        <p className="mt-3 text-xs text-silk">
          {t("ordu.terrain")}: {t(`terrain.${terrain}`)} · {t("ordu.weather")}: {t(`weather.${weather}`)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || marching} onClick={() => act({ type: "DRILL_HOST" })}>
            {t("ordu.train")}
          </Button>
          <Button size="sm" variant="gilt" disabled={busy} onClick={() => act({ type: "PAY_ULUFE" })}>
            {t("ordu.ulufe")}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy || Boolean(state.military.pendingDuel)} onClick={() => mesh?.drillAi()}>
            {t("ordu.talim")}
          </Button>
        </div>
      </Panel>

      <Panel>
        <h3 className="font-display text-xl">{t("ordu.commander")}</h3>
        <div className="mt-2 flex flex-wrap gap-1">
          {commanders.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={
                (c.kind === "npc" && state.army.commanderNpcId === c.id) ||
                (c.kind === "member" && state.army.commanderMemberId === c.id)
                  ? "gilt"
                  : "ghost"
              }
              disabled={busy || marching}
              onClick={() =>
                act(c.kind === "npc" ? { type: "SET_COMMANDER", npcId: c.id } : { type: "SET_COMMANDER", memberId: c.id })
              }
            >
              {c.name} · {c.score}
            </Button>
          ))}
        </div>

        <h3 className="mt-4 font-display text-xl">{t("ordu.doctrine")}</h3>
        <p className="mt-1 text-xs text-silk">{t("ordu.doctrineLead")}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {DOCTRINES.map((d: DoctrineId) => (
            <Button
              key={d}
              size="sm"
              variant={state.military.doctrine === d ? "gilt" : "ghost"}
              disabled={busy}
              onClick={() => act({ type: "SET_DOCTRINE", doctrine: d })}
            >
              {t(`doctrine.${d}`)}
            </Button>
          ))}
        </div>

        <label className="mt-4 block text-sm text-silk">
          {t("ordu.march")}
          <select
            className="mt-1 w-full rounded-md bg-ink/60 p-2 text-ivory ring-1 ring-line"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {targets.map((p) => (
              <option key={p.id} value={p.id}>
                {t(p.nameKey)} {p.ownerId === state.realm.id ? "" : "·"} · {t(`terrain.${terrainOf(p)}`)}
              </option>
            ))}
          </select>
        </label>
        {route && route.length > 1 && (
          <p className="mt-2 text-xs text-silk">
            {t("ordu.route")}: {route.map((id) => t(state.provinces.find((p) => p.id === id)?.nameKey ?? id)).join(" → ")}
            {dest ? ` · ${t("ordu.weather")}: ${t(`weather.${weatherOf(state.year, dest)}`)}` : ""}
          </p>
        )}
        {state.campaign && (
          <p className="mt-2 text-sm text-gilt">
            {t(`phase.${state.campaign.phase}`)} · {t("ordu.progress", { n: state.campaign.progress })}
            {siege ? ` · ${t("ordu.siege")}: ${Math.round(state.campaign.siegeProgress)}` : ""}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="crimson"
            disabled={busy || !target || marching || !dest || dest.ownerId === state.realm.id}
            onClick={() => act({ type: "LAUNCH_CAMPAIGN", provinceId: target })}
          >
            {t("harita.attack")}
          </Button>
          <Button disabled={busy || !target || marching} onClick={() => act({ type: "LAUNCH_CAMPAIGN", provinceId: target })}>
            {t("ordu.march")}
          </Button>
          <Button variant="ghost" disabled={busy || !state.campaign} onClick={() => act({ type: "RECALL_ARMY" })}>
            {t("ordu.retreat")}
          </Button>
          <Button variant="crimson" disabled={busy || !siege} onClick={() => act({ type: "STORM_FORT" })}>
            {t("ordu.storm")}
          </Button>
          <Button
            variant="gilt"
            disabled={busy || !foeId}
            onClick={() => foeId && act({ type: "OFFER_PEACE", realmId: foeId })}
          >
            {t("ordu.peace")}
          </Button>
        </div>

        {last && (
          <div className="mt-4 rounded-md bg-raised p-3 text-sm">
            <p className="text-[0.65rem] uppercase tracking-wider text-silk">{t("ordu.lastBattle")}</p>
            <p className="mt-1 text-ivory">
              {last.year} · {lastProv ? t(lastProv.nameKey) : last.provinceId} · {t(`result.${last.result}`)}
            </p>
            <p className="text-xs text-silk">
              {t(`tactic.${last.tacticAtk}`)} / {t(`tactic.${last.tacticDef}`)} · {akce(last.atkPower)} / {akce(last.defPower)}
            </p>
          </div>
        )}
        <p className="mt-3 text-xs text-silk">
          {t("ordu.factors")}: {power.factors.map((k) => t(k)).join(" · ")}
        </p>
      </Panel>
    </div>
  );
}
