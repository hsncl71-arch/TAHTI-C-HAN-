import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ornament";
import { PortraitActor } from "@/components/game/PortraitActor";
import { akce } from "@/components/game/format";
import { cn } from "@/lib/cn";
import { agendaByKey } from "@/domains/divan/agenda";
import { sitting, vacantPosts } from "@/domains/divan/offices";
import { unemployed } from "@/domains/divan/statesmen";
import { CrisisPulse } from "@/components/game/CrisisPulse";
import type { CourtPost, DivanItem, GameAction, GameState, Npc } from "@/domains/types";

export function DivanView({
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
  const [sel, setSel] = useState<string | null>(null);
  const seated = sitting(state);
  const selected = state.npcs.find((n) => n.id === sel) ?? seated[0]?.npc ?? state.npcs.find((n) => n.alive);
  const agenda = state.divan?.agenda ?? [];
  const session = Boolean(state.divan?.sessionOpen && agenda.length);
  const held = state.lastDivanYear === state.year;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
      <div className="grid gap-4">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gilt">{t("divan.kiosk")}</p>
              <h2 className="font-display text-3xl">{t("divan.title")}</h2>
              <p className="mt-1 text-sm text-silk">{t("divan.lead")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="gilt"
                disabled={busy || (held && !session)}
                onClick={() => act({ type: "HOLD_DIVAN" })}
              >
                {held && !session ? t("saray.held") : t("saray.hold")}
              </Button>
              {session && (
                <Button variant="ghost" disabled={busy} onClick={() => act({ type: "CLOSE_DIVAN" })}>
                  {t("divan.close")}
                </Button>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-silk">
            {t("divan.sitting", { count: seated.length })} · {t("divan.minutes", { count: state.divan?.minutes.length ?? 0 })}
          </p>
        </Panel>

        {session ? (
          agenda.map((item) => (
            <AgendaCard key={item.id} item={item} state={state} t={t} busy={busy} act={act} />
          ))
        ) : (
          <Panel>
          <p className="text-sm text-silk">{held ? t("divan.idleHeld") : t("divan.idle")}</p>
        </Panel>
        )}

        <CrisisPulse state={state} t={t} />

        {(state.divan?.minutes.length ?? 0) > 0 && (
          <Panel>
            <h3 className="font-display text-xl">{t("divan.record")}</h3>
            <ol className="mt-3 space-y-2 text-sm">
              {state.divan.minutes.slice(0, 8).map((m) => (
                <li key={m.id} className="flex justify-between gap-3 border-l border-gilt/40 pl-3">
                  <span>
                    {m.year} · {t(m.titleKey)} · {t(`topic.${m.topic}`)}
                    {m.deferred ? ` · ${t("divan.deferred")}` : ""}
                  </span>
                  <span className="text-silk">{m.choiceId}</span>
                </li>
              ))}
            </ol>
          </Panel>
        )}
      </div>

      <div className="grid gap-3">
        {seated.map(({ post, npc }) => (
          <button
            key={post.id}
            type="button"
            onClick={() => setSel(npc.id)}
            className={cn(
              "rounded-xl bg-panel/90 p-3 text-left shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gilt)_28%,transparent)]",
              sel === npc.id && "shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gilt)_70%,transparent)]",
            )}
          >
            <PostRow post={post} npc={npc} state={state} t={t} />
          </button>
        ))}
        {vacantPosts(state).map((post) => (
          <Panel key={post.id} className="opacity-80">
            <p className="text-xs uppercase tracking-wider text-gilt">{postLabel(post, t)}</p>
            <p className="mt-1 text-sm text-silk">{t("divan.vacant")}</p>
            <AppointSelect state={state} post={post} t={t} busy={busy} act={act} />
          </Panel>
        ))}
        {selected && (
          <StatesmanDossier
            npc={selected}
            state={state}
            t={t}
            busy={busy}
            act={act}
          />
        )}
      </div>
    </div>
  );
}

function postLabel(post: CourtPost, t: (k: string, v?: Record<string, string | number>) => string): string {
  const base = t(`office.${post.office}`);
  if (post.regionId) return `${base} · ${t(`region.${post.regionId}`)}`;
  if (post.seat) return `${base} ${post.seat}`;
  return base;
}

function PostRow({
  post,
  npc,
  state,
  t,
}: {
  post: CourtPost;
  npc: Npc;
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const tenure = state.year - npc.tenureStart;
  return (
    <div className="flex gap-3">
      <div className="w-14 shrink-0">
        <PortraitActor portrait={npc.portrait} name={npc.name} age={state.year - npc.birthYear} compact />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[0.65rem] uppercase tracking-wider text-gilt">{postLabel(post, t)}</p>
        <p className="font-display text-xl leading-tight">{npc.name}</p>
        <p className="text-xs text-silk">
          {t("divan.tenure", { n: tenure })} · {t(`origin.${npc.origin}`)}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Meter label={t("divan.loyalty")} value={npc.loyalty} />
          <Meter label={t("divan.skill")} value={npc.competence} />
          <Meter label={t("divan.influence")} value={npc.influence} tone="warn" />
          <Meter label={t("divan.favor")} value={npc.favor} />
        </div>
      </div>
    </div>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex justify-between text-[0.65rem] uppercase tracking-wider text-silk">
        <span>{label}</span>
        <span className="tabular-nums text-ivory">{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink">
        <div
          className={cn("h-full rounded-full", tone === "warn" && value > 78 ? "bg-crimson" : "bg-gilt")}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function AgendaCard({
  item,
  state,
  t,
  busy,
  act,
}: {
  item: DivanItem;
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  busy: boolean;
  act: (a: GameAction) => void;
}) {
  const def = agendaByKey(item.key);
  const proposer = state.npcs.find((n) => n.id === item.proposedBy);
  const vars = useMemo(() => formatPayload(item, state, t), [item, state, t]);
  const sup = item.votes.filter((v) => v.stance === "support").length;
  const opp = item.votes.filter((v) => v.stance === "oppose").length;
  const cau = item.votes.filter((v) => v.stance === "caution").length;

  return (
    <Panel>
      <p className="text-xs uppercase tracking-wider text-gilt">{t(`topic.${item.topic}`)}</p>
      <h3 className="mt-1 font-display text-2xl">{t(item.titleKey, vars)}</h3>
      <p className="mt-2 text-sm text-silk">{t(item.bodyKey, vars)}</p>
      {proposer && (
        <p className="mt-2 text-xs text-gilt">
          {t("divan.proposed", { name: proposer.name })}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-silk">
        <span>{t("divan.vote.support")} {sup}</span>
        <span>{t("divan.vote.caution")} {cau}</span>
        <span>{t("divan.vote.oppose")} {opp}</span>
      </div>
      <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-xs text-silk">
        {item.votes.map((v) => {
          const n = state.npcs.find((x) => x.id === v.npcId);
          if (!n) return null;
          return (
            <li key={v.npcId} className="flex justify-between gap-2">
              <span>{n.name}</span>
              <span className="text-ivory">{t(`divan.vote.${v.stance}`)}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {def?.choices.map((c, i) => (
          <Button
            key={c.id}
            variant={i === 0 ? "primary" : "ghost"}
            disabled={busy}
            onClick={() => act({ type: "RESOLVE_DIVAN", itemId: item.id, choiceId: c.id })}
          >
            {t(c.labelKey, vars)}
          </Button>
        ))}
      </div>
    </Panel>
  );
}

function formatPayload(
  item: DivanItem,
  state: GameState,
  t: (k: string, v?: Record<string, string | number>) => string,
): Record<string, string | number> {
  const vars: Record<string, string | number> = { ...item.payload };
  if (typeof vars.prov === "string" && vars.prov.startsWith("prov.")) vars.prov = t(String(vars.prov));
  if (typeof vars.realm === "string") {
    vars.realm = state.foreign.find((r) => r.id === vars.realm)?.name ?? vars.realm;
  }
  return vars;
}

function AppointSelect({
  state,
  post,
  t,
  busy,
  act,
}: {
  state: GameState;
  post: CourtPost;
  t: (k: string) => string;
  busy: boolean;
  act: (a: GameAction) => void;
}) {
  const pool = [...unemployed(state), ...sitting(state).map((x) => x.npc).filter((n) => n.id !== post.npcId)];
  const unique = Array.from(new Map(pool.map((n) => [n.id, n])).values());
  return (
    <label className="mt-2 block text-xs text-silk">
      {t("divan.appoint")}
      <select
        className="mt-1 w-full rounded-md bg-ink/60 p-2 text-sm text-ivory ring-1 ring-line"
        disabled={busy}
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          act({ type: "APPOINT", office: post.office, npcId: e.target.value, postId: post.id });
        }}
      >
        <option value="">{t("divan.choose")}</option>
        {unique.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name} · {t(`office.${n.office}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatesmanDossier({
  npc,
  state,
  t,
  busy,
  act,
}: {
  npc: Npc;
  state: GameState;
  t: (k: string, v?: Record<string, string | number>) => string;
  busy: boolean;
  act: (a: GameAction) => void;
}) {
  const post = state.court.find((p) => p.npcId === npc.id);
  const rivalNames = npc.rivals.map((id) => state.npcs.find((n) => n.id === id)?.name).filter(Boolean);
  const allyNames = npc.allies.map((id) => state.npcs.find((n) => n.id === id)?.name).filter(Boolean);
  return (
    <Panel>
      <p className="text-xs uppercase tracking-wider text-gilt">{t("divan.dossier")}</p>
      <h3 className="font-display text-2xl">{npc.name}</h3>
      <p className="text-sm text-silk">
        {t(`office.${npc.office}`)} · {t(`faction.${npc.faction}`)} · {t(`origin.${npc.origin}`)}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-silk">{t("divan.wealth")}</dt>
          <dd className="tabular-nums">{akce(npc.wealth)}</dd>
        </div>
        <div>
          <dt className="text-silk">{t("divan.ambition")}</dt>
          <dd className="tabular-nums">{Math.round(npc.ambition)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-silk">
        {t("divan.rivals")}: {rivalNames.length ? rivalNames.join(", ") : t("divan.none")}
      </p>
      <p className="mt-1 text-xs text-silk">
        {t("divan.allies")}: {allyNames.length ? allyNames.join(", ") : t("divan.none")}
      </p>
      {post && (
        <div className="mt-4 grid gap-2">
          <AppointSelect state={state} post={post} t={t} busy={busy} act={act} />
          <Button variant="crimson" disabled={busy} onClick={() => act({ type: "DISMISS", postId: post.id })}>
            {t("divan.dismiss")}
          </Button>
        </div>
      )}
    </Panel>
  );
}
