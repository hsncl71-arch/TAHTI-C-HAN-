import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { applyAction, type GameAction, type GameState } from "@/domains/index";
import { createInitialState } from "@/domains/world/seed";
import { migrateState } from "@/domains/palace/migrate";
import { nid } from "@/domains/ids";
import type { CreateRulerInput, Locale, TacticId } from "@/domains/types";
import { TACTICS } from "@/domains/types";
import { SEAT_CATALOG } from "@/domains/map/provinces";
import { afterCampaignMutation, claimWorldSeat, ensureWorld, hydrateCampaignWorld } from "@/server/api/diplomacy";
import { catchUpOnLoad } from "@/server/api/worldclock";
import { readWallet } from "@/server/api/commerce";
import { canEquip } from "@/domains/commerce/entitlements";
import { isCosmeticSlot } from "@/domains/commerce/model";
import { parseGameAction, HOT_ACTIONS } from "@/domains/security/actions";
import { actionFingerprint, replayTooSoon } from "@/domains/security/replay";
import {
  armySpikeIllegal,
  authorizeAction,
  canAdvanceYear,
  hostHeadcount,
  treasuryDeltaIllegal,
} from "@/domains/security/authority";
import { assertNotBanned, ensureSecureProfile, readGate, rememberDuelCall, takeNonce, takeRate } from "@/server/security/guard";
import { userHasLiveMatch } from "@/server/api/battle";
import { writeReignCheckpoint } from "@/server/api/slots";

const TRAITS = new Set(["adalet", "cesaret", "ilim", "siyaset", "comertlik", "zahid"]);
const FOCUSES = new Set(["fatih", "kanuni", "hunkar"]);
const PORTRAITS = new Set(["sultan-a", "sultan-b", "sultan-c"]);
const TACTIC_SET = new Set<string>(TACTICS);

function parseCreate(input: unknown): CreateRulerInput {
  const i = input as CreateRulerInput;
  const givenName = String(i?.givenName ?? "").trim().slice(0, 32);
  const dynastyName = String(i?.dynastyName ?? "").trim().slice(0, 32);
  const traits = Array.isArray(i?.traits) ? i.traits.filter((t) => TRAITS.has(t)).slice(0, 3) : [];
  const focus = FOCUSES.has(i?.focus) ? i.focus : "kanuni";
  const portrait = PORTRAITS.has(i?.portrait) ? i.portrait : "sultan-a";
  const locale: Locale = i?.locale === "en" ? "en" : "tr";
  const seatId = SEAT_CATALOG.some((s) => s.id === i?.seatId) ? String(i.seatId) : "osmanli";
  if (givenName.length < 2 || dynastyName.length < 2 || traits.length !== 3) {
    throw new Error("invalid_create");
  }
  return { givenName, dynastyName, traits, focus, portrait, locale, seatId };
}

async function ensureProfile(userId: string, displayName: string | null) {
  await ensureSecureProfile(userId, displayName);
}

function parseDispatch(input: unknown): { action: GameAction; nonce: string | null } {
  if (input && typeof input === "object" && "type" in (input as object)) {
    return { action: parseGameAction(input), nonce: null };
  }
  const i = input as { action?: unknown; nonce?: string };
  return { action: parseGameAction(i.action), nonce: typeof i.nonce === "string" ? i.nonce : null };
}

export type CampaignRow = {
  id: string;
  userId: string;
  realmName: string;
  rulerName: string;
  year: number;
  status: string;
  state: GameState;
  isAdmin: boolean;
};

