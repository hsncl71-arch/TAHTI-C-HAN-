import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { writeAudit, takeRate } from "@/server/security/guard";

/** Apple / Google require a working in-app account deletion path. */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { confirm?: string };
    if (i?.confirm !== "SIL") throw new Error("confirm_required");
    return { confirm: "SIL" as const };
  })
  .handler(async ({ context }) => {
    await takeRate(context.userId, "dispatch");
    const sql = await getSql();
    const uid = context.userId;
    const ghost = `deleted_${uid.slice(0, 12)}`;
    await writeAudit({
      actorId: uid,
      action: "account.delete",
      scope: "players",
      targetUserId: uid,
      detail: { reason: "self_delete" },
    });
    await sql`update world_seats set kind = ${"ai"}, user_id = null, campaign_id = null, last_seen = null, claimed_at = null where user_id = ${uid}`;
    await sql`update world_invites set redeemed_by = ${ghost} where redeemed_by = ${uid}`.catch(() => undefined);
    await sql`delete from world_invites where from_user_id = ${uid}`.catch(() => undefined);
    await sql`delete from world_presence where user_id = ${uid}`;
    const openMatches = await sql<{ id: string }>`
      select id from live_matches
      where (host_user_id = ${uid} or guest_user_id = ${uid})
        and status in ('open','lobby','live','resolving')
    `.catch(() => [] as { id: string }[]);
    for (const row of openMatches) {
      await sql`
        update live_matches
        set status = ${"abandoned"}, forfeit_user_id = ${uid}, updated_at = now()
        where id = ${row.id} and status in ('open','lobby')
      `.catch(() => undefined);
      await sql`
        update live_matches
        set status = ${"forfeit"}, forfeit_user_id = ${uid}, updated_at = now()
        where id = ${row.id} and status in ('live','resolving')
      `.catch(() => undefined);
    }
    await sql`delete from world_jobs where campaign_id in (select id from campaigns where user_id = ${uid})`.catch(() => undefined);
    await sql`delete from campaigns where user_id = ${uid}`;
    await sql`delete from envoys where from_user_id = ${uid} or to_user_id = ${uid}`.catch(() => undefined);
    await sql`delete from npc_counsel where user_id = ${uid}`.catch(() => undefined);
    await sql`delete from user_blocks where user_id = ${uid} or blocked_user_id = ${uid}`.catch(() => undefined);
    await sql`delete from rate_buckets where user_id = ${uid}`.catch(() => undefined);
    await sql`delete from action_nonces where user_id = ${uid}`.catch(() => undefined);
    await sql`delete from dip_letters where from_user_id = ${uid} or to_user_id = ${uid}`.catch(() => undefined);
    await sql`delete from dip_offers where from_user_id = ${uid} or to_user_id = ${uid}`.catch(() => undefined);
    await sql`delete from dip_reports where reporter_id = ${uid}`.catch(() => undefined);
    await sql`delete from reports where reporter_id = ${uid} or target_user_id = ${uid}`.catch(() => undefined);
    await sql`delete from duel_calls where user_id = ${uid}`.catch(() => undefined);
    await sql`delete from ai_usage where user_id = ${uid}`.catch(() => undefined);
    await sql`delete from world_notices where user_id = ${uid}`.catch(() => undefined);
    await sql`delete from store_entitlements where user_id = ${uid}`.catch(() => undefined);
    await sql`delete from live_match_actions where user_id = ${uid}`.catch(() => undefined);
    await sql`delete from device_tokens where user_id = ${uid}`.catch(() => undefined);
    await sql`delete from push_outbox where user_id = ${uid}`.catch(() => undefined);
    await sql`
      update store_purchases
      set user_id = ${ghost}, payload = '{}'::jsonb
      where user_id = ${uid}
    `.catch(() => undefined);
    await sql`delete from profiles where user_id = ${uid}`;
    await sql`delete from session where "userId" = ${uid}`.catch(() => undefined);
    await sql`delete from account where "userId" = ${uid}`.catch(() => undefined);
    await sql`delete from "user" where id = ${uid}`.catch(() => undefined);
    return {
      ok: true as const,
      subscriptionNotice: "apple_google_cancel_in_store" as const,
    };
  });
