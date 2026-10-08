import { nid } from "@/domains/ids";
import { WORLD_ID, type WorldJob, type WorldJobKind } from "@/domains/types";

/** Pure event-queue helpers. The table is the scale path: only due rows are loaded. */
export function makeJob(args: {
  kind: WorldJobKind;
  dueAt: number;
  campaignId?: string | null;
  userId?: string | null;
  payload?: Record<string, string | number>;
}): WorldJob {
  return {
    id: nid("job"),
    worldId: WORLD_ID,
    campaignId: args.campaignId ?? null,
    userId: args.userId ?? null,
    kind: args.kind,
    dueAt: args.dueAt,
    payload: args.payload ?? {},
    status: "queued",
  };
}

export function dueJobs(jobs: WorldJob[], now: number): WorldJob[] {
  return jobs
    .filter((j) => j.status === "queued" && j.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt);
}

export function nextDueAt(jobs: WorldJob[]): number | null {
  let min: number | null = null;
  for (const j of jobs) {
    if (j.status !== "queued") continue;
    if (min === null || j.dueAt < min) min = j.dueAt;
  }
  return min;
}

export function completeJob(jobs: WorldJob[], id: string): WorldJob[] {
  return jobs.map((j) => (j.id === id ? { ...j, status: "done" as const } : j));
}

export function failJob(jobs: WorldJob[], id: string): WorldJob[] {
  return jobs.map((j) => (j.id === id ? { ...j, status: "failed" as const } : j));
}

/**
 * Index-friendly due-window: a million sleeping realms stay cold until
 * last_sim_at + ms_per_year. Sweep queries only that window, never the full JSON.
 */
export function dueCampaignPredicate(now: number, msPerYear: number): { before: number } {
  return { before: now - msPerYear };
}