export const getMyCampaign = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ident = await ensureSecureProfile(context.userId, null);
    const gate = await readGate(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      user_id: string;
      realm_name: string;
      ruler_name: string;
      year: number;
      status: string;
      state: GameState;
    }>`
      select c.id, c.user_id, c.realm_name, c.ruler_name, c.year, c.status, c.state
      from campaigns c
      where c.user_id = ${context.userId}
      limit 1
    `;
    const banned = gate.banned;
    if (banned) {
      return {
        campaign: null as CampaignRow | null,
        isAdmin: ident.isOwner,
        isOwner: ident.isOwner,
        usurped: false,
        banned: true,
        banReason: gate.banReason,
        muted: false,
      };
    }
    const row = rows[0];
    if (!row) {
      return {
        campaign: null as CampaignRow | null,
        isAdmin: ident.isOwner,
        isOwner: ident.isOwner,
        usurped: false,
        banned: false,
        banReason: null as string | null,
        muted: false,
      };
    }
    if (row.status === "frozen" || row.status === "banned") {
      return {
        campaign: null as CampaignRow | null,
        isAdmin: ident.isOwner,
        isOwner: ident.isOwner,
        usurped: false,
        banned: true,
        banReason: row.status,
        muted: false,
      };
    }
    const raw = typeof row.state === "string" ? (JSON.parse(row.state) as GameState) : row.state;
    const migrated = migrateState(raw);
    const sqlWorld = sql;
    await ensureWorld(sqlWorld);
    let hydrated = await hydrateCampaignWorld(sqlWorld, migrated, context.userId);
    if (hydrated.usurped) {
      const preferred = hydrated.state.diplomacy.seatId || "osmanli";
      const take = await claimWorldSeat(sql, {
        userId: context.userId,
        campaignId: row.id,
        seatId: preferred,
        rulerName: hydrated.state.ruler.givenName,
        realmName: hydrated.state.realm.name,
      });
      if (take.ok) {
        hydrated = await hydrateCampaignWorld(sqlWorld, hydrated.state, context.userId);
      }
    }
    if ((raw.version ?? 0) < hydrated.state.version || !hydrated.usurped) {
      await sql`
        update campaigns set state = ${JSON.stringify(hydrated.state)}::jsonb, year = ${hydrated.state.year}, updated_at = now()
        where id = ${row.id} and user_id = ${context.userId}
      `;
    }
    if (!hydrated.usurped) {
      await sql`
        update world_seats set last_seen = now(), ruler_name = ${hydrated.state.ruler.givenName}, realm_name = ${hydrated.state.realm.name}
        where user_id = ${context.userId} and seat_id = ${hydrated.state.diplomacy.seatId}
      `;
    }
    let live = hydrated.state;
    try {
      live = await catchUpOnLoad(sql, context.userId, row.id, hydrated.state);
    } catch {
      live = hydrated.state;
    }
    return {
      campaign: {
        id: row.id,
        userId: row.user_id,
        realmName: live.realm.name,
        rulerName: live.ruler.givenName,
        year: live.year,
        status: row.status,
        state: live,
        isAdmin: ident.isOwner,
      },
      isAdmin: ident.isOwner,
      isOwner: ident.isOwner,
      usurped: hydrated.usurped,
      banned: false,
      banReason: null as string | null,
      muted: false,
    };
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseCreate(input))
  .handler(async ({ context, data }) => {
    await assertNotBanned(context.userId);
    await takeRate(context.userId, "dispatch");
    const sql = await getSql();
    await ensureProfile(context.userId, data.givenName);
    await ensureWorld(sql);
    const existing = await sql<{ id: string }>`select id from campaigns where user_id = ${context.userId}`;
    if (existing[0]) throw new Error("already_reigning");
    const state = createInitialState(data, context.userId);
    const id = nid("camp");
    await sql`
      insert into campaigns (id, user_id, world_id, realm_name, ruler_name, year, status, state, last_sim_at, paused)
      values (${id}, ${context.userId}, ${state.worldId}, ${state.realm.name}, ${state.ruler.givenName}, ${state.year}, ${"active"}, ${JSON.stringify(state)}::jsonb, now(), false)
    `;
    const claimed = await claimWorldSeat(sql, {
      userId: context.userId,
      campaignId: id,
      seatId: state.diplomacy.seatId,
      rulerName: state.ruler.givenName,
      realmName: state.realm.name,
    });
    if (!claimed.ok) {
      await sql`delete from campaigns where id = ${id} and user_id = ${context.userId}`;
      throw new Error(`seat_${claimed.reason}`);
    }
    await sql`
      insert into world_presence (user_id, campaign_id, ruler_name, realm_name, year, last_seen)
      values (${context.userId}, ${id}, ${state.ruler.givenName}, ${state.realm.name}, ${state.year}, now())
      on conflict (user_id) do update set
        campaign_id = excluded.campaign_id,
        ruler_name = excluded.ruler_name,
        realm_name = excluded.realm_name,
        year = excluded.year,
        last_seen = now()
    `;
    return { id, state };
  });

