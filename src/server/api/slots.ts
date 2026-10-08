import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { migrateState } from "@/domains/palace/migrate";
import { slotAcceptable } from "@/domains/governance/slot";
import type { GameState } from "@/domains/types";

const SLOTS = new Set(["auto", "a", "b", "c"]);

function slotName(input: unknown): string {
  const slot = String((input as { slot?: string })?.slot ?? "");
  if (!SLOTS.has(slot)) throw new Error("bad_slot");
  return slot;
}

function parseState(raw: unknown): GameState {
  return migrateState(typeof raw === "string" ? (JSON.parse(raw) as GameState) : (raw as GameState));
}

async function currentCampaign(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string; state: GameState }>`
    select id, state from campaigns where user_id = ${userId} limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("no_campaign");
  return { sql, id: row.id, state: parseState(row.state) };
}

/** Server copies the reign it already stored. The client never sends a treasury. */
export async function writeReignCheckpoint(userId: string, state: GameState, slot = "auto", quiet = true): Promise<void> {
  if (!SLOTS.has(slot)) return;
  if (state.governance?.ironman && slot !== "auto") {
    if (quiet) return;
    throw new Error("ironman");
  }
  try {
    const sql = await getSql();
    const lands = state.provinces.filter((p) => p.ownerId === state.realm.id).length;
    await sql`
      insert into reign_slots (user_id, slot, year, ruler_name, realm_name, lands, state)
      values (${userId}, ${slot}, ${state.year}, ${state.ruler.givenName}, ${state.realm.name}, ${lands}, ${JSON.stringify(state)}::jsonb)
      on conflict (user_id, slot) do update set
        year = excluded.year,
        ruler_name = excluded.ruler_name,
        realm_name = excluded.realm_name,
        lands = excluded.lands,
        state = excluded.state,
        saved_at = now()
    `;
  } catch (err) {
    if (!quiet) throw err;
  }
}

export const listReignSlots = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ slot: string; year: number; ruler_name: string; realm_name: string; lands: number; saved_at: string }>`
      select slot, year, ruler_name, realm_name, lands, saved_at::text as saved_at
      from reign_slots
      where user_id = ${context.userId}
      order by slot
    `;
    return rows;
  });

export const saveReignSlot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(slotName)
  .handler(async ({ context, data: slot }) => {
    const { state } = await currentCampaign(context.userId);
    if (state.governance?.ironman && slot !== "auto") throw new Error("ironman");
    await writeReignCheckpoint(context.userId, state, slot, false);
    const lands = state.provinces.filter((p) => p.ownerId === state.realm.id).length;
    return { slot, year: state.year, lands };
  });

export const loadReignSlot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(slotName)
  .handler(async ({ context, data: slot }) => {
    const { sql, id, state } = await currentCampaign(context.userId);
    if (state.governance?.ironman) throw new Error("ironman");
    const rows = await sql<{ state: GameState }>`
      select state from reign_slots where user_id = ${context.userId} and slot = ${slot} limit 1
    `;
    const saved = rows[0];
    if (!saved) throw new Error("empty_slot");
    const incoming = parseState(saved.state);
    if (!slotAcceptable(state, incoming)) throw new Error("bad_slot");
    const next = migrateState(incoming);
    await sql`
      update campaigns
      set state = ${JSON.stringify(next)}::jsonb,
          ruler_name = ${next.ruler.givenName},
          realm_name = ${next.realm.name},
          year = ${next.year},
          status = ${"active"},
          updated_at = now()
      where id = ${id} and user_id = ${context.userId}
    `;
    return { state: next };
  });
