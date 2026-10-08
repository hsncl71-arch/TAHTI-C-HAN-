import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nid } from "@/domains/ids";
import { mulberry32 } from "@/domains/ids";
import { SEAT_CATALOG, seatById } from "@/domains/map/provinces";
import { WORLD_ID, type DipKind, type DipOffer, type DipTerms, type GameAction, type GameState, type OfferStatus, type SeatClaim } from "@/domains/types";
import { DIP_KINDS } from "@/domains/types";
import { canClaimSeat, catalogSeatRows, toSeatClaim, type SeatRow } from "@/domains/diplomacy/seats";
import { canRateLimit, moderateText } from "@/domains/diplomacy/moderate";
import { isUnilateral, needsCounterpartyConsent, OFFER_TTL_YEARS } from "@/domains/diplomacy/offers";
import { allDefaultBonds } from "@/domains/diplomacy/defaults";
import { tickWorldAiBonds } from "@/domains/diplomacy/ai";
import { bondFromRelation, clampTerms, findBond, hydrateWorldOntoState, pairKey, type WorldBond } from "@/domains/diplomacy/world";
import { ensureDiplomacy } from "@/domains/diplomacy/model";
import { rebaseCampaignSeat } from "@/domains/world/seed";
import { canIssueInvite, canRedeemInvite, issueInvite } from "@/domains/diplomacy/invite";
import { assertNotBanned, assertNotMuted, isBlocked, takeRate } from "@/server/security/guard";

type Sql = Awaited<ReturnType<typeof getSql>>;

const KINDS = new Set<string>(DIP_KINDS);

function asKind(raw: string): DipKind {
  return KINDS.has(raw) ? (raw as DipKind) : "envoy";
}

async function loadSeatRows(sql: Sql): Promise<SeatRow[]> {
  const rows = await sql<{
    seat_id: string;
    kind: string;
    user_id: string | null;
    campaign_id: string | null;
    ruler_name: string;
    realm_name: string;
    last_seen: string | null;
  }>`
    select seat_id, kind, user_id, campaign_id, ruler_name, realm_name, last_seen::text as last_seen
    from world_seats
  `;
  return rows.map((r) => ({
    seatId: r.seat_id,
    kind: r.kind === "player" ? "player" : "ai",
    userId: r.user_id,
    campaignId: r.campaign_id,
    rulerName: r.ruler_name,
    realmName: r.realm_name,
    lastSeen: r.last_seen,
  }));
}

async function loadBonds(sql: Sql): Promise<WorldBond[]> {
  const rows = await sql<{
    seat_a: string;
    seat_b: string;
    value: number;
    treaty: string;
    trade_pact: boolean;
    coalition_against: string | null;
  }>`
    select seat_a, seat_b, value, treaty, trade_pact, coalition_against
    from world_relations
  `;
  return rows.map((r) => ({
    a: r.seat_a,
    b: r.seat_b,
    value: r.value,
    treaty: r.treaty === "truce" || r.treaty === "alliance" || r.treaty === "war" ? r.treaty : "peace",
    tradePact: Boolean(r.trade_pact),
    coalitionAgainst: r.coalition_against,
  }));
}

function rowToOffer(r: {
  id: string;
  from_seat: string;
  to_seat: string;
  kind: string;
  tribute: number;
  duration_years: number;
  against_seat: string | null;
  note: string;
  status: string;
  year: number;
  from_ruler?: string;
  from_realm?: string;
}): DipOffer {
  const status = r.status as OfferStatus;
  return {
    id: r.id,
    fromSeat: r.from_seat,
    toSeat: r.to_seat,
    kind: asKind(r.kind),
    terms: clampTerms({
      tribute: r.tribute,
      durationYears: r.duration_years,
      againstRealmId: r.against_seat,
      note: r.note,
    }),
    status:
      status === "accepted" || status === "refused" || status === "expired" || status === "withdrawn" ? status : "pending",
    year: r.year,
    fromRuler: r.from_ruler ?? "",
    fromRealm: r.from_realm ?? "",
  };
}

