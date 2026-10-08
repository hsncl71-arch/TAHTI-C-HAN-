import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nid } from "@/domains/ids";
import { deliverPush } from "@/domains/notify/transport";
import {
  isPushPlatform,
  sanitizeToken,
  type PushKind,
  type PushPayload,
  type PushPlatform,
} from "@/domains/notify/model";
import { assertNotBanned, takeRate } from "@/server/security/guard";

type Sql = Awaited<ReturnType<typeof getSql>>;

export async function enqueuePush(
  sql: Sql,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const id = nid("push");
  await sql`
    insert into push_outbox (id, user_id, kind, title_key, body_key, vars, route, status)
    values (
      ${id}, ${userId}, ${payload.kind}, ${payload.titleKey}, ${payload.bodyKey},
      ${JSON.stringify(payload.vars)}::jsonb, ${payload.route}, ${"queued"}
    )
  `.catch(() => undefined);
}

export async function flushPushForUser(sql: Sql, userId: string): Promise<number> {
  const rows = await sql<{
    id: string;
    kind: string;
    title_key: string;
    body_key: string;
    vars: Record<string, string | number>;
    route: string;
  }>`
    select id, kind, title_key, body_key, vars, route
    from push_outbox
    where user_id = ${userId} and status = ${"queued"}
    order by created_at
    limit 8
  `.catch(() => []);
  if (!rows.length) return 0;
  const tokens = await sql<{ id: string; platform: string; token: string }>`
    select id, platform, token from device_tokens where user_id = ${userId}
  `.catch(() => []);
  let flushed = 0;
  for (const row of rows) {
    const payload: PushPayload = {
      kind: row.kind as PushKind,
      titleKey: row.title_key,
      bodyKey: row.body_key,
      vars: row.vars ?? {},
      route: row.route,
    };
    let anyOk = false;
    let last = "no_device";
    for (const tok of tokens) {
      if (!isPushPlatform(tok.platform)) continue;
      const result = await deliverPush(
        { id: tok.id, userId, platform: tok.platform, token: tok.token, locale: "tr" },
        payload,
      );
      if (result.ok) anyOk = true;
      else last = result.reason;
      if (!result.ok && (result.reason === "apns_gone" || result.reason === "fcm_gone")) {
        await sql`delete from device_tokens where id = ${tok.id}`.catch(() => undefined);
      }
    }
    if (anyOk) {
      await sql`update push_outbox set status = ${"sent"}, sent_at = now(), attempts = attempts + 1 where id = ${row.id}`.catch(
        () => undefined,
      );
      flushed += 1;
    } else {
      await sql`
        update push_outbox
        set attempts = attempts + 1, last_error = ${last},
            status = case when attempts + 1 >= 20 then ${"failed"} else ${"queued"} end
        where id = ${row.id}
      `.catch(() => undefined);
    }
  }
  return flushed;
}

export const registerDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { token?: string; platform?: string; locale?: string };
    const token = sanitizeToken(String(i?.token ?? ""));
    const platform = String(i?.platform ?? "");
    if (!token) throw new Error("bad_token");
    if (!isPushPlatform(platform)) throw new Error("bad_platform");
    return { token, platform: platform as PushPlatform, locale: String(i?.locale ?? "tr").slice(0, 8) };
  })
  .handler(async ({ context, data }) => {
    await assertNotBanned(context.userId);
    await takeRate(context.userId, "hot");
    const sql = await getSql();
    const id = nid("dev");
    await sql`
      insert into device_tokens (id, user_id, platform, token, locale, last_seen)
      values (${id}, ${context.userId}, ${data.platform}, ${data.token}, ${data.locale}, now())
      on conflict (user_id, token) do update set last_seen = now(), platform = excluded.platform, locale = excluded.locale
    `;
    await flushPushForUser(sql, context.userId);
    return { ok: true as const };
  });

export const unregisterDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const token = sanitizeToken(String((input as { token?: string })?.token ?? ""));
    return { token };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (data.token) {
      await sql`delete from device_tokens where user_id = ${context.userId} and token = ${data.token}`;
    } else {
      await sql`delete from device_tokens where user_id = ${context.userId}`;
    }
    return { ok: true as const };
  });

export const getAuthFlags = createServerFn({ method: "GET" }).handler(async () => {
  const apple = Boolean(process.env.APPLE_CLIENT_ID?.trim() && process.env.APPLE_CLIENT_SECRET?.trim());
  const apns = Boolean(process.env.APNS_KEY_ID?.trim() && process.env.APNS_TEAM_ID?.trim() && process.env.APNS_PRIVATE_KEY?.trim());
  const fcm = Boolean(process.env.FCM_SERVER_KEY?.trim() || process.env.FIREBASE_SERVICE_ACCOUNT?.trim());
  const turn = Boolean(process.env.TURN_URLS?.trim() && (process.env.TURN_SECRET?.trim() || (process.env.TURN_USERNAME?.trim() && process.env.TURN_CREDENTIAL?.trim())));
  return { apple, apns, fcm, turn };
});
