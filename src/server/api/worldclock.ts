import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  MS_PER_YEAR,
  SWEEP_BATCH,
  WORLD_ID,
  type GameState,
  type WorldNotice,
} from "@/domains/types";
import { migrateState } from "@/domains/palace/migrate";
import { catchUpTo } from "@/domains/worldclock/catchup";
import { ensureWorldClock, fillWorldClock } from "@/domains/worldclock/model";
import { yearsDue } from "@/domains/worldclock/time";
import { makeJob } from "@/domains/worldclock/jobs";
import { afterCampaignMutation } from "@/server/api/diplomacy";
import { assertNotBanned } from "@/server/security/guard";
import { userHasLiveMatch, tickDueMatches } from "@/server/api/battle";

type Sql = Awaited<ReturnType<typeof getSql>>;

export type PulseResult = {
  state: GameState | null;
  years: number;
  halted: boolean;
  reason: GameState["world"]["pauseReason"];
  now: number;
  msPerYear: number;
  yearsDue: number;
  swept: number;
};

async function loadClock(sql: Sql): Promise<{ epochMs: number; msPerYear: number }> {
  const rows = await sql<{ epoch_ms: number; ms_per_year: number }>`
    select epoch_ms, ms_per_year from world_clock where world_id = ${WORLD_ID} limit 1
  `;
  let epoch = Number(rows[0]?.epoch_ms ?? 0);
  let ms = Number(rows[0]?.ms_per_year ?? MS_PER_YEAR);
  if (!rows[0] || epoch <= 0) {
    epoch = Date.now();
    ms = ms >= 1000 ? ms : MS_PER_YEAR;
    await sql`
      insert into world_clock (world_id, epoch_ms, ms_per_year, last_sweep_at)
      values (${WORLD_ID}, ${epoch}, ${ms}, now())
      on conflict (world_id) do update set
        epoch_ms = case when world_clock.epoch_ms = 0 then excluded.epoch_ms else world_clock.epoch_ms end,
        ms_per_year = excluded.ms_per_year
    `;
  }
  return { epochMs: epoch, msPerYear: ms >= 1000 ? ms : MS_PER_YEAR };
}

function parseState(raw: unknown): GameState {
  const value = typeof raw === "string" ? (JSON.parse(raw) as GameState) : (raw as GameState);
  return ensureWorldClock(migrateState(value));
}

async function persistNotices(sql: Sql, userId: string, campaignId: string, notices: WorldNotice[]): Promise<void> {
  for (const n of notices.slice(0, 12)) {
    if (n.read) continue;
    await sql`
      insert into world_notices (id, user_id, campaign_id, kind, severity, title_key, body_key, vars, year, created_at)
      values (
        ${n.id}, ${userId}, ${campaignId}, ${n.kind}, ${n.severity}, ${n.titleKey}, ${n.bodyKey},
        ${JSON.stringify(n.vars ?? {})}::jsonb, ${n.year}, now()
      )
      on conflict (id) do nothing
    `;
  }
}

async function scheduleNextTick(sql: Sql, args: { campaignId: string; userId: string; lastSimAt: number; msPerYear: number }): Promise<void> {
  await sql`
    update world_jobs set status = ${"done"}
    where campaign_id = ${args.campaignId} and kind = ${"year_tick"} and status = ${"queued"}
  `;
  const job = makeJob({
    kind: "year_tick",
    dueAt: args.lastSimAt + args.msPerYear,
    campaignId: args.campaignId,
    userId: args.userId,
  });
  await sql`
    insert into world_jobs (id, world_id, campaign_id, user_id, kind, due_at, payload, status)
    values (
      ${job.id}, ${WORLD_ID}, ${args.campaignId}, ${args.userId}, ${job.kind},
      ${new Date(job.dueAt).toISOString()}::timestamptz, ${JSON.stringify(job.payload)}::jsonb, ${"queued"}
    )
  `;
}

async function saveCaught(sql: Sql, args: {
  campaignId: string;
  userId: string;
  state: GameState;
}): Promise<GameState> {
  const synced = await afterCampaignMutation(sql, {
    userId: args.userId,
    campaignId: args.campaignId,
    action: { type: "ADVANCE_YEAR" },
    state: args.state,
  });
  const world = fillWorldClock(synced.world, synced.world.lastSimAt);
  const status = synced.succession ? "succession" : "active";
  await sql`
    update campaigns
    set state = ${JSON.stringify(synced)}::jsonb,
        ruler_name = ${synced.ruler.givenName},
        realm_name = ${synced.realm.name},
        year = ${synced.year},
        status = ${status},
        last_sim_at = ${new Date(world.lastSimAt).toISOString()}::timestamptz,
        paused = ${world.paused},
        pause_reason = ${world.pauseReason},
        updated_at = now()
    where id = ${args.campaignId}
  `;
  await persistNotices(sql, args.userId, args.campaignId, world.notices);
  await scheduleNextTick(sql, {
    campaignId: args.campaignId,
    userId: args.userId,
    lastSimAt: world.lastSimAt,
    msPerYear: world.msPerYear,
  });
  return synced;
}

