import type { GameState } from "@/domains/types";
import { tickCampaign } from "@/domains/military/campaign";
import { ensureMilitary } from "@/domains/military/model";
import { ensureSiege } from "@/domains/military/siege";

export function tickMilitaryYear(s: GameState, rng: () => number): GameState {
  let next = ensureMilitary(s);
  next = ensureSiege(next);
  next = tickCampaign(next, rng);
  return ensureSiege(next);
}