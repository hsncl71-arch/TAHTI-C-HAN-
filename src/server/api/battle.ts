import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { hashSeed, nid } from "@/domains/ids";
import { TACTICS, type GameState, type TacticId } from "@/domains/types";
import { migrateState } from "@/domains/palace/migrate";
import { type LiveMatch, type MatchEvent } from "@/domains/battle/model";
import { applyMatchEvent } from "@/domains/battle/machine";
import { settleForfeit, settleLiveMatch, tacticsForSettle, winnerUserId } from "@/domains/battle/settle";
import { guardChallenge, publicMatchView, reuseActiveMatch, type PublicMatchView } from "@/domains/battle/rules";
import { meydanChallengePush } from "@/domains/notify/model";
import { afterCampaignMutation } from "@/server/api/diplomacy";
import { assertNotBanned, isBlocked, takeNonce, takeRate } from "@/server/security/guard";
import { serverDuelSeed } from "@/domains/security/authority";
import { enqueuePush } from "@/server/api/notify";

type Sql = Awaited<ReturnType<typeof getSql>>;

const TACTIC_SET = new Set<string>(TACTICS);

type MatchRow = {
  id: string;
  host_user_id: string;
  guest_user_id: string;
  host_seat: string;
  guest_seat: string;
  host_name: string;
  guest_name: string;
  province_id: string;
  status: string;
  host_ready: boolean;
  guest_ready: boolean;
  host_tactic: string | null;
  guest_tactic: string | null;
  host_connected_at: string;
  guest_connected_at: string;
  seed: number | string;
  lock_at: string | null;
  winner_user_id: string | null;
  result: string | null;
  report: unknown;
  forfeit_user_id: string | null;
  settle_key: string | null;
  created_at: string;
  updated_at: string;
};

function ts(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : 0;
}

function asTactic(raw: string | null): TacticId | null {
  return raw && TACTIC_SET.has(raw) ? (raw as TacticId) : null;
}

function fromRow(row: MatchRow): LiveMatch {
  return {
    id: row.id,
    hostUserId: row.host_user_id,
    guestUserId: row.guest_user_id,
    hostSeat: row.host_seat,
    guestSeat: row.guest_seat,
    hostName: row.host_name,
    guestName: row.guest_name,
    provinceId: row.province_id,
    status: row.status as LiveMatch["status"],
    hostReady: Boolean(row.host_ready),
    guestReady: Boolean(row.guest_ready),
    hostTactic: asTactic(row.host_tactic),
    guestTactic: asTactic(row.guest_tactic),
    hostConnectedAt: ts(row.host_connected_at),
    guestConnectedAt: ts(row.guest_connected_at),
    seed: Number(row.seed) || 1,
    lockAt: row.lock_at ? ts(row.lock_at) : null,
    winnerUserId: row.winner_user_id,
    result: (row.result as LiveMatch["result"]) ?? null,
    report: (row.report as LiveMatch["report"]) ?? null,
    forfeitUserId: row.forfeit_user_id,
    settleKey: row.settle_key,
    createdAt: ts(row.created_at),
    updatedAt: ts(row.updated_at),
  };
}

function iso(ms: number | null | undefined): string | null {
  if (!ms) return null;
  return new Date(ms).toISOString();
}

async function persistMatch(sql: Sql, match: LiveMatch): Promise<void> {
  await sql`
    update live_matches set
      status = case
        when status in ('done','forfeit','abandoned') then status
        when ${match.status} in ('done','forfeit','abandoned','resolving') then ${match.status}
        when status = 'resolving' then status
        when ${match.status} = 'live' then ${match.status}
        when status = 'live' then status
        else ${match.status}
      end,
      host_ready = host_ready or ${match.hostReady},
      guest_ready = guest_ready or ${match.guestReady},
      host_tactic = coalesce(host_tactic, ${match.hostTactic}),
      guest_tactic = coalesce(guest_tactic, ${match.guestTactic}),
      host_connected_at = case
        when ${iso(match.hostConnectedAt)}::timestamptz > host_connected_at
          then ${iso(match.hostConnectedAt)}::timestamptz
        else host_connected_at
      end,
      guest_connected_at = case
        when ${iso(match.guestConnectedAt)}::timestamptz > guest_connected_at
          then ${iso(match.guestConnectedAt)}::timestamptz
        else guest_connected_at
      end,
      lock_at = coalesce(lock_at, ${iso(match.lockAt)}::timestamptz),
      winner_user_id = coalesce(winner_user_id, ${match.winnerUserId}),
      result = coalesce(result, ${match.result}),
      report = case when report is null then ${JSON.stringify(match.report ?? null)}::jsonb else report end,
      forfeit_user_id = coalesce(forfeit_user_id, ${match.forfeitUserId}),
      settle_key = coalesce(settle_key, ${match.settleKey}),
      updated_at = now()
    where id = ${match.id}
  `;
}

