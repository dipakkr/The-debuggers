/**
 * IDENTIFY layer: curated emerging GenAI-powered payment-fraud families.
 * High-level and DEFENSIVE only — behavioural abstractions, no operational
 * crime content. This corpus feeds the strategist in LIVE mode; DEMO mode
 * ships a pre-verified assessment through the same interface.
 */
export interface ThreatFamily {
  id: string;
  name: string;
  how_genai_changes_it: string;
  observable_signals: string[];
  existing_defense: string;
  potential_blind_spot: string;
  safe_synthetic_representation: string;
  selected: boolean;
}

export const THREAT_FAMILIES: ThreatFamily[] = [
  {
    id: "card_testing_drain",
    name: "Card testing → drain",
    how_genai_changes_it: "Generative agents vary probe amounts, timing and merchant mix automatically after every rejection.",
    observable_signals: ["micro-amount bursts", "velocity spikes", "sudden large cash-out"],
    existing_defense: "Velocity rules + probe-sequence features",
    potential_blind_spot: "Few-probe variants that jump straight to moderate escalation",
    safe_synthetic_representation: "Synthetic identities probing synthetic merchants; bounded genome parameters",
    selected: true,
  },
  {
    id: "low_and_slow",
    name: "Low-and-slow camouflage",
    how_genai_changes_it: "LLM planners tune spend to sit under thresholds and mimic human cadence across long horizons.",
    observable_signals: ["sub-threshold steady spend", "regular inter-arrivals", "flat ticket sizes"],
    existing_defense: "Threshold-based scoring on amount/velocity anomalies",
    potential_blind_spot: "Point-wise detectors see only mild individual signals",
    safe_synthetic_representation: "Simulated cadence profiles over synthetic accounts",
    selected: true,
  },
  {
    id: "mule_fanout",
    name: "Mule-network fan-out",
    how_genai_changes_it: "Coordinated synthetic identity generation at scale; batch-minted accounts converge on cash-out points.",
    observable_signals: ["newcomer convergence at one merchant", "identity-batch coherence", "homogeneous tickets"],
    existing_defense: "Account-age flags, per-customer velocity",
    potential_blind_spot: "Per-account behaviour looks normal; structure lives BETWEEN accounts",
    safe_synthetic_representation: "Bipartite customer→merchant graph over synthetic population",
    selected: true,
  },
  {
    id: "synthetic_identity",
    name: "Synthetic identity fabrication",
    how_genai_changes_it: "Generated personas pass documentary checks; credit histories are farmed patiently.",
    observable_signals: ["young accounts", "thin files", "burst activity after quiet period"],
    existing_defense: "KYC + bureau checks",
    potential_blind_spot: "Behaviourally mature synthetic files",
    safe_synthetic_representation: "Age/thin-file distributions in the simulator",
    selected: false,
  },
  {
    id: "ato",
    name: "Account takeover behaviours",
    how_genai_changes_it: "Personalized lures at scale; credential-stuffing agents adapt pacing to defenses.",
    observable_signals: ["geo jumps", "new device + drain pattern"],
    existing_defense: "Device fingerprinting, step-up auth",
    potential_blind_spot: "Warmed-device takeovers",
    safe_synthetic_representation: "Device-warming parameter in the genome",
    selected: false,
  },
  {
    id: "velocity_camouflage",
    name: "Adaptive velocity camouflage",
    how_genai_changes_it: "Attack agents reshape inter-arrival times after each block to defeat rate rules.",
    observable_signals: ["reshaped gaps", "burst-and-pause patterns"],
    existing_defense: "Fixed-window velocity caps",
    potential_blind_spot: "Pacing below rule windows",
    safe_synthetic_representation: "Interarrival dimension of the genome",
    selected: false,
  },
  {
    id: "transaction_splitting",
    name: "Transaction splitting",
    how_genai_changes_it: "Automatic decomposition of large fraud into many just-under-limit payments.",
    observable_signals: ["repeated near-limit amounts"],
    existing_defense: "Amount ceilings, cumulative daily limits",
    potential_blind_spot: "Splits spread across merchants/channels",
    safe_synthetic_representation: "Split-count parameter in the genome",
    selected: false,
  },
  {
    id: "social_eng_personalization",
    name: "AI-personalized social engineering",
    how_genai_changes_it: "Perfectly tailored scam scripts per victim at zero marginal cost.",
    observable_signals: ["out-of-band payment requests"],
    existing_defense: "User education, confirmation friction",
    potential_blind_spot: "Authorized-push-payment fraud is hard to score pre-payment",
    safe_synthetic_representation: "Out of scope for transaction-level twin (documented)",
    selected: false,
  },
  {
    id: "kyc_manipulation",
    name: "KYC document manipulation",
    how_genai_changes_it: "Generated documents defeat manual review.",
    observable_signals: ["document-level anomalies"],
    existing_defense: "Document forensics",
    potential_blind_spot: "Not transaction-signal visible",
    safe_synthetic_representation: "Out of scope for transaction-level twin (documented)",
    selected: false,
  },
  {
    id: "autonomous_iteration",
    name: "Autonomous attack iteration",
    how_genai_changes_it: "End-to-end agent loops: hypothesize → execute → observe → mutate, faster than defenders label data.",
    observable_signals: ["cross-attempt behavioural drift"],
    existing_defense: "Periodic model retraining",
    potential_blind_spot: "The gap between retraining cycles",
    safe_synthetic_representation: "This arena's entire loop — safely, against our own detector",
    selected: true,
  },
];

/** Pre-verified assessment used by DEMO mode (same shape as LLM output). */
export const DEMO_ASSESSMENT = {
  headline:
    "Three families show the strongest GenAI-driven escalation this cycle: coordinated mule fan-out (batched identity creation), metronomic low-and-slow camouflage, and adaptive card-testing. All three stress point-wise detectors because their per-transaction signal is individually mild.",
  selected_ids: ["mule_fanout", "low_and_slow", "card_testing_drain"],
  rationale:
    "Selected for payment relevance, transaction-level observability, safe simulation feasibility, and coverage of different detector components (graph structure, sequence shape, classic burst).",
};
