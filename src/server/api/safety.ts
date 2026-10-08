import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nid } from "@/domains/ids";
import { moderateText } from "@/domains/diplomacy/moderate";
import { assertNotBanned, takeRate } from "@/server/security/guard";

const REASONS = new Set(["abuse", "spam", "cheat", "harass", "other"]);

export const blockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { userId?: string; on?: boolean };
    const userId = String(i.userId ?? "").slice(0, 80);
    if (!userId) throw new Error("bad_id");
    return { userId, on: i.on !== false };
  })
  .handler(async ({ context, data }) => {
    if (data.userId === context.userId) throw new Error("self_block");
    await assertNotBanned(context.userId);
    const sql = await getSql();
    if (data.on) {
      await sql`
        insert into user_blocks (user_id, blocked_user_id)
        values (${context.userId}, ${data.userId})
        on conflict do nothing
      `;
    } else {
      await sql`
        delete from user_blocks
        where user_id = ${context.userId} and blocked_user_id = ${data.userId}
      `;
    }
    return { ok: true, blocked: data.on };
  });

export const listBlocks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ blocked_user_id: string; created_at: string }>`
      select blocked_user_id, created_at::text as created_at
      from user_blocks where user_id = ${context.userId}
      order by created_at desc
      limit 80
    `;
  });

export const reportUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { userId?: string; letterId?: string; reason?: string; body?: string };
    const userId = String(i.userId ?? "").slice(0, 80);
    const reason = REASONS.has(String(i.reason)) ? String(i.reason) : "abuse";
    const body = moderateText(String(i.body ?? "şikayet"), 240);
    if (!userId) throw new Error("bad_id");
    return {
      userId,
      letterId: i.letterId ? String(i.letterId).slice(0, 64) : null,
      reason,
      body: body.ok ? body.text : "şikayet",
    };
  })
  .handler(async ({ context, data }) => {
    if (data.userId === context.userId) throw new Error("self_report");
    await assertNotBanned(context.userId);
    await takeRate(context.userId, "report");
    const sql = await getSql();
    const exists = await sql<{ user_id: string }>`select user_id from profiles where user_id = ${data.userId} limit 1`;
    if (!exists[0]) throw new Error("no_target");
    if (data.letterId) {
      const letter = await sql<{ id: string; to_user_id: string; from_user_id: string }>`
        select id, to_user_id, from_user_id from dip_letters where id = ${data.letterId} limit 1
      `;
      const row = letter[0];
      if (!row || (row.to_user_id !== context.userId && row.from_user_id !== context.userId)) {
        throw new Error("forbidden");
      }
    }
    const id = nid("rep");
    await sql`
      insert into reports (id, reporter_id, target_user_id, letter_id, reason, body, status)
      values (${id}, ${context.userId}, ${data.userId}, ${data.letterId}, ${data.reason}, ${data.body}, ${"open"})
    `;
    return { ok: true, id };
  });