async function loadMatch(sql: Sql, id: string): Promise<LiveMatch | null> {
  const rows = await sql<MatchRow>`select * from live_matches where id = ${id} limit 1`;
  return rows[0] ? fromRow(rows[0]) : null;
}

async function loadActiveFor(sql: Sql, userId: string): Promise<LiveMatch | null> {
  const rows = await sql<MatchRow>`
    select * from live_matches
    where (host_user_id = ${userId} or guest_user_id = ${userId})
      and status in ('open','lobby','live','resolving')
    order by updated_at desc
    limit 1
  `;
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function userHasLiveMatch(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ c: number }>`
    select count(*)::int as c from live_matches
    where (host_user_id = ${userId} or guest_user_id = ${userId})
      and status in ('open','lobby','live','resolving')
  `;
  return (rows[0]?.c ?? 0) > 0;
}

async function loadCampaign(sql: Sql, userId: string): Promise<{ id: string; state: GameState } | null> {
  const rows = await sql<{ id: string; state: GameState }>`
    select id, state from campaigns where user_id = ${userId} and status = ${"active"} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const raw = typeof row.state === "string" ? (JSON.parse(row.state) as GameState) : row.state;
  return { id: row.id, state: migrateState(raw) };
}

async function saveCampaign(sql: Sql, userId: string, campaignId: string, state: GameState): Promise<GameState> {
  const synced = await afterCampaignMutation(sql, {
    userId,
    campaignId,
    action: { type: "RESOLVE_DUEL", tactic: "hold_line", foeTactic: "hold_line" },
    state,
  });
  await sql`
    update campaigns
    set state = ${JSON.stringify(synced)}::jsonb,
        ruler_name = ${synced.ruler.givenName},
        realm_name = ${synced.realm.name},
        year = ${synced.year},
        updated_at = now()
    where id = ${campaignId} and user_id = ${userId}
  `;
  return synced;
}

async function recordAction(
  sql: Sql,
  matchId: string,
  userId: string,
  kind: string,
  nonce: string | null,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const seqRows = await sql<{ m: number | null }>`
    select max(seq)::int as m from live_match_actions where match_id = ${matchId} and user_id = ${userId}
  `;
  const seq = (seqRows[0]?.m ?? 0) + 1;
  try {
    await sql`
      insert into live_match_actions (id, match_id, user_id, seq, kind, nonce, payload)
      values (${nid("mact")}, ${matchId}, ${userId}, ${seq}, ${kind}, ${nonce}, ${JSON.stringify(payload)}::jsonb)
    `;
    return true;
  } catch {
    return false;
  }
}

async function applyAndMaybeSettle(
  sql: Sql,
  match: LiveMatch,
  event: MatchEvent,
): Promise<{ match: LiveMatch; error?: string }> {
  const step = applyMatchEvent(match, event);
  if (step.error) return { match, error: step.error };
  let next = step.match;
  if (step.settle) {
    const settled = await settleOnce(sql, next);
    next = settled;
  } else {
    await persistMatch(sql, next);
  }
  return { match: next };
}

async function settleOnce(sql: Sql, match: LiveMatch): Promise<LiveMatch> {
  const key = `settle_${match.id}`;
  const claimed = await sql<{ id: string }>`
    update live_matches
    set status = ${"resolving"}, settle_key = ${key}, updated_at = now()
    where id = ${match.id}
      and status in ('live','resolving','forfeit')
      and (
        settle_key is null
        or (settle_key is not null and report is null and result is null)
      )
    returning id
  `;
  if (!claimed[0]) {
    const latest = await loadMatch(sql, match.id);
    return latest ?? match;
  }

  const hostCamp = await loadCampaign(sql, match.hostUserId);
  const guestCamp = await loadCampaign(sql, match.guestUserId);
  if (!hostCamp || !guestCamp) {
    const abandoned: LiveMatch = { ...match, status: "abandoned", settleKey: key, updatedAt: Date.now() };
    await persistMatch(sql, abandoned);
    return abandoned;
  }

  const tacs = tacticsForSettle(match, hostCamp.state, guestCamp.state);
  const pair =
    match.status === "forfeit" || match.forfeitUserId
      ? settleForfeit(hostCamp.state, guestCamp.state, match)
      : settleLiveMatch(hostCamp.state, guestCamp.state, {
          hostTactic: tacs.host,
          guestTactic: tacs.guest,
          seed: match.seed || serverDuelSeed(hostCamp.state.seed, hostCamp.state.year, match.id),
          provinceId: match.provinceId,
        });

  await saveCampaign(sql, match.hostUserId, hostCamp.id, pair.host);
  await saveCampaign(sql, match.guestUserId, guestCamp.id, pair.guest);

  const done: LiveMatch = {
    ...match,
    status: match.forfeitUserId ? "forfeit" : "done",
    result: pair.report.result,
    report: pair.report,
    winnerUserId: winnerUserId(match, pair.report),
    settleKey: key,
    updatedAt: Date.now(),
  };
  await persistMatch(sql, done);
  return done;
}

function publicMatch(match: LiveMatch, userId: string): PublicMatchView {
  return publicMatchView(match, userId);
}

export type PublicMatch = PublicMatchView;

export async function tickMatch(sql: Sql, match: LiveMatch, now = Date.now()): Promise<LiveMatch> {
  if ((match.status === "forfeit" || match.status === "resolving") && !match.report) {
    return settleOnce(sql, match);
  }
  const step = applyMatchEvent(match, { type: "tick", now });
  if (step.error) return match;
  if (step.settle) return settleOnce(sql, step.match);
  if (step.match.status !== match.status || step.match.hostConnectedAt !== match.hostConnectedAt) {
    await persistMatch(sql, step.match);
  }
  return step.match;
}

export const listLiveMatches = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await assertNotBanned(context.userId);
    const sql = await getSql();
    const active = await loadActiveFor(sql, context.userId);
    if (active) {
      const ticked = await tickMatch(sql, active);
      return { match: publicMatch(ticked, context.userId), iceNote: null as string | null };
    }
    const recent = await sql<MatchRow>`
      select * from live_matches
      where host_user_id = ${context.userId} or guest_user_id = ${context.userId}
      order by updated_at desc
      limit 1
    `;
    const last = recent[0] ? fromRow(recent[0]) : null;
    return { match: last ? publicMatch(last, context.userId) : null, iceNote: null as string | null };
  });

async function notifyChallenge(sql: Sql, match: LiveMatch): Promise<void> {
  const noticeId = nid("ntc");
  await sql`
    insert into world_notices (id, user_id, campaign_id, kind, severity, title_key, body_key, vars, year, created_at)
    values (
      ${noticeId}, ${match.guestUserId}, null, ${"crisis"}, ${"warn"},
      ${"push.meydan.title"}, ${"push.meydan.body"},
      ${JSON.stringify({ name: match.hostName, matchId: match.id })}::jsonb,
      ${0}, now()
    )
  `.catch(() => undefined);
  await enqueuePush(sql, match.guestUserId, meydanChallengePush(match.hostName, match.id));
}

export const challengePlayer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { opponentUserId?: string; provinceId?: string };
    const opponentUserId = String(i?.opponentUserId ?? "").slice(0, 80);
    const provinceId = String(i?.provinceId ?? "").slice(0, 40);
    if (!opponentUserId) throw new Error("bad_opponent");
    return { opponentUserId, provinceId };
  })
  .handler(async ({ context, data }) => {
    await assertNotBanned(context.userId);
    await takeRate(context.userId, "dispatch");
    const sql = await getSql();
    const blocked = await isBlocked(sql, context.userId, data.opponentUserId);
    const existing = await loadActiveFor(sql, context.userId);
    const same = reuseActiveMatch(existing, context.userId, data.opponentUserId);
    if (same) return { match: publicMatch(same, context.userId) };
    const otherBusy = await userHasLiveMatch(sql, data.opponentUserId);
    const gate = guardChallenge({
      selfId: context.userId,
      opponentId: data.opponentUserId,
      blocked,
      selfBusy: Boolean(existing),
      opponentBusy: otherBusy,
    });
    if (!gate.ok) throw new Error(gate.error === "self_busy" ? "opponent_busy" : gate.error);

    const host = await loadCampaign(sql, context.userId);
    const guest = await loadCampaign(sql, data.opponentUserId);
    if (!host || !guest) throw new Error("no_campaign");
    const provinceId = data.provinceId || host.state.army.provinceId || host.state.realm.capitalId;
    const id = nid("match");
    const seed = serverDuelSeed(host.state.seed, host.state.year, id) || hashSeed(id) || 1;
    const now = new Date().toISOString();
    try {
      await sql`
        insert into live_matches (
          id, host_user_id, guest_user_id, host_seat, guest_seat, host_name, guest_name,
          province_id, status, seed, host_connected_at, guest_connected_at
        ) values (
          ${id}, ${context.userId}, ${data.opponentUserId},
          ${host.state.diplomacy.seatId}, ${guest.state.diplomacy.seatId},
          ${host.state.ruler.givenName}, ${guest.state.ruler.givenName},
          ${provinceId}, ${"open"}, ${seed}, ${now}::timestamptz, ${now}::timestamptz
        )
      `;
    } catch {
      const raced = await loadActiveFor(sql, context.userId);
      if (raced) return { match: publicMatch(raced, context.userId) };
      throw new Error("opponent_busy");
    }
    const match = await loadMatch(sql, id);
    if (!match) throw new Error("match_failed");
    await notifyChallenge(sql, match);
    return { match: publicMatch(match, context.userId) };
  });

function parseId(input: unknown): { matchId: string; tactic?: TacticId; nonce?: string } {
  const i = input as { matchId?: string; tactic?: string; nonce?: string };
  const matchId = String(i?.matchId ?? "").slice(0, 64);
  if (!matchId) throw new Error("bad_match");
  const tactic = i?.tactic && TACTIC_SET.has(i.tactic) ? (i.tactic as TacticId) : undefined;
  const nonce = typeof i?.nonce === "string" ? i.nonce.slice(0, 64) : undefined;
  return { matchId, tactic, nonce };
}

async function memberStep(
  userId: string,
  matchId: string,
  event: MatchEvent,
  nonce?: string,
): Promise<{ match: PublicMatch }> {
  await assertNotBanned(userId);
  if (event.type !== "heartbeat") await takeRate(userId, "hot");
  if (nonce) await takeNonce(userId, nonce);
  const sql = await getSql();
  const match = await loadMatch(sql, matchId);
  if (!match) throw new Error("no_match");
  if (match.hostUserId !== userId && match.guestUserId !== userId) throw new Error("not_member");
  const ticked = await tickMatch(sql, match);
  if (event.type !== "tick") {
    const recorded = await recordAction(sql, matchId, userId, event.type, nonce ?? null, event as unknown as Record<string, unknown>);
    if (!recorded && nonce) throw new Error("replay");
    const applied = await applyAndMaybeSettle(sql, ticked, event);
    if (applied.error) throw new Error(applied.error);
    return { match: publicMatch(applied.match, userId) };
  }
  return { match: publicMatch(ticked, userId) };
}

export const acceptMatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseId(input))
  .handler(async ({ context, data }) => memberStep(context.userId, data.matchId, { type: "accept", userId: context.userId, now: Date.now() }));

export const declineMatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseId(input))
  .handler(async ({ context, data }) => memberStep(context.userId, data.matchId, { type: "decline", userId: context.userId, now: Date.now() }));

export const readyMatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseId(input))
  .handler(async ({ context, data }) => memberStep(context.userId, data.matchId, { type: "ready", userId: context.userId, now: Date.now() }));

export const submitMatchTactic = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const parsed = parseId(input);
    if (!parsed.tactic) throw new Error("bad_tactic");
    if (!parsed.nonce) throw new Error("nonce_required");
    return parsed as { matchId: string; tactic: TacticId; nonce: string };
  })
  .handler(async ({ context, data }) =>
    memberStep(
      context.userId,
      data.matchId,
      { type: "tactic", userId: context.userId, tactic: data.tactic, nonce: data.nonce, now: Date.now() },
      data.nonce,
    ),
  );

export const heartbeatMatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseId(input))
  .handler(async ({ context, data }) =>
    memberStep(context.userId, data.matchId, { type: "heartbeat", userId: context.userId, now: Date.now() }),
  );

export const forfeitMatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseId(input))
  .handler(async ({ context, data }) =>
    memberStep(context.userId, data.matchId, { type: "forfeit", userId: context.userId, now: Date.now() }, data.nonce),
  );

export const pollMatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseId(input ?? {}))
  .handler(async ({ context, data }) => {
    await assertNotBanned(context.userId);
    const sql = await getSql();
    const match = data.matchId ? await loadMatch(sql, data.matchId) : await loadActiveFor(sql, context.userId);
    if (!match) return { match: null as PublicMatch | null };
    if (match.hostUserId !== context.userId && match.guestUserId !== context.userId) throw new Error("not_member");
    const ticked = await tickMatch(sql, match);
    if (ticked.status === "live" || ticked.status === "lobby") {
      await applyAndMaybeSettle(sql, ticked, { type: "heartbeat", userId: context.userId, now: Date.now() });
      const latest = await loadMatch(sql, ticked.id);
      return { match: latest ? publicMatch(latest, context.userId) : publicMatch(ticked, context.userId) };
    }
    return { match: publicMatch(ticked, context.userId) };
  });

export async function tickDueMatches(sql: Sql, now = Date.now()): Promise<number> {
  const rows = await sql<MatchRow>`
    select * from live_matches
    where status in ('open','lobby','live','resolving','forfeit')
      and (result is null)
    order by updated_at
    limit 24
  `.catch(() => [] as MatchRow[]);
  let n = 0;
  for (const row of rows) {
    await tickMatch(sql, fromRow(row), now);
    n += 1;
  }
  return n;
}
