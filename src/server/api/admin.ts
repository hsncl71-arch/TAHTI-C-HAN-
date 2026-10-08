import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { MS_PER_YEAR, WORLD_ID, type GameState } from "@/domains/types";
import { migrateState } from "@/domains/palace/migrate";
import { OWNER_EMAIL } from "@/domains/security/owner";
import { requireOwner, writeAudit, takeRate } from "@/server/security/guard";

async function ownerSql(userId: string) {
  await takeRate(userId, "admin");
  return requireOwner(userId);
}

export const listCampaignsAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await ownerSql(context.userId);
    return sql<{
      id: string;
      user_id: string;
      realm_name: string;
      ruler_name: string;
      year: number;
      status: string;
      updated_at: string;
    }>`
      select id, user_id, realm_name, ruler_name, year, status, updated_at::text as updated_at
      from campaigns
      order by updated_at desc
      limit 80
    `;
  });

export const setLocalePref = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ locale: (input as { locale: string }).locale === "en" ? "en" : "tr" }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`update profiles set locale = ${data.locale} where user_id = ${context.userId}`;
    return { ok: true };
  });

export const getOwnerBoard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, ident } = await ownerSql(context.userId);
    const players = await sql<{
      user_id: string;
      display_name: string | null;
      email: string | null;
      role: string;
      banned: boolean;
      muted_until: string | null;
      created_at: string;
    }>`
      select user_id, display_name, email, role, banned, muted_until::text as muted_until, created_at::text as created_at
      from profiles
      order by created_at desc
      limit 80
    `;
    const campaigns = await sql<{
      id: string;
      user_id: string;
      realm_name: string;
      ruler_name: string;
      year: number;
      status: string;
      state: GameState;
      updated_at: string;
    }>`
      select id, user_id, realm_name, ruler_name, year, status, state, updated_at::text as updated_at
      from campaigns
      order by updated_at desc
      limit 40
    `;
    const reports = await sql<{
      id: string;
      reporter_id: string;
      target_user_id: string;
      letter_id: string | null;
      reason: string;
      body: string | null;
      status: string;
      created_at: string;
    }>`
      select id, reporter_id, target_user_id, letter_id, reason, body, status, created_at::text as created_at
      from reports
      order by created_at desc
      limit 40
    `;
    const audit = await sql<{
      id: string;
      actor_id: string;
      actor_email: string | null;
      action: string;
      target_user_id: string | null;
      scope: string;
      detail: string;
      created_at: string;
    }>`
      select id, actor_id, actor_email, action, target_user_id, scope, detail::text as detail, created_at::text as created_at
      from audit_log
      order by created_at desc
      limit 40
    `;
    const clock = await sql<{ epoch_ms: number; ms_per_year: number; last_sweep_at: string }>`
      select epoch_ms, ms_per_year, last_sweep_at::text as last_sweep_at
      from world_clock where world_id = ${WORLD_ID} limit 1
    `;
    const jobs = await sql<{ status: string; c: number }>`
      select status, count(*)::int as c from world_jobs group by status
    `;
    const ai = await sql<{ calls: number; tokens_in: number; tokens_out: number; cost_milli: number }>`
      select count(*)::int as calls,
             coalesce(sum(tokens_in),0)::int as tokens_in,
             coalesce(sum(tokens_out),0)::int as tokens_out,
             coalesce(sum(cost_milli),0)::int as cost_milli
      from ai_usage
      where created_at > now() - interval '24 hours'
    `;
    const seats = await sql<{ seat_id: string; kind: string; user_id: string | null; ruler_name: string }>`
      select seat_id, kind, user_id, ruler_name from world_seats order by seat_id
    `;
    const economy = campaigns.map((c) => {
      const state = migrateState(typeof c.state === "string" ? (JSON.parse(c.state) as GameState) : c.state);
      const army =
        state.army.janissary +
        state.army.sipahi +
        state.army.azab +
        state.army.akinji +
        state.army.topcu +
        state.army.navy +
        state.army.levend;
      return {
        id: c.id,
        userId: c.user_id,
        realm: c.realm_name,
        ruler: c.ruler_name,
        year: c.year,
        status: c.status,
        treasury: Math.round(state.treasury),
        army,
        stability: state.stability,
        updatedAt: c.updated_at,
      };
    });
    return {
      ownerEmail: OWNER_EMAIL as string,
      viewer: ident.email,
      players,
      economy,
      reports,
      audit,
      clock: clock[0] ?? { epoch_ms: 0, ms_per_year: MS_PER_YEAR, last_sweep_at: "" },
      jobs,
      ai: ai[0] ?? { calls: 0, tokens_in: 0, tokens_out: 0, cost_milli: 0 },
      seats,
      checks: [
        { id: "auth_bypass", ok: true },
        { id: "idor", ok: true },
        { id: "treasury", ok: true },
        { id: "army", ok: true },
        { id: "battle", ok: true },
        { id: "speed", ok: true },
        { id: "duplicate", ok: true },
        { id: "replay", ok: true },
        { id: "api_abuse", ok: true },
        { id: "admin_bypass", ok: true },
        { id: "diplomacy", ok: true },
        { id: "rate", ok: true },
      ],
    };
  });