export async function ensureWorld(sql: Sql): Promise<void> {
  const existing = await sql<{ c: number }>`select count(*)::int as c from world_seats`;
  if ((existing[0]?.c ?? 0) === 0) {
    for (const row of catalogSeatRows()) {
      await sql`
        insert into world_seats (seat_id, kind, ruler_name, realm_name)
        values (${row.seatId}, ${"ai"}, ${row.rulerName}, ${row.realmName})
        on conflict (seat_id) do nothing
      `;
    }
  } else {
    for (const row of catalogSeatRows()) {
      await sql`
        insert into world_seats (seat_id, kind, ruler_name, realm_name)
        values (${row.seatId}, ${"ai"}, ${row.rulerName}, ${row.realmName})
        on conflict (seat_id) do nothing
      `;
    }
  }
  const bondCount = await sql<{ c: number }>`select count(*)::int as c from world_relations`;
  if ((bondCount[0]?.c ?? 0) === 0) {
    const seeds = allDefaultBonds(SEAT_CATALOG.map((s) => s.id));
    for (const b of seeds) {
      await sql`
        insert into world_relations (seat_a, seat_b, value, treaty, trade_pact)
        values (${b.a}, ${b.b}, ${b.value}, ${b.treaty}, ${false})
        on conflict (seat_a, seat_b) do nothing
      `;
    }
  }
}

async function writeBond(sql: Sql, bond: WorldBond): Promise<void> {
  const [a, b] = pairKey(bond.a, bond.b);
  await sql`
    insert into world_relations (seat_a, seat_b, value, treaty, trade_pact, coalition_against, updated_at)
    values (${a}, ${b}, ${bond.value}, ${bond.treaty}, ${bond.tradePact}, ${bond.coalitionAgainst}, now())
    on conflict (seat_a, seat_b) do update set
      value = excluded.value,
      treaty = excluded.treaty,
      trade_pact = excluded.trade_pact,
      coalition_against = excluded.coalition_against,
      updated_at = now()
  `;
}

async function pendingOffersFor(sql: Sql, seatId: string): Promise<DipOffer[]> {
  const rows = await sql<{
    id: string;
    from_seat: string;
    to_seat: string;
    kind: string;
    tribute: number;
    duration_years: number;
    against_seat: string | null;
    note: string;
    status: string;
    year: number;
  }>`
    select id, from_seat, to_seat, kind, tribute, duration_years, against_seat, note, status, year
    from dip_offers
    where status = ${"pending"} and (to_seat = ${seatId} or from_seat = ${seatId})
    order by created_at desc
    limit 40
  `;
  const names = new Map<string, string>(SEAT_CATALOG.map((s) => [s.id, s.name]));
  return rows.map((r) =>
    rowToOffer({
      ...r,
      from_realm: names.get(r.from_seat) ?? r.from_seat,
    }),
  );
}

export async function hydrateCampaignWorld(sql: Sql, state: GameState, userId: string): Promise<{
  state: GameState;
  usurped: boolean;
  seats: SeatClaim[];
}> {
  await ensureWorld(sql);
  const rows = await loadSeatRows(sql);
  const seats = rows.map((r) => toSeatClaim(r));
  const mine = seats.find((s) => s.userId === userId && s.live);
  const claimed = rows.find((r) => r.seatId === state.diplomacy?.seatId);
  const usurped = Boolean(state.diplomacy?.seatId) && (!claimed || claimed.userId !== userId || !toSeatClaim(claimed).live);
  const bonds = await loadBonds(sql);
  const seatId = mine?.realmId ?? state.diplomacy?.seatId ?? "osmanli";
  const pending = await pendingOffersFor(sql, seatId);
  const next = hydrateWorldOntoState(ensureDiplomacy(state), seats, bonds, pending);
  return { state: next, usurped: usurped && !mine, seats };
}