export async function catchUpCampaign(
  sql: Sql,
  args: { campaignId: string; userId: string; state: GameState; now?: number; msPerYear?: number },
): Promise<{ state: GameState; years: number; halted: boolean; reason: GameState["world"]["pauseReason"] }> {
  const clock = await loadClock(sql);
  const now = args.now ?? Date.now();
  const ms = args.msPerYear ?? clock.msPerYear;
  let state = ensureWorldClock(args.state);
  state = { ...state, world: { ...state.world, msPerYear: ms } };
  if (await userHasLiveMatch(sql, args.userId)) {
    return { state, years: 0, halted: true, reason: "duel" };
  }
  if (yearsDue(state, now, ms) <= 0 && !state.world.paused) {
    return { state, years: 0, halted: false, reason: null };
  }
  const result = catchUpTo(state, now, ms);
  if (result.years === 0 && result.state.world.paused === state.world.paused && result.state.year === state.year) {
    return { state: result.state, years: 0, halted: result.halted, reason: result.reason };
  }
  const saved = await saveCaught(sql, {
    campaignId: args.campaignId,
    userId: args.userId,
    state: result.state,
  });
  return { state: saved, years: result.years, halted: result.halted, reason: result.reason };
}

async function sweepDue(sql: Sql, now: number, msPerYear: number, skipUserId: string): Promise<number> {
  const lock = await sql<{ last_sweep_at: string }>`
    select last_sweep_at::text as last_sweep_at from world_clock where world_id = ${WORLD_ID}
  `;
  const last = lock[0]?.last_sweep_at ? Date.parse(lock[0].last_sweep_at) : 0;
  if (now - last < 8_000) return 0;
  await sql`update world_clock set last_sweep_at = now() where world_id = ${WORLD_ID}`;

  const cutoff = new Date(now - msPerYear).toISOString();
  const rows = await sql<{ id: string; user_id: string; state: GameState }>`
    select id, user_id, state from campaigns
    where status = ${"active"}
      and paused = false
      and user_id <> ${skipUserId}
      and last_sim_at < ${cutoff}::timestamptz
    order by last_sim_at asc
    limit ${SWEEP_BATCH}
  `;
  let n = 0;
  for (const row of rows) {
    try {
      const current = parseState(row.state);
      const pace = current.governance?.speed === "hizli" ? Math.round(msPerYear / 2) : msPerYear;
      const res = await catchUpCampaign(sql, {
        campaignId: row.id,
        userId: row.user_id,
        state: current,
        now,
        msPerYear: pace,
      });
      if (res.years > 0 || res.halted) n += 1;
    } catch {
      /* one frozen realm must not stall the world */
    }
  }
  return n;
}

export const pulseWorld = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PulseResult> => {
    await assertNotBanned(context.userId);
    const sql = await getSql();
    const clock = await loadClock(sql);
    const now = Date.now();
    await tickDueMatches(sql, now).catch(() => 0);
    const rows = await sql<{ id: string; state: GameState }>`
      select id, state from campaigns where user_id = ${context.userId} limit 1
    `;
    const row = rows[0];
    if (!row) {
      const swept = await sweepDue(sql, now, clock.msPerYear, context.userId);
      return {
        state: null,
        years: 0,
        halted: false,
        reason: null,
        now,
        msPerYear: clock.msPerYear,
        yearsDue: 0,
        swept,
      };
    }
    const current = parseState(row.state);
    const pace = current.governance?.speed === "hizli" ? Math.round(clock.msPerYear / 2) : clock.msPerYear;
    const caught = await catchUpCampaign(sql, {
      campaignId: row.id,
      userId: context.userId,
      state: current,
      now,
      msPerYear: pace,
    });
    const swept = await sweepDue(sql, now, clock.msPerYear, context.userId);
    return {
      state: caught.state,
      years: caught.years,
      halted: caught.halted,
      reason: caught.reason,
      now,
      msPerYear: clock.msPerYear,
      yearsDue: yearsDue(caught.state, now, clock.msPerYear),
      swept,
    };
  });

export const listWorldNotices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      kind: string;
      severity: string;
      title_key: string;
      body_key: string;
      vars: Record<string, string | number>;
      year: number;
      read_at: string | null;
      created_at: string;
    }>`
      select id, kind, severity, title_key, body_key, vars, year, read_at::text as read_at, created_at::text as created_at
      from world_notices
      where user_id = ${context.userId}
      order by created_at desc
      limit 24
    `;
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      severity: r.severity,
      titleKey: r.title_key,
      bodyKey: r.body_key,
      vars: typeof r.vars === "string" ? (JSON.parse(r.vars) as Record<string, string | number>) : (r.vars ?? {}),
      year: r.year,
      read: Boolean(r.read_at),
      createdAt: r.created_at,
    }));
  });

export const markWorldNoticeRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: String((input as { id?: string }).id ?? "") }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update world_notices set read_at = now()
      where id = ${data.id} and user_id = ${context.userId} and read_at is null
    `;
    return { ok: true };
  });

export type ClockInfo = { now: number; msPerYear: number; epochMs: number };

export const getWorldClock = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<ClockInfo> => {
    const sql = await getSql();
    const clock = await loadClock(sql);
    return { now: Date.now(), msPerYear: clock.msPerYear, epochMs: clock.epochMs };
  });

export async function catchUpOnLoad(sql: Sql, userId: string, campaignId: string, state: GameState): Promise<GameState> {
  const caught = await catchUpCampaign(sql, { campaignId, userId, state });
  return caught.state;
}
