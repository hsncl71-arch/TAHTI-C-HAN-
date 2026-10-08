import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { cannedCounsel, counselSystemPrompt } from "@/domains/npc/counsel";
import { migrateState } from "@/domains/palace/migrate";
import { DIVAN_OFFICES } from "@/domains/divan/offices";
import type { GameState, Locale, Office } from "@/domains/types";
import { assertNotBanned, recordAiUsage, takeRate } from "@/server/security/guard";

const OFFICES = new Set<string>([...DIVAN_OFFICES, "musahib"]);

export const consultAdvisor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const i = input as { office: string; question: string; locale?: Locale };
    const office = String(i?.office ?? "");
    const question = String(i?.question ?? "").trim().slice(0, 400);
    const locale: Locale = i?.locale === "en" ? "en" : "tr";
    if (!OFFICES.has(office) || question.length < 2) throw new Error("invalid_counsel");
    return { office: office as Office, question, locale };
  })
  .handler(async ({ context, data }) => {
    await assertNotBanned(context.userId);
    await takeRate(context.userId, "counsel");
    const sql = await getSql();
    const rows = await sql<{ state: GameState; year: number }>`
      select state, year from campaigns where user_id = ${context.userId} limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("no_campaign");
    const state = migrateState(typeof row.state === "string" ? (JSON.parse(row.state) as GameState) : row.state);

    const recent = await sql<{ c: number }>`
      select count(*)::int as c from npc_counsel
      where user_id = ${context.userId} and created_at > now() - interval '20 seconds'
    `;
    if ((recent[0]?.c ?? 0) > 0) {
      return { ok: true as const, text: cannedCounsel(state, data.office, data.locale), cached: true };
    }

    const apiKey = process.env.XAI_API_KEY;
    let text = cannedCounsel(state, data.office, data.locale);
    if (apiKey) {
      try {
        const res = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "grok-4.5",
            max_tokens: 280,
            messages: [
              { role: "system", content: counselSystemPrompt(state, data.office, data.locale) },
              { role: "user", content: data.question },
            ],
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as { choices: { message: { content: string } }[] };
          text = body.choices[0]?.message.content?.trim() || text;
        }
      } catch {
        /* canned fallback */
      }
    }

    await sql`
      insert into npc_counsel (user_id, advisor_role, question, answer, year)
      values (${context.userId}, ${data.office}, ${data.question}, ${text}, ${row.year})
    `;
    if (apiKey && !((recent[0]?.c ?? 0) > 0)) {
      await recordAiUsage({
        userId: context.userId,
        model: "grok-4.5",
        prompt: data.question,
        answer: text,
      });
    }
    return { ok: true as const, text, cached: false };
  });