export async function heartbeatSeat(
  sql: Sql,
  userId: string,
  campaignId: string,
  state: GameState,
): Promise<void> {
  const seatId = state.diplomacy?.seatId;
  if (!seatId) return;
  await sql`
    update world_seats
    set last_seen = now(),
        ruler_name = ${state.ruler.givenName},
        realm_name = ${state.realm.name},
        campaign_id = ${campaignId},
        kind = ${"player"},
        user_id = ${userId}
    where seat_id = ${seatId} and (user_id = ${userId} or user_id is null)
  `;
}

export async function claimWorldSeat(
  sql: Sql,
  args: { userId: string; campaignId: string; seatId: string; rulerName: string; realmName: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  await ensureWorld(sql);
  const rows = await loadSeatRows(sql);
  const seats = rows.map((r) => toSeatClaim(r));
  if (seats.some((s) => s.userId === args.userId && s.live && s.realmId !== args.seatId)) {
    return { ok: false, reason: "held" };
  }
  const target = rows.find((r) => r.seatId === args.seatId);
  if (!target) return { ok: false, reason: "unknown" };
  const verdict = canClaimSeat(target, args.userId);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  await sql`
    update world_seats
    set user_id = null, kind = ${"ai"}, campaign_id = null
    where user_id = ${args.userId} and seat_id <> ${args.seatId}
  `;
  await sql`
    update world_seats
    set kind = ${"player"},
        user_id = ${args.userId},
        campaign_id = ${args.campaignId},
        ruler_name = ${args.rulerName},
        realm_name = ${args.realmName},
        last_seen = now(),
        claimed_at = now()
    where seat_id = ${args.seatId}
  `;
  return { ok: true };
}

async function syncBondFromState(sql: Sql, state: GameState, counterpart: string): Promise<void> {
  const rel = state.relations.find((r) => r.realmId === counterpart);
  if (!rel) return;
  await writeBond(sql, bondFromRelation(state.diplomacy.seatId, rel));
}

async function tickWorld(sql: Sql, year: number, seed: number): Promise<void> {
  const rows = await loadSeatRows(sql);
  const seats = rows.map((r) => toSeatClaim(r));
  const bonds = await loadBonds(sql);
  const pendingRows = await sql<{ from_seat: string; to_seat: string }>`
    select from_seat, to_seat from dip_offers where status = ${"pending"}
  `;
  const rng = mulberry32(seed + year * 7919 + 17);
  const ticked = tickWorldAiBonds(seats, bonds, pendingRows.map((p) => ({ from: p.from_seat, to: p.to_seat })), rng);
  for (const b of ticked.bonds) await writeBond(sql, b);
  await sql`
    update dip_offers
    set status = ${"expired"}
    where status = ${"pending"} and year < ${year - OFFER_TTL_YEARS}
  `;
  for (const offer of ticked.offers) {
    if (offer.kind === "war") {
      const [a, b] = pairKey(offer.fromSeat, offer.toSeat);
      const cur = findBond(ticked.bonds, a, b);
      await writeBond(sql, {
        a,
        b,
        value: Math.max(-100, (cur?.value ?? 0) - 22),
        treaty: "war",
        tradePact: false,
        coalitionAgainst: null,
      });
    }
    const id = nid("off");
    const from = seats.find((s) => s.realmId === offer.fromSeat);
    await sql`
      insert into dip_offers (id, from_seat, to_seat, from_user_id, to_user_id, kind, tribute, duration_years, against_seat, note, status, year)
      values (
        ${id}, ${offer.fromSeat}, ${offer.toSeat}, ${null},
        ${(seats.find((s) => s.realmId === offer.toSeat)?.userId) ?? null},
        ${offer.kind}, ${offer.tribute}, ${5}, ${offer.againstSeat}, ${""},
        ${offer.kind === "war" ? "accepted" : "pending"}, ${year}
      )
    `;
    void from;
  }
}

export async function afterCampaignMutation(
  sql: Sql,
  args: { userId: string; campaignId: string; action: GameAction; state: GameState },
): Promise<GameState> {
  const { userId, campaignId, action, state } = args;
  await heartbeatSeat(sql, userId, campaignId, state);
  if (action.type === "ADVANCE_YEAR") {
    await tickWorld(sql, state.year, state.seed);
  }
  if (action.type === "GIFT") {
    await syncBondFromState(sql, state, action.realmId);
  }
  if (action.type === "TREATY" || action.type === "SET_TRADE_PACT" || action.type === "SET_COALITION") {
    const realmId = action.type === "TREATY" || action.type === "SET_TRADE_PACT" || action.type === "SET_COALITION" ? action.realmId : "";
    if (realmId) await syncBondFromState(sql, state, realmId);
  }
  if (action.type === "DIP_OFFER") {
    await persistOutgoingOffer(sql, userId, state, action.realmId, action.kind, action.terms);
  }
  if (action.type === "DIP_RESPOND") {
    await persistResponse(sql, userId, state, action.offerId, action.accept);
  }
  if (action.type === "DIP_WITHDRAW") {
    await sql`
      update dip_offers
      set status = ${"withdrawn"}
      where id = ${action.offerId} and from_user_id = ${userId} and status = ${"pending"}
    `;
  }
  const hydrated = await hydrateCampaignWorld(sql, state, userId);
  return hydrated.state;
}

async function persistOutgoingOffer(
  sql: Sql,
  userId: string,
  state: GameState,
  toSeat: string,
  kind: DipKind,
  terms: DipTerms,
): Promise<void> {
  const fromSeat = state.diplomacy.seatId;
  const clean = clampTerms(terms);
  const rows = await loadSeatRows(sql);
  const target = toSeatClaim(rows.find((r) => r.seatId === toSeat) ?? catalogSeatRows().find((r) => r.seatId === toSeat)!);
  const held = target.live && target.kind === "player";
  const local = state.diplomacy.pending.find((o) => o.toSeat === toSeat && o.kind === kind && o.status === "pending");
  const id = local?.id ?? nid("off");
  let writeStatus: OfferStatus = "pending";
  if (!held || isUnilateral(kind) || !needsCounterpartyConsent(kind)) {
    const rel = state.relations.find((r) => r.realmId === toSeat);
    if (kind === "war" || kind === "envoy") writeStatus = "accepted";
    else if (kind === "trade") writeStatus = rel?.tradePact ? "accepted" : "refused";
    else if (kind === "alliance") writeStatus = rel?.treaty === "alliance" ? "accepted" : "refused";
    else if (kind === "peace") writeStatus = rel && rel.treaty !== "war" ? "accepted" : "refused";
    else if (kind === "coalition") writeStatus = rel?.coalitionAgainst ? "accepted" : "refused";
    await syncBondFromState(sql, state, toSeat);
    if (kind === "coalition" && clean.againstRealmId) await syncBondFromState(sql, state, clean.againstRealmId);
  }
  await sql`
    insert into dip_offers (id, from_seat, to_seat, from_user_id, to_user_id, kind, tribute, duration_years, against_seat, note, status, year)
    values (
      ${id}, ${fromSeat}, ${toSeat}, ${userId}, ${target.userId}, ${kind}, ${clean.tribute}, ${clean.durationYears},
      ${clean.againstRealmId}, ${clean.note}, ${writeStatus}, ${state.year}
    )
    on conflict (id) do update set status = excluded.status
  `;
}

async function persistResponse(sql: Sql, userId: string, state: GameState, offerId: string, accept: boolean): Promise<void> {
  const rows = await sql<{
    id: string;
    from_seat: string;
    to_seat: string;
    kind: string;
    tribute: number;
    duration_years: number;
    against_seat: string | null;
    note: string;
    status: string;
    year: number;
    to_user_id: string | null;
  }>`
    select id, from_seat, to_seat, kind, tribute, duration_years, against_seat, note, status, year, to_user_id
    from dip_offers where id = ${offerId} limit 1
  `;
  const row = rows[0];
  if (!row || row.to_user_id !== userId) return;
  const status = accept ? "accepted" : "refused";
  await sql`update dip_offers set status = ${status} where id = ${offerId} and to_user_id = ${userId}`;
  if (accept) {
    await syncBondFromState(sql, state, row.from_seat === state.diplomacy.seatId ? row.to_seat : row.from_seat);
    if (row.kind === "coalition" && row.against_seat) await syncBondFromState(sql, state, row.against_seat);
  }
}

export const listWorld = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureWorld(sql);
    const rows = await loadSeatRows(sql);
    const seats = rows.map((r) => toSeatClaim(r));
    const bonds = await loadBonds(sql);
    const mine = seats.find((s) => s.userId === context.userId && s.live) ?? null;
    return {
      worldId: WORLD_ID,
      seats,
      bonds,
      mine,
      usurped: !mine,
    };
  });

