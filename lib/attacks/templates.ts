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

const NUM_DIMS: [keyof Genome | string, number][] = [
  ["amount.base", 2000],
  ["amount.jitter", 0.6],
  ["amount.drain_multiplier", 50],
  ["velocity.tx_per_hour", 40],
  ["temporal.start_hour_utc", 23],
  ["temporal.span_hours", 336],
  ["device.age_days", 3650],
  ["device.geo_jump_km", 20000],
  ["identity.account_age_days", 3650],
  ["sequence.probe_count", 20],
  ["sequence.interarrival_s", 604800],
  ["sequence.regularity", 1],
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

/** Normalised behavioural distance in [0, ~15]. */
export function genomeDistance(a: Genome, b: Genome): number {
  let d = 0;
  for (const [path, range] of NUM_DIMS) d += Math.abs(get(a, path) - get(b, path)) / range;
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
