import { z } from "zod";

export const ATTACK_FAMILIES = [
  "card_testing_drain",
  "low_and_slow",
  "mule_fanout",
  "account_takeover",
  "transaction_splitting",
] as const;
export type AttackFamily = (typeof ATTACK_FAMILIES)[number];

export const MCCS = [
  "grocery",
  "fuel",
  "restaurant",
  "electronics",
  "travel",
  "online_retail",
  "digital_goods",
  "luxury",
] as const;

/**
 * Fraud Genome: the ONLY bounded behavioural parameter space the red team
 * may operate in. Every field range is enforced by this schema. The LLM
 * proposes values inside these bounds; it can never express arbitrary
 * executable behaviour.
 */
export const GenomeSchema = z.object({
  family: z.enum(ATTACK_FAMILIES),
  amount: z.object({
    base: z.number().min(1).max(2000),
    jitter: z.number().min(0).max(0.6),
    drain_multiplier: z.number().min(1).max(50),
  }),
  velocity: z.object({
    tx_per_hour: z.number().min(1).max(40),
  }),
  temporal: z.object({
    start_hour_utc: z.number().int().min(0).max(23),
    span_hours: z.number().min(1).max(336),
  }),
  merchant: z.object({
    mcc: z.enum(MCCS),
    new_merchant: z.boolean(),
  }),
  device: z.object({
    age_days: z.number().min(0).max(3650),
    geo_jump_km: z.number().min(0).max(20000),
  }),
  identity: z.object({
    account_age_days: z.number().min(0).max(3650),
  }),
  sequence: z.object({
    probe_count: z.number().int().min(0).max(20),
    interarrival_s: z.number().min(10).max(604800),
    regularity: z.number().min(0).max(1),
    drain_after_probe: z.boolean(),
  }),
  /** Account-takeover dimensions. Defaulted so older genomes and LLM output
   *  that omit them still parse; every value stays inside hard bounds. */
  takeover: z
    .object({
      /** ride an EXISTING legitimate customer's account instead of minting a
       *  fresh synthetic identity — the defining property of real ATO */
      victim_reuse: z.boolean(),
      /** small balance-probing payments before the cash-out */
      recon_tx_count: z.number().int().min(0).max(10),
      /** hours of dormancy between takeover and cash-out */
      dwell_hours: z.number().min(0).max(168),
    })
    .default({ victim_reuse: false, recon_tx_count: 0, dwell_hours: 0 }),
  /** Structuring dimensions: decompose one large value into many small ones. */
  split: z
    .object({
      count: z.number().int().min(1).max(20),
      /** distinct merchants the split is spread across */
      merchant_spread: z.number().int().min(1).max(8),
      /** each leg is placed this far below the ceiling it is dodging */
      ceiling_ratio: z.number().min(0.5).max(0.99),
    })
    .default({ count: 1, merchant_spread: 1, ceiling_ratio: 0.9 }),
});
export type Genome = z.infer<typeof GenomeSchema>;