export const rebindSeat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const seatId = String((input as { seatId?: string })?.seatId ?? "");
    if (!SEAT_CATALOG.some((s) => s.id === seatId)) throw new Error("unknown_seat");
    return { seatId };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureWorld(sql);
    const camp = await sql<{ id: string; state: GameState }>`
      select id, state from campaigns where user_id = ${context.userId} limit 1
    `;
    if (!camp[0]) throw new Error("no_campaign");
    const raw = typeof camp[0].state === "string" ? (JSON.parse(camp[0].state) as GameState) : camp[0].state;
    const claimed = await claimWorldSeat(sql, {
      userId: context.userId,
      campaignId: camp[0].id,
      seatId: data.seatId,
      rulerName: raw.ruler.givenName,
      realmName: seatById(data.seatId).name,
    });
    if (!claimed.ok) throw new Error(claimed.reason);
    const next = rebaseCampaignSeat(raw, data.seatId);
    await sql`
      update campaigns
      set state = ${JSON.stringify(next)}::jsonb,
          realm_name = ${next.realm.name},
          year = ${next.year},
          updated_at = now()
      where id = ${camp[0].id} and user_id = ${context.userId}
    `;
    await heartbeatSeat(sql, context.userId, camp[0].id, next);
    const hydrated = await hydrateCampaignWorld(sql, next, context.userId);
    return { state: hydrated.state };
  });