export const dispatchAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseDispatch(input))
  .handler(async ({ context, data }) => {
    await assertNotBanned(context.userId);
    await takeRate(context.userId, "dispatch");
    if (HOT_ACTIONS.has(data.action.type)) {
      if (!data.nonce) throw new Error("nonce_required");
      await takeRate(context.userId, "hot");
      await takeNonce(context.userId, data.nonce);
    } else if (data.nonce) {
      await takeNonce(context.userId, data.nonce);
    }
    const sql = await getSql();
    const rows = await sql<{ id: string; state: GameState; status: string }>`
      select id, state, status from campaigns where user_id = ${context.userId} limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("no_campaign");
    if (row.status === "frozen" || row.status === "banned") throw new Error("banned");
    let action = data.action;
    if (action.type === "EQUIP_COSMETIC") {
      if (!isCosmeticSlot(action.slot)) throw new Error("bad_slot");
      const wallet = await readWallet(context.userId);
      if (!canEquip(wallet, action.slot, action.itemId)) throw new Error("not_owned");
    }
    const current = migrateState(typeof row.state === "string" ? (JSON.parse(row.state) as GameState) : row.state);
    if (HOT_ACTIONS.has(action.type) && action.type !== "EQUIP_COSMETIC") {
      const stamped = await sql<{ t: string | null }>`
        select extract(epoch from updated_at)::text as t from campaigns where id = ${row.id} limit 1
      `;
      const prevAt = stamped[0]?.t ? Number(stamped[0].t) * 1000 : 0;
      if (replayTooSoon(prevAt, Date.now(), 180)) throw new Error("too_fast");
      void actionFingerprint;
    }
    if (action.type === "ADVANCE_YEAR" && !canAdvanceYear(current, Date.now())) {
      return { state: current, notices: [] };
    }
    if (action.type === "ADVANCE_YEAR" && (await userHasLiveMatch(sql, context.userId))) {
      return { state: current, notices: [] };
    }
    let peerTactic: TacticId | null = null;
    if (action.type === "START_DUEL" || action.type === "SET_TACTIC" || action.type === "RESOLVE_DUEL") {
      const duelId =
        action.type === "START_DUEL"
          ? action.duelId
          : current.military.pendingDuel?.id ?? "";
      const tactic =
        action.type === "SET_TACTIC" || action.type === "RESOLVE_DUEL" ? action.tactic : null;
      const peerId = action.type === "START_DUEL" ? action.peerId : current.military.pendingDuel?.peerId ?? "ai";
      if (duelId) {
        const stored = await rememberDuelCall({ duelId, userId: context.userId, peerId, tactic });
        if (stored && TACTIC_SET.has(stored)) peerTactic = stored as TacticId;
      }
    }
    action = authorizeAction(current, action, { now: Date.now(), peerTactic });
    const beforeHeads = hostHeadcount(current);
    const result = applyAction(current, action);
    if (treasuryDeltaIllegal(current.treasury, result.state.treasury, action)) {
      throw new Error("treasury_cheat");
    }
    if (armySpikeIllegal(beforeHeads, hostHeadcount(result.state), action)) {
      throw new Error("army_cheat");
    }
    const synced = await afterCampaignMutation(sql, {
      userId: context.userId,
      campaignId: row.id,
      action,
      state: result.state,
    });
    const status = synced.succession ? "succession" : "active";
    const world = synced.world;
    await sql`
      update campaigns
      set state = ${JSON.stringify(synced)}::jsonb,
          ruler_name = ${synced.ruler.givenName},
          realm_name = ${synced.realm.name},
          year = ${synced.year},
          status = ${status},
          last_sim_at = ${new Date(world?.lastSimAt ?? Date.now()).toISOString()}::timestamptz,
          paused = ${Boolean(world?.paused)},
          pause_reason = ${world?.pauseReason ?? null},
          updated_at = now()
      where id = ${row.id} and user_id = ${context.userId}
    `;
    await sql`
      insert into world_presence (user_id, campaign_id, ruler_name, realm_name, year, last_seen)
      values (${context.userId}, ${row.id}, ${synced.ruler.givenName}, ${synced.realm.name}, ${synced.year}, now())
      on conflict (user_id) do update set
        ruler_name = excluded.ruler_name,
        realm_name = excluded.realm_name,
        year = excluded.year,
        last_seen = now()
    `;
    if (
      action.type === "ADVANCE_YEAR" ||
      action.type === "LAUNCH_CAMPAIGN" ||
      action.type === "OFFER_PEACE" ||
      action.type === "PEACE_TERMS" ||
      action.type === "TREATY"
    ) {
      await writeReignCheckpoint(context.userId, synced, "auto", true);
    }
    return { state: synced, notices: result.notices };
  });