export const ScenarioSchema = z.object({
  scenario_id: z.string().regex(/^AF-\d{4,}$/),
  parent_scenario_id: z.string().regex(/^AF-\d{4,}$/).nullable(),
  generation: z.number().int().nonnegative(),
  family: z.enum(ATTACK_FAMILIES),
  genome: GenomeSchema,
  hypothesis: z.string().min(10).max(2000),
  seed: z.number().int().nonnegative(),
  created_at: z.string(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export type Decision = "allow" | "review" | "block";
export type GroundTruth = "legit" | "fraud";

export interface TxFeatures {
  amt_z: number;
  vel_1h: number;
  vel_24h: number;
  hour_outside_pref: number;
  new_device: number;
  new_merchant: number;
  probe_count_24h: number;
  young_account: number;
  escalation_score: number;
  pattern_score: number;
  fan_out_24h: number;
  /** distinct OTHER customers whose FIRST-EVER payment at this merchant
   *  occurred within the trailing 48h — a bipartite graph burst signal. */
  newcomer_count_48h: number;
  /** convergence × identity-batch coherence × ticket homogeneity ∈ [0,1] */
  newcomer_burst_score: number;
  /** 1 when this payment's country was never seen before for this customer */
  geo_anomaly: number;
  /** count of trailing-24h payments by this customer that sit in a narrow band
   *  just under a round reporting/limit ceiling — the structuring tell */
  near_limit_repeat_24h: number;
  /** distinct merchants this customer paid in the trailing 24h */
  merchant_spread_24h: number;
  /** dormancy (hours since previous payment) capped at one week */
  dormancy_h: number;
}

export type TxKind = "backdrop" | "warmup" | "attack";

export interface Transaction {
  tx_id: string;
  ts_ms: number;
  amount: number;
  currency: "USD";
  customer_id: string;
  account_id: string;
  token_id: string;
  session_id: string;
  account_age_days: number;
  merchant_id: string;
  mcc: string;
  device_id: string;
  channel: "card_present" | "ecommerce";
  country: string;
  scenario_id: string;
  kind: TxKind;
  ground_truth: GroundTruth;
}

/** v2 defense knobs. All bounded; blue proposals are validated against this schema. */
export const DefenseConfigSchema = z
  .object({
    threshold: z.number().min(0.2).max(0.95),
    escalation_weight: z.number().min(0).max(0.6),
    pattern_weight: z.number().min(0).max(0.6),
    graph_weight: z.number().min(0).max(0.6),
    /** repeated near-ceiling legs sprayed across storefronts (structuring) */
    structuring_weight: z.number().min(0).max(0.6).default(0),
    /** unfamiliar device + geography after dormancy on an established account */
    takeover_weight: z.number().min(0).max(0.6).default(0),
  })
  .strict();
export type DefenseConfig = z.infer<typeof DefenseConfigSchema>;

/** v1 baseline expressed as a (no-op) defense config. */
export const V1_AS_DEFENSE = (thresholdBlock: number): DefenseConfig => ({
  threshold: thresholdBlock,
  escalation_weight: 0,
  pattern_weight: 0,
  graph_weight: 0,
  structuring_weight: 0,
  takeover_weight: 0,
});

export const ProposalSchema = z.object({
  failure_hypothesis: z.string().min(10).max(1500),
  evidence: z.array(z.string()).max(12),
  candidate_features: z.array(z.string()).max(8),
  recommended_change: z.string().max(800),
  defense_config: DefenseConfigSchema,
  expected_tradeoff: z.string().max(400),
  confidence: z.number().min(0).max(1),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const ExperimentKindSchema = z.enum([
  "generation",
  "blind_spot",
  "gate",
  "replay",
  "bench",
]);
export type ExperimentKind = z.infer<typeof ExperimentKindSchema>;

export interface Versions {
  dataset_version: string;
  attack_version: string;
  detector_version: string;
  defense_version: string;
  reasoning_version: string;
}

export const VERSIONS: Versions = {
  dataset_version: "synth-pop-1.3.0",
  attack_version: "genome-1.2.0",
  detector_version: "risk-engine-1.1.0",
  defense_version: "risk-engine-2.0.0",
  reasoning_version: "demo-policy-v1",
};

export function versionStamp(
  mode: "demo" | "live",
  defenseVersion = VERSIONS.defense_version
): Versions {
  return {
    ...VERSIONS,
    defense_version: defenseVersion,
    reasoning_version:
      mode === "live" ? process.env.ARENA_MODEL ?? "gpt-5" : "demo-policy-v1",
  };
}

export interface ExperimentRow {
  experiment_id: string;
  ts: string;
  kind: ExperimentKind;
  scenario_id?: string;
  parent_scenario_id?: string | null;
  seed?: number;
  versions: Versions;
  metrics?: Record<string, number>;
  decision?: string;
  notes?: string;
}

export interface MetricsResult {
  fraud_recall: number;
  /** recall counting a manual-review hold as a catch (see docs/methodology.md) */
  recall_with_review: number;
  roc_auc: number;
  precision: number;
  f1: number;
  fpr: number;
  fnr: number;
  review_rate: number;
  average_precision: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  n_legit: number;
  n_fraud: number;
}

export interface DetectionOutput {
  risk_score: number;
  decision: Decision;
  reason_codes: string[];
  latency_ms: number;
}