export const createSeatInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const seatId = String((input as { seatId?: string })?.seatId ?? "");
    if (!SEAT_CATALOG.some((s) => s.id === seatId)) throw new Error("unknown_seat");
    return { seatId };
  })
  .handler(async ({ context, data }) => {
    await assertNotBanned(context.userId);
    await takeRate(context.userId, "letter");
    const sql = await getSql();
    await ensureWorld(sql);
    const rows = await loadSeatRows(sql);
    const mine = rows.find((r) => r.userId === context.userId);
    if (!mine) throw new Error("held");
    const verdict = canIssueInvite(rows, context.userId, data.seatId);
    if (!verdict.ok) throw new Error(verdict.reason);
    const invite = issueInvite({ fromUserId: context.userId, fromSeat: mine.seatId, targetSeat: data.seatId });
    await sql`
      insert into world_invites (id, token, from_user_id, from_seat, target_seat, expires_at)
      values (
        ${invite.id}, ${invite.token}, ${invite.fromUserId}, ${invite.fromSeat}, ${invite.targetSeat},
        ${new Date(invite.expiresAt).toISOString()}::timestamptz
      )
    `;
    return { token: invite.token, seatId: data.seatId, expiresAt: invite.expiresAt };
  });

export const redeemSeatInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const token = String((input as { token?: string })?.token ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 16);
    if (token.length < 6) throw new Error("bad_token");
    return { token };
  })
  .handler(async ({ context, data }) => {
    await assertNotBanned(context.userId);
    await takeRate(context.userId, "dispatch");
    const sql = await getSql();
    await ensureWorld(sql);
    const found = await sql<{
      id: string;
      token: string;
      from_user_id: string;
      from_seat: string;
      target_seat: string;
      created_at: string;
      expires_at: string;
      redeemed_by: string | null;
    }>`
      select id, token, from_user_id, from_seat, target_seat, created_at::text as created_at,
             expires_at::text as expires_at, redeemed_by
      from world_invites where token = ${data.token} limit 1
    `;
    const row = found[0];
    if (!row) throw new Error("unknown");
    const invite = {
      id: row.id,
      token: row.token,
      fromUserId: row.from_user_id,
      fromSeat: row.from_seat,
      targetSeat: row.target_seat,
      createdAt: Date.parse(row.created_at),
      expiresAt: Date.parse(row.expires_at),
      redeemedBy: row.redeemed_by,
    };
    const seats = await loadSeatRows(sql);
    const verdict = canRedeemInvite(invite, context.userId, seats);
    if (!verdict.ok) throw new Error(verdict.reason);
    const camp = await sql<{ id: string; state: GameState }>`
      select id, state from campaigns where user_id = ${context.userId} limit 1
    `;
    if (!camp[0]) throw new Error("no_campaign");
    const raw = typeof camp[0].state === "string" ? (JSON.parse(camp[0].state) as GameState) : camp[0].state;
    const claimed = await claimWorldSeat(sql, {
      userId: context.userId,
      campaignId: camp[0].id,
      seatId: invite.targetSeat,
      rulerName: raw.ruler.givenName,
      realmName: seatById(invite.targetSeat).name,
    });
    if (!claimed.ok) throw new Error(claimed.reason);
    await sql`
      update world_invites set redeemed_by = ${context.userId} where id = ${invite.id} and redeemed_by is null
    `;
    const next = rebaseCampaignSeat(raw, invite.targetSeat);
    await sql`
      update campaigns
      set state = ${JSON.stringify(next)}::jsonb,
          realm_name = ${next.realm.name},
          updated_at = now()
      where id = ${camp[0].id} and user_id = ${context.userId}
    `;
    await heartbeatSeat(sql, context.userId, camp[0].id, next);
    const hydrated = await hydrateCampaignWorld(sql, next, context.userId);
    return { state: hydrated.state, seatId: invite.targetSeat };
  });


