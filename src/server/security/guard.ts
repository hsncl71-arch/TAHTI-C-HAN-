import { getSql, type Sql } from "@/lib/db";
import { nid } from "@/domains/ids";
import { isOwnerEmail, roleForEmail, type AuditScope, type StaffRole } from "@/domains/security/owner";
import { allowRate, nextCount, RATE_CAPS, windowStart, type RateBucket } from "@/domains/security/rate";
import { isNonceShape } from "@/domains/security/replay";

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class BannedError extends Error {
  readonly status = 403;
  readonly reason: string;
  constructor(reason = "") {
    super("banned");
    this.name = "BannedError";
    this.reason = reason;
  }
}

export class MutedError extends Error {
  readonly status = 429;
  constructor() {
    super("muted");
    this.name = "MutedError";
  }
}

export type SessionIdentity = {
  userId: string;
  email: string | null;
  role: StaffRole;
  isOwner: boolean;
};

export type GateFlags = {
  banned: boolean;
  banReason: string | null;
  muted: boolean;
  role: StaffRole;
  isOwner: boolean;
  email: string | null;
};

async function sessionEmailFor(userId: string): Promise<string | null> {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const session = await getSessionUser();
  if (session?.id === userId && session.email) return session.email;
  const sql = await getSql();
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `.catch(() => [] as { email: string | null }[]);
  return rows[0]?.email ?? null;
}

export async function resolveIdentity(userId: string): Promise<SessionIdentity> {
  const email = await sessionEmailFor(userId);
  const role = roleForEmail(email);
  return { userId, email, role, isOwner: role === "owner" };
}

export async function bootstrapProfile(
  sql: Sql,
  userId: string,
  displayName: string | null,
  email: string | null,
): Promise<StaffRole> {
  const owner = isOwnerEmail(email);
  const role: StaffRole = owner ? "owner" : "player";
  if (owner) {
    await sql`
      update profiles
      set is_admin = false, role = 'player'
      where (is_admin = true or role = 'owner')
        and user_id <> ${userId}
    `;
  }
  await sql`
    insert into profiles (user_id, display_name, email, role, is_admin)
    values (${userId}, ${displayName}, ${email}, ${role}, ${owner})
    on conflict (user_id) do update set
      display_name = coalesce(excluded.display_name, profiles.display_name),
      email = coalesce(excluded.email, profiles.email),
      role = ${role},
      is_admin = ${owner}
  `;
  return role;
}

export async function ensureSecureProfile(userId: string, displayName: string | null): Promise<SessionIdentity> {
  const ident = await resolveIdentity(userId);
  const sql = await getSql();
  await bootstrapProfile(sql, userId, displayName, ident.email);
  return ident;
}

export async function readGate(userId: string): Promise<GateFlags> {
  const ident = await ensureSecureProfile(userId, null);
  const sql = await getSql();
  const rows = await sql<{
    banned: boolean;
    banned_until: string | null;
    banned_reason: string | null;
    muted_until: string | null;
    role: string;
  }>`
    select banned, banned_until::text as banned_until, banned_reason, muted_until::text as muted_until, role
    from profiles where user_id = ${userId} limit 1
  `;
  const row = rows[0];
  const until = row?.banned_until ? Date.parse(row.banned_until) : 0;
  const banned = Boolean(row?.banned) && (!until || until > Date.now());
  const mutedUntil = row?.muted_until ? Date.parse(row.muted_until) : 0;
  return {
    banned: ident.isOwner ? false : banned,
    banReason: row?.banned_reason ?? null,
    muted: ident.isOwner ? false : mutedUntil > Date.now(),
    role: ident.role,
    isOwner: ident.isOwner,
    email: ident.email,
  };
}

export async function assertNotBanned(userId: string): Promise<GateFlags> {
  const gate = await readGate(userId);
  if (gate.banned) throw new BannedError(gate.banReason ?? "");
  return gate;
}

export async function assertNotMuted(userId: string): Promise<void> {
  const gate = await readGate(userId);
  if (gate.muted) throw new MutedError();
}

export async function requireOwner(userId: string): Promise<{ sql: Sql; ident: SessionIdentity }> {
  const ident = await ensureSecureProfile(userId, null);
  if (!ident.isOwner) throw new ForbiddenError("forbidden");
  const sql = await getSql();
  const rows = await sql<{ role: string }>`select role from profiles where user_id = ${userId} limit 1`;
  if (rows[0]?.role !== "owner") throw new ForbiddenError("forbidden");
  return { sql, ident };
}

export async function writeAudit(args: {
  actorId: string;
  actorEmail?: string | null;
  action: string;
  scope: AuditScope;
  targetUserId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into audit_log (id, actor_id, actor_email, action, target_user_id, scope, detail)
    values (
      ${nid("aud")}, ${args.actorId}, ${args.actorEmail ?? null}, ${args.action},
      ${args.targetUserId ?? null}, ${args.scope}, ${JSON.stringify(args.detail ?? {})}::jsonb
    )
  `;
}

