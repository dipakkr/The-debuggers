import { Genome, MetricsResult } from "@/lib/contracts/genome";
import { NOVELTY_TAU, isNovel, noveltyScore } from "@/lib/attacks/templates";
import type { ScenarioOutcome } from "./referee";

/**
 * Attack fitness — computed ONLY by deterministic code from Referee outcomes.
 * The LLM may optimise toward it; it may never assert it.
 *
 * F = evasion + novelty_bonus - realism_penalties
 */
export function computeFitness(genome: Genome, outcome: ScenarioOutcome): number {
  const evasion = outcome.attack_success_rate;

  let noveltyBonus = 0;
  if (isNovel(genome)) noveltyBonus = 0.25 * Math.min(1.2, noveltyScore(genome) / NOVELTY_TAU);

  let penalty = 0;
  // machine-speed probing is a giveaway and an unrealistic pattern
  if (genome.sequence.probe_count > 0 && genome.sequence.interarrival_s < 20) penalty += 0.5;
  // implausible single cash-out size for the family
  if (
    genome.family === "card_testing_drain" &&
    genome.amount.base * genome.amount.drain_multiplier > 6000
  )
    penalty += 0.5;

  return evasion + noveltyBonus - penalty;
}