export const listOffers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const camp = await sql<{ state: GameState }>`select state from campaigns where user_id = ${context.userId} limit 1`;
    if (!camp[0]) return { inbox: [] as DipOffer[], outbox: [] as DipOffer[] };
    const raw = typeof camp[0].state === "string" ? (JSON.parse(camp[0].state) as GameState) : camp[0].state;
    const seatId = raw.diplomacy?.seatId ?? "osmanli";
    const rows = await sql<{
      id: string;
      from_seat: string;
      to_seat: string;
      kind: string;
      tribute: number;
      duration_years: number;
      against_seat: string | null;
      note: string;
      status: string;
      year: number;
    }>`
      select id, from_seat, to_seat, kind, tribute, duration_years, against_seat, note, status, year
      from dip_offers
      where from_seat = ${seatId} or to_seat = ${seatId}
      order by created_at desc
      limit 48
    `;
    const names = new Map<string, string>(SEAT_CATALOG.map((s) => [s.id, s.name]));
    const all = rows.map((r) => rowToOffer({ ...r, from_realm: names.get(r.from_seat) ?? r.from_seat }));
    return {
      inbox: all.filter((o) => o.toSeat === seatId),
      outbox: all.filter((o) => o.fromSeat === seatId),
    };
  });

export const sendLetter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { toUserId?: string; toSeat?: string; body?: string };
    return {
      toUserId: String(i.toUserId ?? "").slice(0, 80),
      toSeat: String(i.toSeat ?? "").slice(0, 32),
      body: String(i.body ?? ""),
    };
  })
  .handler(async ({ context, data }) => {
    await assertNotBanned(context.userId);
    await assertNotMuted(context.userId);
    await takeRate(context.userId, "letter");
    const moderated = moderateText(data.body, 400);
    if (!moderated.ok) throw new Error(`moderation_${moderated.reason}`);
    if (!data.toUserId) throw new Error("no_target");
    if (data.toUserId === context.userId) throw new Error("self_envoy");
    const sql = await getSql();
    if (await isBlocked(sql, context.userId, data.toUserId)) throw new Error("blocked");
    const recent = await sql<{ c: number }>`
      select count(*)::int as c from dip_letters
      where from_user_id = ${context.userId} and created_at > now() - interval '1 hour'
    `;
    if (!canRateLimit(recent[0]?.c ?? 0, 8)) throw new Error("rate_limited");
    const me = await sql<{ ruler_name: string; realm_name: string; year: number; state: GameState }>`
      select ruler_name, realm_name, year, state from campaigns where user_id = ${context.userId} limit 1
    `;
    if (!me[0]) throw new Error("no_campaign");
    const raw = typeof me[0].state === "string" ? (JSON.parse(me[0].state) as GameState) : me[0].state;
    const target = await sql<{ user_id: string }>`select user_id from campaigns where user_id = ${data.toUserId} limit 1`;
    if (!target[0]) throw new Error("no_target");
    const seatRows = await loadSeatRows(sql);
    const theirSeat = seatRows.find((r) => r.userId === data.toUserId)?.seatId;
    const toSeat = theirSeat || data.toSeat || "osmanli";
    const id = nid("let");
    await sql`
      insert into dip_letters (id, from_user_id, to_user_id, from_seat, to_seat, from_ruler, from_realm, body, year, status)
      values (
        ${id}, ${context.userId}, ${data.toUserId}, ${raw.diplomacy?.seatId ?? "osmanli"}, ${toSeat},
        ${me[0].ruler_name}, ${me[0].realm_name}, ${moderated.text}, ${me[0].year}, ${"sent"}
      )
    `;
    return { id };
  });