export async function takeRate(userId: string, bucket: RateBucket): Promise<void> {
  const spec = RATE_CAPS[bucket];
  const start = new Date(windowStart(Date.now(), spec.windowMs)).toISOString();
  const sql = await getSql();
  await sql`
    insert into rate_buckets (user_id, bucket, window_start, count)
    values (${userId}, ${bucket}, ${start}::timestamptz, 1)
    on conflict (user_id, bucket, window_start)
    do update set count = rate_buckets.count + 1
  `;
  const rows = await sql<{ count: number }>`
    select count from rate_buckets
    where user_id = ${userId} and bucket = ${bucket} and window_start = ${start}::timestamptz
  `;
  const count = Number(rows[0]?.count ?? 1);
  if (!allowRate(count - 1, spec.cap)) throw new Error("rate_limited");
  void nextCount;
}

export async function takeNonce(userId: string, nonce: string | null | undefined): Promise<void> {
  if (!nonce) return;
  if (!isNonceShape(nonce)) throw new Error("bad_nonce");
  const sql = await getSql();
  try {
    await sql`insert into action_nonces (user_id, nonce) values (${userId}, ${nonce})`;
  } catch {
    throw new Error("replay");
  }
  await sql`delete from action_nonces where created_at < now() - interval '24 hours'`.catch(() => undefined);
}

export async function isBlocked(sql: Sql, userId: string, otherId: string): Promise<boolean> {
  const rows = await sql<{ c: number }>`
    select count(*)::int as c from user_blocks
    where (user_id = ${userId} and blocked_user_id = ${otherId})
       or (user_id = ${otherId} and blocked_user_id = ${userId})
  `;
  return (rows[0]?.c ?? 0) > 0;
}

export async function recordAiUsage(args: {
  userId: string;
  model: string;
  prompt: string;
  answer: string;
}): Promise<void> {
  const tokensIn = Math.max(1, Math.ceil(args.prompt.length / 4));
  const tokensOut = Math.max(1, Math.ceil(args.answer.length / 4));
  const costMilli = tokensIn * 3 + tokensOut * 15;
  const sql = await getSql();
  await sql`
    insert into ai_usage (user_id, model, tokens_in, tokens_out, cost_milli)
    values (${args.userId}, ${args.model}, ${tokensIn}, ${tokensOut}, ${costMilli})
  `;
}

export async function rememberDuelCall(args: {
  duelId: string;
  userId: string;
  peerId: string;
  tactic: string | null;
}): Promise<string | null> {
  const sql = await getSql();
  await sql`
    insert into duel_calls (duel_id, user_id, peer_id, tactic)
    values (${args.duelId}, ${args.userId}, ${args.peerId}, ${args.tactic})
    on conflict (duel_id, user_id) do update set
      tactic = coalesce(excluded.tactic, duel_calls.tactic),
      peer_id = excluded.peer_id
  `;
  const peer = await sql<{ tactic: string | null }>`
    select tactic from duel_calls
    where duel_id = ${args.duelId} and user_id <> ${args.userId} and tactic is not null
    limit 1
  `;
  return peer[0]?.tactic ?? null;
}
