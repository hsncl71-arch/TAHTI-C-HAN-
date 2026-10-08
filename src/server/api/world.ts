import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nid } from "@/domains/ids";
import { canRateLimit, moderateText } from "@/domains/diplomacy/moderate";
import { assertNotBanned, assertNotMuted, isBlocked, takeRate } from "@/server/security/guard";

export type Presence = {
  userId: string;
  rulerName: string;
  realmName: string;
  year: number;
  lastSeen: string;
};

export type Envoy = {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromRuler: string;
  fromRealm: string;
  kind: string;
  body: string;
  year: number;
  status: string;
  createdAt: string;
};

export const listPresence = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      user_id: string;
      ruler_name: string;
      realm_name: string;
      year: number;
      last_seen: string;
    }>`
      select user_id, ruler_name, realm_name, year, last_seen::text as last_seen
      from world_presence
      where last_seen > now() - interval '7 days'
      order by last_seen desc
      limit 24
    `;
    return rows.map((r) => ({
      userId: r.user_id,
      rulerName: r.ruler_name,
      realmName: r.realm_name,
      year: r.year,
      lastSeen: r.last_seen,
      isSelf: r.user_id === context.userId,
    }));
  });

export const listEnvoys = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      from_user_id: string;
      to_user_id: string;
      from_ruler: string;
      from_realm: string;
      kind: string;
      body: string;
      year: number;
      status: string;
      created_at: string;
    }>`
      select id, from_user_id, to_user_id, from_ruler, from_realm, kind, body, year, status, created_at::text as created_at
      from envoys
      where to_user_id = ${context.userId} or from_user_id = ${context.userId}
      order by created_at desc
      limit 40
    `;
    return rows.map((r) => ({
      id: r.id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      fromRuler: r.from_ruler,
      fromRealm: r.from_realm,
      kind: r.kind,
      body: r.body,
      year: r.year,
      status: r.status,
      createdAt: r.created_at,
    }));
  });

export const sendEnvoy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { toUserId: string; body: string; kind?: string };
    const toUserId = String(i?.toUserId ?? "").slice(0, 80);
    const body = String(i?.body ?? "").trim().slice(0, 500);
    const kind = String(i?.kind ?? "letter").slice(0, 24);
    if (!toUserId || body.length < 2) throw new Error("invalid_envoy");
    return { toUserId, body, kind };
  })
  .handler(async ({ context, data }) => {
    if (data.toUserId === context.userId) throw new Error("self_envoy");
    await assertNotBanned(context.userId);
    await assertNotMuted(context.userId);
    await takeRate(context.userId, "letter");
    const moderated = moderateText(data.body, 400);
    if (!moderated.ok) throw new Error(`moderation_${moderated.reason}`);
    const sql = await getSql();
    if (await isBlocked(sql, context.userId, data.toUserId)) throw new Error("blocked");
    const recent = await sql<{ c: number }>`
      select count(*)::int as c from envoys
      where from_user_id = ${context.userId} and created_at > now() - interval '1 hour'
    `;
    if (!canRateLimit(recent[0]?.c ?? 0, 8)) throw new Error("rate_limited");
    const me = await sql<{ ruler_name: string; realm_name: string; year: number }>`
      select ruler_name, realm_name, year from campaigns where user_id = ${context.userId} limit 1
    `;
    if (!me[0]) throw new Error("no_campaign");
    const target = await sql<{ user_id: string }>`select user_id from campaigns where user_id = ${data.toUserId} limit 1`;
    if (!target[0]) throw new Error("no_target");
    const id = nid("env");
    await sql`
      insert into envoys (id, from_user_id, to_user_id, from_ruler, from_realm, kind, body, year, status)
      values (${id}, ${context.userId}, ${data.toUserId}, ${me[0].ruler_name}, ${me[0].realm_name}, ${data.kind}, ${moderated.text}, ${me[0].year}, ${"unread"})
    `;
    return { id };
  });

export const markEnvoyRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: String((input as { id: string }).id ?? "") }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`update envoys set status = ${"read"} where id = ${data.id} and to_user_id = ${context.userId}`;
    return { ok: true };
  });