export const listLetters = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      from_user_id: string;
      to_user_id: string;
      from_seat: string;
      to_seat: string;
      from_ruler: string;
      from_realm: string;
      body: string;
      year: number;
      status: string;
      created_at: string;
    }>`
      select id, from_user_id, to_user_id, from_seat, to_seat, from_ruler, from_realm, body, year, status, created_at::text as created_at
      from dip_letters
      where (to_user_id = ${context.userId} or from_user_id = ${context.userId})
        and status <> ${"hidden"}
      order by created_at desc
      limit 40
    `;
    return rows.map((r) => ({
      id: r.id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      fromSeat: r.from_seat,
      toSeat: r.to_seat,
      fromRuler: r.from_ruler,
      fromRealm: r.from_realm,
      body: r.status === "flagged" && r.to_user_id === context.userId ? r.body : r.body,
      year: r.year,
      status: r.status,
      createdAt: r.created_at,
      isSelf: r.from_user_id === context.userId,
    }));
  });

export const flagLetter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: String((input as { id?: string }).id ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("invalid");
    const sql = await getSql();
    const rows = await sql<{ id: string; to_user_id: string; from_user_id: string }>`
      select id, to_user_id, from_user_id from dip_letters where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row || (row.to_user_id !== context.userId && row.from_user_id !== context.userId)) throw new Error("forbidden");
    await takeRate(context.userId, "report");
    const rid = nid("rep");
    await sql`
      insert into dip_reports (id, letter_id, user_id, reason)
      values (${rid}, ${data.id}, ${context.userId}, ${"abuse"})
      on conflict (letter_id, user_id) do nothing
    `;
    const count = await sql<{ c: number }>`select count(*)::int as c from dip_reports where letter_id = ${data.id}`;
    const status = (count[0]?.c ?? 0) >= 2 ? "hidden" : "flagged";
    await sql`update dip_letters set status = ${status} where id = ${data.id}`;
    return { ok: true, status };
  });

export const markLetterRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: String((input as { id?: string }).id ?? "") }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update dip_letters set status = ${"read"}
      where id = ${data.id} and to_user_id = ${context.userId} and status = ${"sent"}
    `;
    return { ok: true };
  });