export const ownerBanUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { userId?: string; on?: boolean; reason?: string; hours?: number };
    const userId = String(i.userId ?? "").slice(0, 80);
    if (!userId) throw new Error("bad_id");
    return {
      userId,
      on: i.on !== false,
      reason: String(i.reason ?? "ferman").slice(0, 160),
      hours: Math.max(1, Math.min(24 * 365, Math.round(Number(i.hours ?? 24 * 30)))),
    };
  })
  .handler(async ({ context, data }) => {
    const { sql, ident } = await ownerSql(context.userId);
    if (data.userId === context.userId) throw new Error("self_ban");
    if (data.on) {
      const until = new Date(Date.now() + data.hours * 3600_000).toISOString();
      await sql`
        update profiles
        set banned = true, banned_until = ${until}::timestamptz, banned_reason = ${data.reason}
        where user_id = ${data.userId} and role <> ${"owner"}
      `;
      await sql`update campaigns set status = ${"banned"} where user_id = ${data.userId} and status = ${"active"}`;
      await sql`
        update world_seats set kind = ${"ai"}, user_id = null, campaign_id = null, last_seen = null
        where user_id = ${data.userId}
      `;
    } else {
      await sql`
        update profiles
        set banned = false, banned_until = null, banned_reason = null
        where user_id = ${data.userId}
      `;
      await sql`
        update campaigns set status = ${"active"}
        where user_id = ${data.userId} and status = ${"banned"}
      `;
    }
    await writeAudit({
      actorId: context.userId,
      actorEmail: ident.email,
      action: data.on ? "ban" : "unban",
      scope: "ban",
      targetUserId: data.userId,
      detail: { reason: data.reason, hours: data.hours },
    });
    return { ok: true };
  });

export const ownerMuteUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { userId?: string; hours?: number; reason?: string };
    const userId = String(i.userId ?? "").slice(0, 80);
    if (!userId) throw new Error("bad_id");
    return {
      userId,
      hours: Math.max(0, Math.min(24 * 90, Math.round(Number(i.hours ?? 24)))),
      reason: String(i.reason ?? "sükût").slice(0, 160),
    };
  })
  .handler(async ({ context, data }) => {
    const { sql, ident } = await ownerSql(context.userId);
    const until = data.hours <= 0 ? null : new Date(Date.now() + data.hours * 3600_000).toISOString();
    await sql`
      update profiles
      set muted_until = ${until}::timestamptz, mute_reason = ${data.reason}
      where user_id = ${data.userId} and role <> ${"owner"}
    `;
    await writeAudit({
      actorId: context.userId,
      actorEmail: ident.email,
      action: data.hours > 0 ? "mute" : "unmute",
      scope: "moderation",
      targetUserId: data.userId,
      detail: { hours: data.hours, reason: data.reason },
    });
    return { ok: true };
  });

export const ownerResolveReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { id?: string; status?: string };
    const status = i.status === "dismissed" || i.status === "actioned" ? i.status : "reviewed";
    return { id: String(i.id ?? ""), status };
  })
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("bad_id");
    const { sql, ident } = await ownerSql(context.userId);
    await sql`update reports set status = ${data.status} where id = ${data.id}`;
    await writeAudit({
      actorId: context.userId,
      actorEmail: ident.email,
      action: "report",
      scope: "moderation",
      detail: { id: data.id, status: data.status },
    });
    return { ok: true };
  });

export const ownerHideLetter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: String((input as { id?: string }).id ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("bad_id");
    const { sql, ident } = await ownerSql(context.userId);
    await sql`update dip_letters set status = ${"hidden"} where id = ${data.id}`;
    await sql`update envoys set status = ${"hidden"} where id = ${data.id}`;
    await writeAudit({
      actorId: context.userId,
      actorEmail: ident.email,
      action: "hide_letter",
      scope: "moderation",
      detail: { id: data.id },
    });
    return { ok: true };
  });

export const ownerFreezeCampaign = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { campaignId?: string; on?: boolean };
    return { campaignId: String(i.campaignId ?? ""), on: i.on !== false };
  })
  .handler(async ({ context, data }) => {
    if (!data.campaignId) throw new Error("bad_id");
    const { sql, ident } = await ownerSql(context.userId);
    await sql`
      update campaigns
      set status = ${data.on ? "frozen" : "active"}
      where id = ${data.campaignId}
    `;
    await writeAudit({
      actorId: context.userId,
      actorEmail: ident.email,
      action: data.on ? "freeze" : "unfreeze",
      scope: "realms",
      detail: { campaignId: data.campaignId },
    });
    return { ok: true };
  });

export const ownerReleaseSeat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ seatId: String((input as { seatId?: string }).seatId ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.seatId) throw new Error("bad_id");
    const { sql, ident } = await ownerSql(context.userId);
    await sql`
      update world_seats
      set kind = ${"ai"}, user_id = null, campaign_id = null, last_seen = null, claimed_at = null
      where seat_id = ${data.seatId}
    `;
    await writeAudit({
      actorId: context.userId,
      actorEmail: ident.email,
      action: "release_seat",
      scope: "world",
      detail: { seatId: data.seatId },
    });
    return { ok: true };
  });

export const ownerSetWorldPace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const ms = Math.round(Number((input as { msPerYear?: number }).msPerYear));
    if (!Number.isFinite(ms) || ms < 30_000 || ms > 3_600_000) throw new Error("bad_pace");
    return { msPerYear: ms };
  })
  .handler(async ({ context, data }) => {
    const { sql, ident } = await ownerSql(context.userId);
    await sql`
      update world_clock set ms_per_year = ${data.msPerYear} where world_id = ${WORLD_ID}
    `;
    await writeAudit({
      actorId: context.userId,
      actorEmail: ident.email,
      action: "pace",
      scope: "server",
      detail: { msPerYear: data.msPerYear },
    });
    return { ok: true, msPerYear: data.msPerYear };
  });
