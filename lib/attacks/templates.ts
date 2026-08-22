import { Genome } from "@/lib/contracts/genome";

/**
 * Canonical loud templates per family — what the baseline detector is
 * TRAINED on, and the reference set for novelty distance.
 */
export const TEMPLATE_GENOMES: Genome[] = [
  {
    family: "card_testing_drain",
    amount: { base: 500, jitter: 0.15, drain_multiplier: 1 },
    velocity: { tx_per_hour: 10 },
    temporal: { start_hour_utc: 2, span_hours: 1 },
    merchant: { mcc: "digital_goods", new_merchant: true },
    device: { age_days: 0, geo_jump_km: 0 },
    identity: { account_age_days: 20 },
    sequence: { probe_count: 8, interarrival_s: 60, regularity: 0.3, drain_after_probe: true },
  },
  {
    family: "card_testing_drain",
    amount: { base: 350, jitter: 0.2, drain_multiplier: 1.5 },
    velocity: { tx_per_hour: 12 },
    temporal: { start_hour_utc: 22, span_hours: 2 },
    merchant: { mcc: "electronics", new_merchant: true },
    device: { age_days: 0, geo_jump_km: 0 },
    identity: { account_age_days: 45 },
    sequence: { probe_count: 12, interarrival_s: 90, regularity: 0.4, drain_after_probe: true },
  },
  {
    family: "low_and_slow",
    amount: { base: 360, jitter: 0.25, drain_multiplier: 1 },
    velocity: { tx_per_hour: 3 },
    temporal: { start_hour_utc: 2, span_hours: 48 },
    merchant: { mcc: "online_retail", new_merchant: true },
    device: { age_days: 30, geo_jump_km: 0 },
    identity: { account_age_days: 90 },
    sequence: { probe_count: 0, interarrival_s: 14400, regularity: 0.2, drain_after_probe: false },
  },
  {
    family: "low_and_slow",
    amount: { base: 620, jitter: 0.15, drain_multiplier: 1 },
    velocity: { tx_per_hour: 4 },
    temporal: { start_hour_utc: 1, span_hours: 36 },
    merchant: { mcc: "electronics", new_merchant: true },
    device: { age_days: 40, geo_jump_km: 0 },
    identity: { account_age_days: 25 },
    sequence: { probe_count: 0, interarrival_s: 7200, regularity: 0.3, drain_after_probe: false },
  },
  {
    family: "mule_fanout",
    amount: { base: 280, jitter: 0.2, drain_multiplier: 1 },
    velocity: { tx_per_hour: 14 },
    temporal: { start_hour_utc: 14, span_hours: 24 },
    merchant: { mcc: "grocery", new_merchant: true },
    device: { age_days: 2, geo_jump_km: 0 },
    identity: { account_age_days: 18 },
    sequence: { probe_count: 0, interarrival_s: 300, regularity: 0.5, drain_after_probe: false },
  },
];

// [path, logScale, normalizer] — multiplicative dims compare on log scale so
// order-of-magnitude behavioural shifts register as real distance.
const NUM_DIMS: { path: string; log: boolean; norm: number }[] = [
  { path: "amount.base", log: true, norm: Math.log(2000) },
  { path: "amount.jitter", log: false, norm: 0.6 },
  { path: "amount.drain_multiplier", log: true, norm: Math.log(50) },
  { path: "velocity.tx_per_hour", log: true, norm: Math.log(40) },
  { path: "temporal.start_hour_utc", log: false, norm: 23 },
  { path: "temporal.span_hours", log: true, norm: Math.log(336) },
  { path: "device.age_days", log: true, norm: Math.log(3651) },
  { path: "device.geo_jump_km", log: false, norm: 20000 },
  { path: "identity.account_age_days", log: true, norm: Math.log(3651) },
  { path: "sequence.probe_count", log: false, norm: 20 },
  { path: "sequence.interarrival_s", log: true, norm: Math.log(60480) },
  { path: "sequence.regularity", log: false, norm: 1 },
];
const CAT_DIMS: [string, keyof Genome][] = [
  ["merchant.mcc", "merchant"],
  ["merchant.new_merchant", "merchant"],
  ["sequence.drain_after_probe", "sequence"],
];

function get(g: Genome, path: string): number {
  const [a, b] = path.split(".");
  return (g as unknown as Record<string, Record<string, number>>)[a][b];
}

/** Normalised behavioural distance in [0, ~15]; log-scaled where it matters. */
export function genomeDistance(a: Genome, b: Genome): number {
  let d = 0;
  for (const dim of NUM_DIMS) {
    const va = get(a, dim.path);
    const vb = get(b, dim.path);
    if (dim.log) {
      const la = Math.log(Math.max(1e-6, va));
      const lb = Math.log(Math.max(1e-6, vb));
      d += Math.abs(la - lb) / dim.norm;
    } else {
      d += Math.abs(va - vb) / dim.norm;
    }
  }
  for (const [path, obj] of CAT_DIMS) {
    if ((a[obj] as unknown as Record<string, unknown>)[path.split(".")[1]] !== (b[obj] as unknown as Record<string, unknown>)[path.split(".")[1]]) d += 1;
  }
  return d;
}

/** Novelty := valid config far from every known template. Threshold tau = 1.2. */
export function noveltyScore(genome: Genome): number {
  return Math.min(...TEMPLATE_GENOMES.map((t) => genomeDistance(t, genome)));
}
export const NOVELTY_TAU = 1.2;
export function isNovel(genome: Genome): boolean {
  return noveltyScore(genome) > NOVELTY_TAU;
}
