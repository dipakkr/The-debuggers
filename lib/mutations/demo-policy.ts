import { Genome } from "@/lib/contracts/genome";
import { TEMPLATE_GENOMES } from "@/lib/attacks/templates";

/**
 * DEMO-mode red strategist: a deterministic EXPERT POLICY, not a tape.
 * Every move is conditioned on the previous generation's observed Referee
 * outcome (reason codes + evasion rate), so the adaptation loop is real.
 * LIVE mode swaps this module for an LLM behind the same interface.
 */

const clone = (g: Genome): Genome => JSON.parse(JSON.stringify(g)) as Genome;

export const ROOT_BY_FAMILY: Record<Genome["family"], number> = {
  card_testing_drain: 0,
  low_and_slow: 3,
  mule_fanout: 4,
  account_takeover: 5,
  transaction_splitting: 6,
};

export function rootGenome(family: Genome["family"]): Genome {
  return clone(TEMPLATE_GENOMES[ROOT_BY_FAMILY[family]]);
}

/** Produce the next mutation given what the detector just did to the parent. */
export function demoMutation(
  parent: Genome,
  lastReasons: string[],
  _lastSuccessRate: number,
  stage: number
): Genome {
  const g = clone(parent);
  const hit = (...codes: string[]) => lastReasons.some((r) => codes.includes(r));

  switch (g.family) {
    case "card_testing_drain": {
      if (stage <= 0) return rootGenome("card_testing_drain");
      if (hit("RULE_MICRO_VELOCITY", "CARD_TESTING_PROBES", "VELOCITY_BURST")) {
        // spread the probes out and shrink the burst
        g.sequence.probe_count = Math.max(1, Math.floor(g.sequence.probe_count / 3));
        g.sequence.interarrival_s = Math.min(3600, g.sequence.interarrival_s * 12);
        g.velocity.tx_per_hour = Math.max(2, Math.floor(g.velocity.tx_per_hour / 2));
      } else if (hit("AMOUNT_ANOMALY")) {
        // blend the cash-out into a warmed identity's normal range
        g.amount.base = Math.max(120, Math.round(g.amount.base * 0.6));
        g.amount.drain_multiplier = 1;
        g.identity.account_age_days = Math.min(3650, Math.max(150, g.identity.account_age_days));
        g.device.age_days = 30; // warm the device
        g.merchant.new_merchant = false;
        g.temporal.start_hour_utc = 13;
      } else {
        // marginal catches: go metronomic and quiet
        g.sequence.regularity = 0.92;
        g.amount.jitter = 0.05;
        g.temporal.start_hour_utc = 11;
      }
      return g;
    }
    case "low_and_slow": {
      if (stage <= 0) return rootGenome("low_and_slow");
      if (hit("ODD_HOUR")) {
        g.temporal.start_hour_utc = 13;
      }
      if (hit("AMOUNT_ANOMALY") || stage === 1) {
        g.amount.base = Math.max(110, Math.round(g.amount.base * 0.62));
        g.device.age_days = 30;
      }
      if (stage >= 2 && hit("NEW_DEVICE", "NEW_MERCHANT")) {
        g.device.age_days = 45;
        g.merchant.new_merchant = false;
        g.identity.account_age_days = Math.min(3650, Math.max(240, g.identity.account_age_days));
        g.sequence.interarrival_s = Math.min(604800, g.sequence.interarrival_s * 2);
      }
      if (stage >= 3) {
        // final camouflage: flat amounts on a metronomic cadence — invisible
        // to any point-wise detector, exposed only by sequence-shape signals
        g.amount.jitter = 0.04;
        g.sequence.regularity = 0.97;
        g.amount.base = Math.min(g.amount.base, 190);
        g.temporal.span_hours = Math.min(336, g.temporal.span_hours * 1.5);
      }
      return g;
    }
    case "account_takeover": {
      if (stage <= 0) return rootGenome("account_takeover");
      if (hit("GEO_ANOMALY", "CROSS_BORDER")) {
        // stop tripping the geography rule: cash out inside the victim's country
        g.device.geo_jump_km = 0;
      }
      if (hit("NEW_DEVICE") || stage === 1) {
        // warm the takeover device before using it, so it enters history first
        g.device.age_days = Math.min(3650, Math.max(30, g.device.age_days * 3 + 30));
      }
      if (hit("AMOUNT_ANOMALY", "AMOUNT_CEILING") || stage >= 2) {
        // shrink the cash-out toward the victim's own spending scale and
        // spread it over more legs so no single row looks anomalous
        g.amount.drain_multiplier = Math.max(1, g.amount.drain_multiplier * 0.45);
        g.velocity.tx_per_hour = Math.min(40, Math.max(6, g.velocity.tx_per_hour + 6));
      }
      if (stage >= 3) {
        // sit dormant after the takeover so the session no longer correlates
        g.takeover.dwell_hours = Math.min(168, Math.max(24, g.takeover.dwell_hours * 8 + 24));
        g.takeover.recon_tx_count = 0;
        g.sequence.interarrival_s = Math.min(604800, g.sequence.interarrival_s * 6);
        g.merchant.new_merchant = false;
        g.temporal.start_hour_utc = 12;
      }
      return g;
    }
    case "transaction_splitting": {
      if (stage <= 0) return rootGenome("transaction_splitting");
      if (hit("STRUCTURING_BAND", "AMOUNT_ANOMALY") || stage === 1) {
        // step the legs down out of the near-ceiling detection band
        g.split.ceiling_ratio = Math.max(0.5, g.split.ceiling_ratio - 0.22);
        g.amount.base = Math.max(1, Math.round(g.amount.base * 0.55));
      }
      if (hit("VELOCITY_HIGH", "VELOCITY_BURST", "RULE_VELOCITY_BURST") || stage >= 2) {
        g.sequence.interarrival_s = Math.min(604800, g.sequence.interarrival_s * 5);
        g.velocity.tx_per_hour = Math.max(1, Math.floor(g.velocity.tx_per_hour / 2));
        g.temporal.span_hours = Math.min(336, g.temporal.span_hours * 3);
      }
      if (stage >= 3) {
        // widen across storefronts and drop the leg count so no merchant sees
        // a repeating pattern
        g.split.merchant_spread = Math.min(8, g.split.merchant_spread + 3);
        g.split.count = Math.max(1, g.split.count - 2);
        g.amount.jitter = 0.28;
        g.merchant.new_merchant = false;
      }
      return g;
    }
    case "mule_fanout": {
      if (stage <= 0) return rootGenome("mule_fanout");
      if (hit("VELOCITY_BURST", "RULE_VELOCITY_BURST")) {
        g.sequence.interarrival_s = Math.min(604800, g.sequence.interarrival_s * 8);
        g.temporal.span_hours = Math.min(336, g.temporal.span_hours * 2);
        g.velocity.tx_per_hour = Math.max(2, Math.floor(g.velocity.tx_per_hour / 2));
      }
      if (hit("NEW_DEVICE") || stage === 1) {
        g.device.age_days = 30;
        g.identity.account_age_days = Math.min(3650, g.identity.account_age_days * 3);
      }
      if (hit("AMOUNT_ANOMALY") || stage >= 2) {
        g.amount.base = Math.max(80, Math.round(g.amount.base * 0.55));
        g.identity.account_age_days = Math.min(3650, Math.max(90, g.identity.account_age_days));
        if (stage >= 3) {
          g.amount.jitter = 0.06;
          g.sequence.regularity = 0.95;
        }
      }
      return g;
    }
  }
}
