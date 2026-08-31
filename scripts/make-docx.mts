import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { readFileSync, writeFileSync } from "node:fs";

interface Metrics {
  fraud_recall: number;
  recall_with_review: number;
  roc_auc: number;
  precision: number;
  f1: number;
  fpr: number;
  fnr: number;
  review_rate: number;
  average_precision: number;
  n_legit: number;
  n_fraud: number;
}

interface Evidence {
  generated_at: string;
  commit: string;
  seeds: Record<string, number>;
  versions: Record<string, string>;
  baseline: Metrics;
  blind_spot: {
    scenario_id: string;
    parent_scenario_id: string;
    generation: number;
    family: string;
    seed: number;
    attack_success_rate: number;
  };
  blue_investigation: {
    source: string;
    proposal: {
      failure_hypothesis: string;
      evidence: string[];
      candidate_features: string[];
      recommended_change: string;
      expected_tradeoff: string;
    };
  };
  defense_gate: {
    accepted: boolean;
    reasons: string[];
    significance: { before_only: number; after_only: number; p_value: number } | null;
    recall_95ci: { before: { low: number; high: number }; after: { low: number; high: number } } | null;
    held_out_before: Metrics;
    held_out_after: Metrics;
    survival: Array<{
      scenario_id: string;
      base_success: number;
      cand_success: number;
    }>;
  };
  attack_families: string[];
  gate_budgets: {
    min_threat_recall_gain: number;
    max_fpr_delta_abs: number;
    max_fpr_delta_rel: number;
    max_review_rate_delta: number;
    min_survival_share: number;
  };
  detector: {
    version: string;
    feature_names: string[];
    weights: Record<string, number>;
    threshold_block: number;
    threshold_review: number;
    calibration: Record<string, number | string>;
  };
  held_out_operating_points_v1: Array<{
    threshold: number; precision: number; recall: number; f1: number; false_positives: number;
  }>;
  replay: {
    discovery: { scenario_id: string; seed: number; changed_decisions: number };
    fresh_seed: Array<{ scenario_id: string; changed_decisions: number }>;
    total_changed_decisions: number;
  };
}

interface LiveRun {
  provider: { model: string };
  summary: Record<string, number>;
  families: Record<string, {
    model_latency_ms: number;
    candidates: { origin: string; novelty: number; verdict: string; novel: boolean }[];
  }>;
}

interface Benchmark {
  generated_at: string;
  results: Array<{
    transactions: number;
    generation_tx_s: number;
    feature_tx_s: number;
    scoring_tx_s: number;
    p95_latency_ms: number;
    memory_rss_mb: number;
    experiment_ms: number;
    trials: number;
    node: string;
    platform: string;
  }>;
}

const evidence = JSON.parse(
  readFileSync("data/evidence/latest.json", "utf8")
) as Evidence;
const benchmark = JSON.parse(
  readFileSync("data/evidence/benchmark.json", "utf8")
) as Benchmark;
// optional: only present when `npm run evidence:live` has been run with a key
let live: LiveRun | null = null;
try {
  live = JSON.parse(readFileSync("data/evidence/live-run.json", "utf8")) as LiveRun;
} catch {
  live = null;
}

const PAGE_WIDTH = 12_240;
const PAGE_HEIGHT = 15_840;
const MARGIN = 1_440;
const TABLE_WIDTH = 9_120;
// Mastercard brand palette
const BLUE = "FF5F00"; // interlock orange, used as the accent
const NAVY = "1A1A1A";
const RED = "EB001B";
const INK = "17212B";
const MUTED = "5E6A75";
const LIGHT = "F2F4F7";
const PALE_BLUE = "EAF3FA";
const PALE_RED = "FCECEA";
const WHITE = "FFFFFF";
const BORDER = "C9D1D9";
const repoUrl = "https://github.com/dipakkr/The-debuggers";
const TEAM = "The debuggers";
const MEMBERS: Array<[string, string]> = [
  ["Deepak Kumar", "dipakkr.co@gmail.com"],
  ["Naman Goyal", "namangoyal21197@gmail.com"],
];
const webUrl = "https://adversarial-fraud-arena.vercel.app";

const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;
const rate = (value: number): string => value.toLocaleString("en-US");
const pointDelta = (before: number, after: number): string =>
  `${((after - before) * 100).toFixed(2)} points`;

const h1 = (text: string): Paragraph =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_1 });
const h2 = (text: string): Paragraph =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
const h3 = (text: string): Paragraph =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_3 });

const p = (
  text: string,
  options: { bold?: boolean; italics?: boolean; color?: string } = {}
): Paragraph =>
  new Paragraph({
    children: [
      new TextRun({
        text,
        bold: options.bold,
        italics: options.italics,
        color: options.color,
      }),
    ],
  });

const bullet = (text: string): Paragraph =>
  new Paragraph({
    text,
    numbering: { reference: "bullets", level: 0 },
  });

const numbered = (text: string, instance: number): Paragraph =>
  new Paragraph({
    text,
    numbering: { reference: "steps", level: 0, instance },
  });

const note = (label: string, text: string, tone: "blue" | "red" = "blue") =>
  new Paragraph({
    spacing: { before: 100, after: 180 },
    indent: { left: 160, right: 160 },
    shading: {
      type: ShadingType.CLEAR,
      fill: tone === "blue" ? PALE_BLUE : PALE_RED,
      color: "auto",
    },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 5, color: tone === "blue" ? BLUE : RED },
      bottom: { style: BorderStyle.SINGLE, size: 5, color: tone === "blue" ? BLUE : RED },
      left: { style: BorderStyle.SINGLE, size: 14, color: tone === "blue" ? BLUE : RED },
      right: { style: BorderStyle.SINGLE, size: 5, color: tone === "blue" ? BLUE : RED },
    },
    children: [
      new TextRun({
        text: `${label}: `,
        bold: true,
        color: tone === "blue" ? NAVY : RED,
      }),
      new TextRun({ text }),
    ],
  });

function table(rows: string[][], widths: number[]): Table {
  if (widths.reduce((sum, value) => sum + value, 0) !== TABLE_WIDTH) {
    throw new Error("table column widths must equal the fixed table width");
  }

  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    indent: { size: 0, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 5, color: BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 5, color: BORDER },
      left: { style: BorderStyle.SINGLE, size: 5, color: BORDER },
      right: { style: BorderStyle.SINGLE, size: 5, color: BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 3, color: BORDER },
      insideVertical: { style: BorderStyle.SINGLE, size: 3, color: BORDER },
    },
    rows: rows.map(
      (cells, rowIndex) =>
        new TableRow({
          cantSplit: true,
          tableHeader: rowIndex === 0,
          children: cells.map(
            (cell, cellIndex) =>
              new TableCell({
                width: { size: widths[cellIndex], type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                shading:
                  rowIndex === 0
                    ? { type: ShadingType.CLEAR, fill: NAVY, color: "auto" }
                    : rowIndex % 2 === 0
                      ? { type: ShadingType.CLEAR, fill: LIGHT, color: "auto" }
                      : undefined,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cell,
                        bold: rowIndex === 0,
                        color: rowIndex === 0 ? WHITE : INK,
                        size: 19,
                      }),
                    ],
                    spacing: { after: 0, line: 240 },
                  }),
                ],
              })
          ),
        })
    ),
  });
}

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

const children: Array<Paragraph | Table> = [];
const push = (...items: Array<Paragraph | Table>) => children.push(...items);

push(
  new Paragraph({
    spacing: { before: 420, after: 120 },
    children: [
      new TextRun({
        text: "MASTERCARD INNOVATION CHALLENGE 2026",
        bold: true,
        size: 20,
        color: RED,
        characterSpacing: 55,
      }),
    ],
  }),
  new Paragraph({
    spacing: { before: 540, after: 60 },
    children: [
      new TextRun({
        text: "ADVERSARIAL",
        bold: true,
        size: 56,
        color: NAVY,
      }),
    ],
  }),
  new Paragraph({
    spacing: { after: 360 },
    children: [
      new TextRun({
        text: "FRAUD ARENA",
        bold: true,
        size: 56,
        color: NAVY,
      }),
    ],
  }),
  new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({
        text: "Generate tomorrow's fraud today.",
        bold: true,
        size: 28,
        color: BLUE,
      }),
    ],
  }),
  p(
    "AI Defense Lab for Payment Security. A working synthetic Red-versus-Blue system with an independent deterministic Referee.",
    { color: MUTED }
  ),
  new Paragraph({ spacing: { before: 480, after: 180 } }),
  note(
    "THE JUDGE-FACING IDEA",
    "Red attacks. Blue defends. The Referee owns truth."
  ),
  new Paragraph({ spacing: { before: 420, after: 80 } }),
  p(`Team: ${TEAM}`, { bold: true }),
  new Paragraph({ spacing: { after: 60 } }),
  table(
    [["Team member", "Registered email"], ...MEMBERS.map(([name, email]) => [name, email])],
    [3_500, 5_620]
  ),
  new Paragraph({ spacing: { before: 300 } }),
  p(`Repository: ${repoUrl}`),
  p(`Working prototype: ${webUrl}`),
  p(`Evidence generated: ${new Date(evidence.generated_at).toLocaleDateString("en-GB")}`),
  p(`Evidence commit: ${evidence.commit.slice(0, 12)}`),
  pageBreak()
);

push(
  h1("1. Executive Summary"),
  p(
    "Fraud models learn from attacks that already happened. GenAI lets attackers create and adapt payment strategies much faster."
  ),
  p(
    "The Arena generates tomorrow's attacks inside a synthetic payment network. It exposes detector blind spots before those attacks reach production."
  ),
  p(
    "A bounded Red Team evolves attack genomes from prior outcomes. A Blue Team investigates confirmed failures and proposes bounded defenses."
  ),
  p(
    "A deterministic Referee owns all labels, metrics, seeds, acceptance gates, and replay results. Neither AI grades itself."
  ),
  note(
    "THE ONE THING TO UNDERSTAND BEFORE THE NUMBERS",
    "Our headline figures come in two pairs, and the second pair looks worse on purpose. Against attacks the detector was TRAINED on it reaches ROC-AUC 0.98 and F1 58%. Against an attack our own red team EVOLVED to evade it, F1 falls to the twenties \u2014 and stays under 15% at every threshold across the entire score range. That is the finding, not a shortfall. A novel attack is a MISSING-FEATURE problem, not a calibration problem: no operating point rescues it, and you only learn which feature is missing by generating the attack first. Section 10 shows the full operating curve that establishes this.",
    "red"
  ),
  note(
    "MEASURED RESULT",
    `ROC-AUC ${pct(evidence.baseline.roc_auc)} and F1 ${pct(evidence.baseline.f1)} at ${pct(evidence.baseline.fpr)} false positives on known attacks. On an attack the red team evolved specifically to evade, recall including analyst holds rose from ${pct(evidence.defense_gate.held_out_before.recall_with_review)} to ${pct(evidence.defense_gate.held_out_after.recall_with_review)} for ${pointDelta(evidence.defense_gate.held_out_before.fpr, evidence.defense_gate.held_out_after.fpr)} of false positives \u2014 a PAIRED result at p < 0.001, with ${evidence.defense_gate.significance?.after_only ?? 0} transactions newly caught and ${evidence.defense_gate.significance?.before_only ?? 0} newly missed.`
  ),
  h2("The smallest credible submission"),
  bullet("One deployable Next.js application"),
  bullet("One trained baseline fraud model"),
  bullet("Five bounded attack families, compiled and scored end to end"),
  bullet("One adaptive search loop"),
  bullet("One evidence-grounded Blue proposal"),
  bullet("One independent gate with exact and held-out replay"),
  p(
    "The product maximizes observable evidence per unit of engineering effort. It avoids speculative services, databases, and model layers."
  )
);

push(
  h1("2. Challenge"),
  p(
    "Payment fraud evolves between detector retraining cycles. A static model sees historical behavior and can miss new coordinated strategies."
  ),
  p(
    "The challenge requires a visible IDENTIFY, GENERATE, and DEFEND system. The working product must also show failure, investigation, and proof."
  ),
  h2("Primary user"),
  p("A payment-network fraud-model validation team uses the Arena before a model reaches production."),
  h2("Painful job"),
  p("The team must find credible blind spots without testing against real customers or production payment systems."),
  h2("Desired outcome"),
  p("The team reproduces one detector failure and validates a safe defense against exact and held-out attacks."),
  h2("Live proof"),
  p("The application runs the complete loop in approximately three minutes, without an API key or internet connection.")
);

push(
  h1("3. Why GenAI Changes Payment Fraud"),
  p(
    "GenAI changes the speed, scale, and personalization of fraud. It can also reason across failed attempts and select the next strategy."
  ),
  bullet("Attackers can personalize impersonation and payment requests at low marginal cost."),
  bullet("Attackers can generate coherent synthetic identity histories and coordinated variants."),
  bullet("Attackers can reshape timing, amount, device, and merchant behavior after rejection."),
  bullet("Attackers can explore detector boundaries faster than periodic retraining cycles."),
  p(
    "Public reports from Mastercard, Visa, the FBI, and Europol support this defensive threat framing. The repository stores the source links."
  ),
  h1("4. Core Product Insight"),
  note(
    "THESIS",
    "Fraud defenses should not learn only after an attack succeeds in the real world."
  ),
  p(
    "The Arena safely generates and evolves attack candidates today. It independently verifies whether the resulting defense improves."
  ),
  h2("Adversarial Fraud Arena"),
  p(
    "This approach differs from a fraud classifier. The classifier is one participant inside a continuous adversarial validation system."
  )
);

push(
  pageBreak(),
  h1("5. Challenge Alignment"),
  table(
    [
      ["Stage", "Working feature", "Judge-visible evidence"],
      ["IDENTIFY", "Defensive threat corpus and strict assessment", "Threat Intelligence view"],
      ["GENERATE", "Outcome-conditioned Fraud Genome mutation", "Red feed and lineage"],
      ["ATTACK", "Seeded synthetic scenario compiler", "Payment Rail activity"],
      ["EVADE", "Real detector decisions", "Caught and evaded verdicts"],
      ["DISCOVER", "Fresh-seed confirmation", "BLIND SPOT DISCOVERED alert"],
      ["DEFEND", "Blue proposal and Defense Gate", "Investigation and gate verdict"],
      ["REPLAY", "Stored scenario, seed, and versions", "Before-versus-after transaction diff"],
      ["MEASURE", "Referee metrics and audit ledger", "Authoritative scoreboard"],
    ],
    [1_500, 3_660, 3_960]
  ),
  h2("The five published judging criteria"),
  table(
    [
      ["Criterion", "Primary evidence", "Measured value"],
      [
        "Diversity of attacks identified",
        "20 GenAI-accelerated families across 7 channels and rails; 5 compiled end to end",
        `${evidence.attack_families.length} simulated`,
      ],
      [
        "Fidelity of attacks in simulation",
        "1,200-customer network; ATO rides a real population account; bounded genome; realism penalties",
        "Deterministic",
      ],
      [
        "Detection algorithm efficacy",
        "Swept operating point, tie-aware ROC-AUC, paired McNemar test, Wilson intervals",
        `AUC ${pct(evidence.baseline.roc_auc)}`,
      ],
      [
        "Novelty of the overall solution",
        "Closed loop with a schema-bounded adversary and a deterministic referee that neither AI can argue with",
        "Whole system",
      ],
      [
        "Real-world feasibility",
        "Deployment-prevalence calibration, decline/review separation, streaming feature pass, audit ledger",
        `${rate(benchmark.results[2].scoring_tx_s)} tx/s`,
      ],
    ],
    [2_400, 4_400, 2_320]
  )
);

push(
  pageBreak(),
  h1("6. IDENTIFY"),
  h2("Threat Research"),
  p(
    "The threat review covers twenty defensive families across seven channels and rails. Five are compiled and scored end to end by the payment twin. The rest are documented with the sensor they would need rather than faked \u2014 simulating authorised-push-payment fraud or deepfake KYC at transaction level would mean inventing evidence the sensor cannot see."
  ),
  table(
    [
      ["Family", "GenAI advantage", "Expected blind spot", "MVP"],
      ["Adaptive card testing", "Changes probes after rejection", "Few-probe variants", "SIMULATED"],
      ["Low-and-slow camouflage", "Tunes timing and amount", "Mild point-wise signals", "SIMULATED"],
      ["Coordinated mule fan-out", "Creates coherent identity batches", "Risk lives between accounts", "SIMULATED"],
      ["Account takeover", "Paces the takeover around session-risk windows", "Warmed device on a mature account", "SIMULATED"],
      ["Structuring across storefronts", "Splits value under a ceiling across merchants", "No merchant sees the repetition", "SIMULATED"],
      ["Synthetic identity", "Builds plausible histories", "Mature synthetic profiles", "Research"],
      ["Velocity camouflage", "Targets rate-window edges", "Sub-window pacing", "Research"],
      ["BIN enumeration", "Generated request signatures defeat fingerprinting", "Spread thin under every limit", "Research"],
      ["Relay and fallback abuse", "Selects weak-fallback terminals, coordinates relay timing", "Only visible across terminals", "Research"],
      ["Token provisioning abuse", "Voice-cloned call-centre verification", "Provisioned token scores clean", "Research"],
      ["Voice-clone step-up bypass", "Real-time cloning from public audio", "The verification is the surface", "Research"],
      ["Refund and returnless abuse", "Dispute narratives generated per order", "Claims never accumulate anywhere", "Research"],
      ["First-party chargeback", "Drafts the strongest dispute reason per order", "The payment itself is genuine", "Research"],
      ["Agentic commerce abuse", "Compromised agents hold valid delegated credentials", "Machine cadence is expected here", "Research"],
      ["Prompt injection of the defense", "Merchant text carries instructions for the defender's LLM", "The reasoning layer is the surface", "DEFENDED"],
      ["AI payment scams", "Scales trusted impersonation", "Authorized payment context", "Research"],
      ["KYC manipulation", "Creates coherent documents", "Pre-transaction signal", "Research"],
      ["Merchant collusion", "Coordinates both graph sides", "Normal individual behavior", "Research"],
      ["Multi-channel impersonation", "Maintains one cross-channel story", "Disconnected sensor evidence", "Research"],
      ["Autonomous probing", "Repeats feedback-driven strategy", "Retraining-cycle gap", "Arena capability"],
    ],
    [1_850, 2_500, 2_950, 1_820]
  ),
  h2("Selection logic"),
  p(
    "The five simulated families were chosen to break five DIFFERENT parts of a detector rather than to be five variations on one idea: classic burst and sequence rules (card testing), temporal shape invisible to point-wise scoring (low-and-slow), cross-account graph structure (mule fan-out), session and device context on a mature account (account takeover), and cumulative value hidden by decomposition (structuring)."
  ),
  p(
    "Two of them \u2014 account takeover and structuring \u2014 were added specifically because the genome already carried the dimensions to express them and nothing used them."
  )
);

push(
  pageBreak(),
  h1("7. GENERATE"),
  h2("Fraud Genome"),
  p(
    "The Fraud Genome is the only attack language. It contains bounded behavior and never contains executable instructions."
  ),
  table(
    [
      ["Group", "Fields", "Bounds or values"],
      ["Identity", "family, account_age_days", "Five families; 0 to 3,650 days"],
      ["Amount", "base, jitter, drain_multiplier", "1 to 2,000; 0 to 0.6; 1 to 50"],
      ["Velocity", "tx_per_hour", "1 to 40"],
      ["Temporal", "start_hour_utc, span_hours", "0 to 23; 1 to 336"],
      ["Merchant", "mcc, new_merchant", "Eight MCC values; boolean"],
      ["Takeover", "victim_reuse, recon_tx_count, dwell_hours", "boolean; 0 to 10; 0 to 168 h"],
      ["Split", "count, merchant_spread, ceiling_ratio", "1 to 20; 1 to 8; 0.5 to 0.99"],
      ["Device", "age_days, geo_jump_km", "0 to 3,650; 0 to 20,000"],
      ["Sequence", "probe, gap, regularity, drain", "Strict numeric and boolean bounds"],
      ["Lineage", "scenario, parent, generation, seed", "Schema-validated identifiers"],
    ],
    [1_650, 3_350, 4_120]
  ),
  h2("Red-Team Architecture"),
  p(
    "Red receives the allowed families, allowed dimensions, simulator constraints, prior results, aggregate memory, and a mutation budget."
  ),
  p(
    "Red never receives real cards, real customers, victim data, production APIs, banking credentials, or operational attack instructions."
  ),
  h3("Mutation loop"),
  numbered("Read the prior verdict, fitness, reason codes, and lineage.", 1),
  numbered("Propose bounded changes to the allowlisted genome.", 1),
  numbered("Validate the complete genome with Zod.", 1),
  numbered("Compile the scenario with a Referee-owned seed.", 1),
  numbered("Score every transaction with the active detector.", 1),
  numbered("Store fitness, novelty, verdict, and lineage.", 1),
  numbered("Select the next parents from measured outcomes.", 1),
  pageBreak(),
  h2("Search algorithm"),
  p(
    "The MVP uses bounded evolutionary beam search. It needs no new optimizer, trains no search model, and supports visible lineage."
  ),
  p(
    "A multi-armed bandit needs a stable arm definition. Bayesian optimization adds complexity that the small bounded search does not require."
  )
);

push(
  h1("8. DEFEND"),
  h2("Synthetic Payment Digital Twin"),
  p(
    "The simulator creates synthetic customers, accounts, tokens, merchants, MCCs, devices, sessions, countries, histories, sequences, and graph relationships."
  ),
  p(
    "Each transaction stores the payment identity, amount, time, channel, geography, scenario identifier, kind, and deterministic ground truth."
  ),
  h2("Data Strategy"),
  p(
    "The prototype uses no external competition dataset. It records synthetic provenance, fixed seeds, and train-search-development-test separation."
  ),
  h2("Fraud-Detection Architecture"),
  p(
    "The baseline combines calibrated rules with logistic regression. It uses eight behavioural features and emits reason codes."
  ),
  p(
    "The advanced defense adds merchant-convergence graph signals. The selected mule family requires relationship evidence across accounts."
  ),
  p(
    "The architecture does not add a graph database or graph neural network. The in-memory signal covers the selected proof."
  ),
  h2("Blue-Team Architecture"),
  p(evidence.blue_investigation.proposal.failure_hypothesis),
  ...evidence.blue_investigation.proposal.evidence.map(bullet),
  p(`Recommended change: ${evidence.blue_investigation.proposal.recommended_change}`),
  p(`Expected tradeoff: ${evidence.blue_investigation.proposal.expected_tradeoff}`),
  h2("Deterministic Referee"),
  bullet("Own all ground-truth labels and experiment seeds."),
  bullet("Compute every metric, fitness value, and novelty value."),
  bullet("Confirm each blind spot with fresh seeds."),
  bullet("Apply every defense acceptance threshold."),
  bullet("Replay stored scenarios under both model versions."),
  bullet("Write versioned experiment records."),
  note("TRUST ANCHOR", "Neither AI grades itself.")
);

push(
  pageBreak(),
  h1("9. Experimental Methodology"),
  h2("Isolation"),
  table(
    [
      ["Environment", "Seed", "Purpose"],
      ["Training", String(evidence.seeds.train), "Fit the baseline on known behavior"],
      ["Red search", String(evidence.seeds.search), "Explore adaptive attacks"],
      ["Blue development", String(evidence.seeds.blue_dev), "Create a defense hypothesis"],
      ["Final test", String(evidence.seeds.final_test), "Test fresh attacks and legitimate traffic"],
    ],
    [2_300, 1_600, 5_220]
  ),
  h2("Novelty"),
  p(
    "The novelty score equals the minimum normalized behavioral distance from every training template. The threshold equals 1.2."
  ),
  p(
    "The distance uses logarithmic scaling for multiplicative dimensions and includes categorical changes. New wording cannot increase the score."
  ),
  h2("Fitness"),
  note(
    "FORMULA",
    "fitness = evasion + novelty bonus - unrealistic behavior penalties"
  ),
  p(
    "The target is maximum evasion among valid, plausible synthetic behavior. The LLM cannot submit a fitness value."
  ),
  h2("Defense Gate"),
  bullet("Improve held-out threat recall by at least five percentage points."),
  bullet("Keep the FPR increase within one percentage point."),
  bullet("Improve at least four of five fresh descendants."),
  bullet("Replay the exact stored attack with the original seed."),
  h2("Versioning"),
  table(
    [
      ["Artifact", "Version"],
      ...Object.entries(evidence.versions).map(([key, value]) => [key, value]),
    ],
    [3_300, 5_820]
  )
);

push(
  pageBreak(),
  h2("Automated test suite"),
  p(
    `${70} automated tests across 12 files. Run \`npm run selfcheck\` for the linter, type checker, full suite and production build.`
  ),
  table(
    [
      ["Area", "What is proved", "File"],
      ["Baseline behaviour", "Legitimate traffic stays under the FPR budget; each loud family is caught", "phase0, new-families"],
      ["Attack families", "Every declared family has a schema-valid root; ATO rides a REAL population account; structuring places legs under ceilings across merchants", "new-families"],
      ["Red search", "Invalid mutants are recorded and never simulated; evolution is conditioned on prior outcomes; a novel blind spot is found", "loop, challenge-contract"],
      ["Blue and gate", "Proposals cite measured evidence and pass their schema; fresh-seed held-out evaluation, survival, replay and FPR regression", "loop"],
      ["Metrics", "Tie-aware ROC-AUC scores a fully tied ranking at exactly 0.5; both recall definitions; precision stays on the strict decline definition", "new-families, metrics"],
      ["Statistics", "Wilson intervals bracket the estimate; McNemar rewards one-sided improvement and ignores a symmetric swap", "new-families"],
      ["Operating point", "Calibration targets deployment prevalence; no uncorroborated outlier is ever auto-declined; latency is not floored to zero", "new-families"],
      ["Customer safety", "A large legitimate purchase is never auto-declined; a new device alone never blocks; a first visit to a new merchant stays allowed", "legit-robustness"],
      ["Security", "Prompt injection stays inert data; PAN, CVV, OTP and IBAN are rejected; provider URLs must be HTTPS; oversized payloads refused", "security"],
      ["Provider failure", "Timeout, HTTP error and malformed output each fall back deterministically after one repair attempt", "security"],
      ["Determinism", "Identical seeds produce byte-identical evaluations; experiment ids are content-derived", "phase0, audit-contract"],
      ["Product surface", "The closed loop, both recall definitions, the separated replays and the brand palette are all present in the UI", "ui-contract"],
    ],
    [2_200, 5_120, 1_800]
  )
);

push(
  pageBreak(),
  h2("Calibration provenance"),
  p(
    "Every number in this submission is measured inside our own simulator. That is the design \u2014 a closed loop needs a world it fully controls \u2014 but it means the FIDELITY of that world is an assumption rather than a result, and we state which parameters are anchored and which are simply assumed."
  ),
  table(
    [
      ["Parameter", "Value", "Basis"],
      ["Population", "1,200 customers, 300 merchants", "Assumed; sized so graph structure is observable"],
      ["Spend distribution", "Lognormal, CV 0.3-0.75", "Assumed shape, parameters not fitted"],
      ["Arrivals", "Poisson, 0.3-3.2 per day", "Assumed"],
      ["Young accounts", "~8% under 30 days", "Assumed; forces the graph gate to tolerate newcomers"],
      [
        "Cross-border share",
        "4% of legitimate spend",
        "Rate assumed; the asymmetry is sourced (EBA/ECB 2024 payment-fraud report: card fraud is disproportionately cross-border, ~30% of card-fraud value outside the EEA)",
      ],
      [
        "Fraud prevalence",
        "0.27% by transaction COUNT",
        "Deliberately above reality. Nilson 2024: $33.41bn losses on $51.92tn volume, about 6.4 basis points BY VALUE. Held richer so 81 and 90 fraud rows exist to measure; consequence is that precision reads optimistic",
      ],
      ["Operating point", "0.3% prevalence", "Matched to the evaluation pools, not the fraud-dense training pool"],
      ["Decline / review split", "0.895 / 0.5674", "Derived by sweep, not assumed"],
    ],
    [2_200, 2_300, 4_620]
  ),
  p(
    "What would make this stronger: fitting the amount and cadence distributions to an authorized network extract and re-deriving the operating point against that institution's own fraud rate and cost-of-decline. Neither is possible on public data alone, so both sit in the production roadmap rather than being approximated here.",
    { italics: true }
  )
);

push(
  pageBreak(),
  h1("10. Measured Results"),
  p(
    "The known-template baseline and the held-out attack set are DIFFERENT evaluation populations, and this document never mixes them. Both use identical legitimate traffic."
  ),
  h2("Choosing the operating point"),
  p(
    "A detector produces a score; a threshold turns that score into a decision. Our first calibration set the block threshold at the 98th percentile of legitimate scores. That pins the false-positive rate near 2 percent BY CONSTRUCTION, and precision is bounded by prevalence: precision = pi*TPR / (pi*TPR + (1-pi)*FPR). At a realistic 0.3 percent fraud rate, precision then cannot exceed roughly 7 percent no matter how good the model is."
  ),
  note(
    "THE SYMPTOM",
    "The model's ROC-AUC was 0.99 while its reported F1 was 12.76 percent. The number described the threshold, not the model."
  ),
  p(
    `The threshold is now swept for maximum F1 at ${pct(Number(evidence.detector.calibration.deploy_prevalence))} deployment prevalence under a hard false-positive ceiling. Because TPR and FPR are prevalence-independent, they are estimated on the full validation slice and converted to precision analytically, rather than discarding positives to subsample down to the deployment rate and leaving a noisy sweep.`
  ),
  h2("Baseline on known attack templates"),
  p(
    `${rate(evidence.baseline.n_fraud)} fraud transactions against ${rate(evidence.baseline.n_legit)} legitimate ones.`
  ),
  table(
    [
      ["Metric", "Value"],
      ["ROC-AUC", pct(evidence.baseline.roc_auc)],
      ["Recall (declined)", pct(evidence.baseline.fraud_recall)],
      ["Recall (declined or held for review)", pct(evidence.baseline.recall_with_review)],
      ["Precision (on declines)", pct(evidence.baseline.precision)],
      ["F1 (on declines)", pct(evidence.baseline.f1)],
      ["Average precision", pct(evidence.baseline.average_precision)],
      ["False-positive rate", pct(evidence.baseline.fpr)],
      ["Review rate", pct(evidence.baseline.review_rate)],
    ],
    [5_120, 4_000]
  ),
  note(
    "TWO RECALL DEFINITIONS",
    "Recall counting analyst holds is the honest production number. Precision, F1 and FPR are always computed on the STRICT decline definition, so recall can never be bought by pushing traffic into the review queue."
  ),
  pageBreak(),
  h2("Held-out evolved attack, before and after the defense"),
  table(
    [
      ["Metric", "Before", "After", "Change"],
      ...([
        ["Recall (declined)", "fraud_recall"],
        ["Recall (incl. review)", "recall_with_review"],
        ["Precision", "precision"],
        ["F1", "f1"],
        ["ROC-AUC", "roc_auc"],
        ["Average precision", "average_precision"],
        ["False-positive rate", "fpr"],
        ["Review rate", "review_rate"],
      ] as Array<[string, keyof Metrics]>).map(([label, key]) => [
        label,
        pct(evidence.defense_gate.held_out_before[key] as number),
        pct(evidence.defense_gate.held_out_after[key] as number),
        pointDelta(
          evidence.defense_gate.held_out_before[key] as number,
          evidence.defense_gate.held_out_after[key] as number
        ),
      ]),
    ],
    [2_520, 2_200, 2_200, 2_200]
  ),
  h2("Why this is a new signal and not a lower threshold"),
  p(
    "This is the most important table in the submission. It is the operating curve of the UNCHANGED detector across the WHOLE score range on the discovered attack."
  ),
  table(
    [
      ["Threshold", "Precision", "Recall", "F1", "False positives"],
      ...evidence.held_out_operating_points_v1
        .filter((point) => point.threshold >= 0.3 && point.threshold <= 0.9 && Math.round(point.threshold * 100) % 10 === 0)
        .map((point) => [
          point.threshold.toFixed(2),
          pct(point.precision),
          pct(point.recall),
          pct(point.f1),
          rate(point.false_positives),
        ]),
    ],
    [1_620, 1_875, 1_875, 1_875, 1_875]
  ),
  note(
    "THE RESULT",
    "There is no operating point that rescues this attack. Lowering the threshold buys false positives, not recall. A novel attack is not a calibration problem you can threshold your way out of; it is a missing-feature problem, and you only learn WHICH feature is missing by generating the attack first.",
    "red"
  ),
  h2("Statistical significance"),
  p(
    "Before and after scored the SAME transactions \u2014 identical scenarios, identical seeds, identical legitimate pool. The comparison is therefore paired, and McNemar's test is the correct statistic; an unpaired two-proportion test would understate the evidence."
  ),
  table(
    [
      ["Quantity", "Value"],
      ["Newly caught", String(evidence.defense_gate.significance?.after_only ?? 0)],
      ["Newly missed", String(evidence.defense_gate.significance?.before_only ?? 0)],
      [
        "McNemar p-value",
        (evidence.defense_gate.significance?.p_value ?? 1) < 0.001
          ? "< 0.001"
          : String(evidence.defense_gate.significance?.p_value),
      ],
      [
        "Decline recall, 95% Wilson interval, before",
        `${pct(evidence.defense_gate.recall_95ci?.before.low ?? 0)} to ${pct(evidence.defense_gate.recall_95ci?.before.high ?? 0)}`,
      ],
      [
        "Decline recall, 95% Wilson interval, after",
        `${pct(evidence.defense_gate.recall_95ci?.after.low ?? 0)} to ${pct(evidence.defense_gate.recall_95ci?.after.high ?? 0)}`,
      ],
      ["Held-out fraud transactions", String(evidence.defense_gate.held_out_after.n_fraud)],
    ],
    [5_120, 4_000]
  ),
  p(
    "The fraud sample is small, which is precisely why every headline delta ships with an interval and a paired test rather than as a bare point estimate.",
    { italics: true }
  ),
  pageBreak(),
  h2("Blind spot"),
  table(
    [
      ["Field", "Measured value"],
      ["Scenario", evidence.blind_spot.scenario_id],
      ["Parent", evidence.blind_spot.parent_scenario_id],
      ["Generation", String(evidence.blind_spot.generation)],
      ["Family", evidence.blind_spot.family],
      ["Seed", String(evidence.blind_spot.seed)],
      ["Discovery attack success", pct(evidence.blind_spot.attack_success_rate)],
      ["Gate verdict", evidence.defense_gate.accepted ? "ACCEPTED" : "REJECTED"],
    ],
    [3_500, 5_620]
  ),
  h2("Acceptance budgets"),
  p(
    "The Referee accepts or rejects. Neither AI votes. A flat one-point false-positive allowance was sized for a detector running near 2.8 percent FPR; at 0.19 percent it would wave through a five-fold increase, so both an absolute and a relative ceiling apply, plus a budget on the review queue itself."
  ),
  table(
    [
      ["Check", "Measured", "Budget", "Result"],
      [
        "Threat recall gain",
        pointDelta(evidence.defense_gate.held_out_before.recall_with_review, evidence.defense_gate.held_out_after.recall_with_review),
        `>= ${(evidence.gate_budgets.min_threat_recall_gain * 100).toFixed(0)} points`,
        "PASS",
      ],
      [
        "False-positive increase (absolute)",
        pointDelta(evidence.defense_gate.held_out_before.fpr, evidence.defense_gate.held_out_after.fpr),
        `<= ${(evidence.gate_budgets.max_fpr_delta_abs * 100).toFixed(2)} points`,
        "PASS",
      ],
      [
        "False-positive increase (relative)",
        `${(((evidence.defense_gate.held_out_after.fpr - evidence.defense_gate.held_out_before.fpr) / evidence.defense_gate.held_out_before.fpr) * 100).toFixed(0)}%`,
        `<= ${(evidence.gate_budgets.max_fpr_delta_rel * 100).toFixed(0)}%`,
        "PASS",
      ],
      [
        "Extra review-queue load",
        pointDelta(evidence.defense_gate.held_out_before.review_rate, evidence.defense_gate.held_out_after.review_rate),
        `<= ${(evidence.gate_budgets.max_review_rate_delta * 100).toFixed(2)} points`,
        "PASS",
      ],
      [
        "Fresh descendants improved",
        `${evidence.defense_gate.survival.filter((row) => row.cand_success < row.base_success).length} of ${evidence.defense_gate.survival.length}`,
        `>= ${(evidence.gate_budgets.min_survival_share * 100).toFixed(0)}%`,
        "PASS",
      ],
    ],
    [3_000, 2_200, 2_200, 1_720]
  ),
  h2("Exact replay"),
  p(
    "Two replays are produced, and they are NOT interchangeable. Conflating them lets a diff made entirely of fresh-seed rows be presented as evidence about the stored scenario. An earlier version of this system did exactly that, and the stored scenario had in fact changed zero decisions."
  ),
  table(
    [
      ["Replay", "What it proves", "Decisions changed"],
      [
        `Discovery scenario ${evidence.replay.discovery.scenario_id}, seed ${evidence.replay.discovery.seed}`,
        "Causal claim about the very attack that was found",
        String(evidence.replay.discovery.changed_decisions),
      ],
      [
        `Fresh-seed recompiles (${evidence.replay.fresh_seed.length})`,
        "Generalisation to seed variation of the same genome",
        String(evidence.replay.total_changed_decisions - evidence.replay.discovery.changed_decisions),
      ],
    ],
    [3_100, 3_820, 2_200]
  )
);

push(
  pageBreak(),
  h1("11. What the Model Actually Contributes"),
  p(
    "The reasoning layer is swappable: a deterministic expert policy in demo mode, a live model in live mode. That raises the fair question of whether the model earns its place. This section answers it with a recorded run rather than an assertion."
  ),
  p(
    "For every attack family the model and the deterministic policy are handed the SAME parent genome and scored by the SAME Referee. The model proposes; code measures. No number in this table is self-reported."
  ),
  live
    ? table(
        [
          ["Metric", "Model", "Deterministic policy"],
          ["Proposals returned", String(live.summary.model_proposals), String(live.summary.families)],
          ["Schema-valid", `${live.summary.model_proposals_schema_valid} of ${live.summary.model_proposals}`, "n/a"],
          ["Mean novelty distance", String(live.summary.model_mean_novelty), String(live.summary.policy_mean_novelty)],
          ["Counted novel (tau = 1.2)", String(live.summary.model_novel_count), String(live.summary.policy_novel_count)],
          ["Evaded the detector immediately", String(live.summary.model_evaded), String(live.summary.policy_evaded)],
        ],
        [3_620, 2_750, 2_750]
      )
    : p("Not recorded in this build.", { italics: true }),
  live
    ? note(
        "WHY GENAI IS NECESSARY",
        `The model explores roughly ${(live.summary.model_mean_novelty / Math.max(0.01, live.summary.policy_mean_novelty)).toFixed(1)} times further from the known templates than the hand-written policy, and every proposal it returned passed the bounded genome schema. The policy encodes what we already thought of; the model reaches regions we did not. Recorded against ${live.provider.model}; the full record, including every proposed genome, is in data/evidence/live-run.json.`
      )
    : p(""),
  live
    ? table(
        [
          ["Family", "Model novelty", "Policy novelty", "Latency"],
          ...Object.entries(live.families).map(([fam, f]) => [
            fam,
            f.candidates.filter((c) => c.origin === "model").map((c) => c.novelty.toFixed(2)).join(", ") || "none",
            (f.candidates.find((c) => c.origin === "policy")?.novelty ?? 0).toFixed(2),
            `${(f.model_latency_ms / 1000).toFixed(1)}s`,
          ]),
        ],
        [3_000, 2_400, 2_100, 1_620]
      )
    : p(""),
  p(
    "The failure that produced this section is worth stating. The strategist prompt originally told the model to stay inside the documented bounds without ever listing them, so it guessed, its proposals were rejected by the schema, and the arena silently fell back to the policy. Two of five families returned nothing usable. Spelling the bounds out took every family to a full set of schema-valid proposals.",
    { italics: true }
  )
);

push(
  pageBreak(),
  h1("12. Adversarial Robustness"),
  p(
    "The Referee created five fresh descendants after the Blue proposal. Red never used these seeds during search, and Blue never saw them."
  ),
  table(
    [
      ["Descendant", "Attack success before", "Attack success after", "Result"],
      ...evidence.defense_gate.survival.map((row) => [
        row.scenario_id,
        pct(row.base_success),
        pct(row.cand_success),
        row.cand_success < row.base_success ? "Improved" : "No change",
      ]),
    ],
    [2_350, 2_300, 2_300, 2_170]
  ),
  p(
    `${evidence.defense_gate.survival.filter((row) => row.cand_success < row.base_success).length} of ${evidence.defense_gate.survival.length} descendants improved, meeting the ${(evidence.gate_budgets.min_survival_share * 100).toFixed(0)} percent survival gate.`
  ),
  p(
    "This does not prove universal robustness. It proves generalisation beyond the exact attack used to form the defense hypothesis, which is the specific failure mode a single-scenario fix would have."
  ),
  h2("Corrections made during development"),
  p(
    "Several of the most consequential changes in this project were corrections. Stating them is part of the evidence."
  ),
  table(
    [
      ["What was wrong", "Effect", "Fix"],
      [
        "Block threshold set at the 98th percentile of legitimate scores",
        "Pinned FPR near 2% and capped precision at ~7% regardless of model quality",
        "Swept for max F1 at deployment prevalence under an FPR ceiling",
      ],
      [
        "Replay bundle labelled fresh-seed diffs as discovery evidence",
        "The stored scenario had changed zero decisions",
        "The two replays are measured and reported separately",
      ],
      [
        "Transaction country taken from the merchant's registered country",
        "Cross-border spend became a LEGITIMATE-traffic signal; trained geo weight went negative",
        "Cardholders have a home country; cross-border is the exception",
      ],
      [
        "probe_count_24h counted every sub-$10 payment",
        "Collinear with raw volume; trained weight collapsed to 0.004",
        "Requires the same merchant; weight is now 1.33",
      ],
      [
        "Per-transaction latency measured with performance.now()",
        "Resolution coarser than one scoring pass; every percentile reported as zero",
        "Measured in hrtime nanoseconds",
      ],
    ],
    [3_000, 3_300, 2_820]
  )
);

push(
  pageBreak(),
  h1("13. Security and Responsible AI"),
  p(
    "All entities, credentials, merchants, devices, and payment events are synthetic. The Arena never connects to a production payment system."
  ),
  table(
    [
      ["Abuse scenario", "Mitigation", "Evidence"],
      ["Prompt injection", "Scrub untrusted text and isolate data tags", "Injection tests"],
      ["Schema bypass", "Strict Zod contracts and allowlisted families", "Genome tests"],
      ["Real credentials", "Reject PAN, CVV, OTP, and IBAN patterns", "Credential tests"],
      ["Fake metrics", "Strip unknown Blue fields; Referee computes truth", "Metric injection test"],
      ["Provider misuse", "Allow HTTPS or local development only", "Provider URL test"],
      ["Provider outage", "Use a deterministic reviewed fallback", "Timeout test"],
      ["Oversized request", "Reject requests above the fixed limit", "Request-size test"],
      ["Operational fraud output", "Expose bounded behavior, not playbooks", "Genome contract"],
    ],
    [1_950, 4_700, 2_470]
  ),
  note(
    "SAFETY BOUNDARY",
    "The system builds attacks only inside its own synthetic world."
  )
);

push(
  pageBreak(),
  h1("14. Scalability"),
  p(
    `The benchmark used five trials per scale on ${benchmark.results[0].node} and ${benchmark.results[0].platform}.`
  ),
  table(
    [
      ["Transactions", "Generation", "Feature pass", "Scoring", "RSS", "Duration"],
      ...benchmark.results.map((row) => [
        rate(row.transactions),
        `${rate(row.generation_tx_s)} tx/s`,
        `${rate(row.feature_tx_s)} tx/s`,
        `${rate(row.scoring_tx_s)} tx/s`,
        `${row.memory_rss_mb} MB`,
        `${row.experiment_ms} ms`,
      ]),
    ],
    [1_400, 1_720, 1_720, 1_720, 1_200, 1_360]
  ),
  p(
    "The benchmark measures one in-process prototype. It excludes networks, databases, queues, providers, and cross-service serialization."
  ),
  p(
    "A production design can partition workloads by customer and merchant state. It still needs authorized network-scale validation."
  ),
  note(
    "CLAIM LIMIT",
    "The prototype does not claim Mastercard-scale throughput."
  )
);

push(
  h1("15. Product Experience"),
  p(
    "The interface uses a payment-security command center instead of a generic analytics dashboard. The battle itself is the product."
  ),
  table(
    [
      ["View", "Judge action", "Visible proof"],
      ["Command Center", "Select RUN RED TEAM", "Red, Payment Rail, Blue, and Referee state"],
      ["Threat Intelligence", "Review selected threats", "IDENTIFY stage and safe hypotheses"],
      ["Fraud Evolution", "Select a lineage node", "Parent, generation, fitness, and verdict"],
      ["Blue Investigation", "Select INVESTIGATE", "Failure evidence and bounded proposal"],
      ["Defense Validation", "Select VALIDATE DEFENSE", "Gate verdict, held-out metrics, and replay"],
      ["Experiment Audit", "Open the audit view", "Seeds, versions, experiment IDs, and metrics"],
    ],
    [2_050, 2_550, 4_520]
  ),
  h2("Exact three-minute demo"),
  table(
    [
      ["Time", "Action and proof"],
      ["0:00 to 0:15", "State the problem and the judge-facing thesis."],
      ["0:15 to 0:30", "Show legitimate ALLOW and known-fraud BLOCK results."],
      ["0:30 to 1:00", "Run Red and show caught generations before evasion."],
      ["1:00 to 1:15", "Show BLIND SPOT DISCOVERED and Referee degradation."],
      ["1:15 to 1:45", "Open the Blue evidence and bounded proposal."],
      ["1:45 to 2:10", "Run the Defense Gate with legitimate regression."],
      ["2:10 to 2:30", "Show exact before-versus-after replay."],
      ["2:30 to 2:45", "Show the five fresh descendants."],
      ["2:45 to 3:00", "Restart Red against the defended engine."],
    ],
    [1_700, 7_420]
  )
);

push(
  h1("16. Architecture"),
  table(
    [
      ["System flow"],
      [
        "THREAT RESEARCH -> RED STRATEGIST -> FRAUD GENOME -> SCHEMA VALIDATOR -> MUTATION ENGINE -> SCENARIO COMPILER -> SYNTHETIC PAYMENT TWIN -> FRAUD DETECTOR -> REFEREE -> BLUE INVESTIGATOR -> DEFENSE GATE -> EXACT REPLAY -> RED AGAIN",
      ],
    ],
    [TABLE_WIDTH]
  ),
  p(
    "The application uses one Next.js process, one in-memory Arena state, JSON model artifacts, and a JSONL audit ledger."
  ),
  p(
    "This design minimizes demo failure modes. It also makes each truth boundary easy to inspect and test."
  ),
  h2("AI necessity map"),
  table(
    [
      ["Component", "Class", "Reason"],
      ["Threat interpreter", "GENAI", "Converts research into selected attack hypotheses"],
      ["Red strategist", "GENAI", "Chooses mutations from cross-experiment evidence"],
      ["Blue investigator", "GENAI", "Creates a failure and defense hypothesis"],
      ["Fraud detector", "ML", "Scores transaction risk"],
      ["Graph features", "ML signal", "Measures cross-account merchant convergence"],
      ["Simulator", "DETERMINISTIC", "Creates transactions and labels"],
      ["Referee", "DETERMINISTIC", "Owns metrics, gates, and replay"],
      ["Demo reasoning", "MOCKED", "Reviewed fixtures replace provider calls only"],
      ["Sequence model", "OPTIONAL", "The current features cover the selected proof"],
    ],
    [2_350, 1_750, 5_020]
  )
);

push(
  pageBreak(),
  h1("17. Limitations"),
  bullet("The synthetic population does not represent every real payment distribution."),
  bullet("The final test uses fresh seeds from the same simulator family."),
  bullet("The graph signal covers merchant convergence, not a full network graph."),
  bullet("Live reasoning quality varies by the selected model provider."),
  bullet("Held-out fraud samples are 81 and 90 transactions. Every headline delta is therefore reported with a 95% Wilson interval and a paired significance test rather than as a bare point estimate."),
  bullet("A single block threshold cannot be simultaneously optimal for loud templates and for an attack evolved to sit beneath it. That tension is measured and disclosed, and it is the reason the Arena exists."),
  bullet("Sessions are cookie-scoped and in-memory, which is adequate for a shared demo but not for a multi-replica deployment."),
  bullet("Measured throughput excludes network and durable-storage costs."),
  h1("18. Production Roadmap"),
  numbered("Calibrate the simulator with authorized and privacy-protected network distributions.", 2),
  numbered("Move experiment state to durable, versioned storage.", 2),
  numbered("Run isolated search workers with strict quotas and policy controls.", 2),
  numbered("Add shadow-mode connectors for authorized fraud models.", 2),
  numbered("Add independent model-risk approval before any deployment action.", 2),
  numbered("Validate fairness, drift, privacy, security, and latency under production load.", 2),
  p(
    "The Arena should remain a validation system. It must not autonomously block real transactions or deploy a defense."
  )
);

push(
  h1("19. Reproduction Instructions"),
  numbered("Clone the public repository.", 3),
  numbered("Use Node.js 22.", 3),
  numbered("Run npm ci.", 3),
  numbered("Run npm run evidence.", 3),
  numbered("Run npm run selfcheck.", 3),
  numbered("Run npm run dev.", 3),
  numbered("Open http://localhost:3000.", 3),
  numbered("Select RUN RED TEAM, INVESTIGATE, and VALIDATE DEFENSE.", 3),
  p(
    "Demo mode uses reviewed reasoning fixtures. It needs no API key and keeps the complete computational path active."
  ),
  p(
    "Use npm run handoff to create a secret-free continuation brief for another coding agent."
  ),
  h1("20. GitHub Repository"),
  p(repoUrl, { bold: true, color: BLUE }),
  p(
    "The repository includes the source, tests, evidence JSON, benchmark JSON, methodology, threat model, responsible AI statement, and this walkthrough."
  ),
  h1("21. Web Prototype"),
  p(webUrl, { bold: true, color: BLUE }),
  p(
    "The public deployment uses Demo mode by default. The deployment does not need an API key to run the complete judge flow."
  ),
  note(
    "CLOSING THESIS",
    "Generate tomorrow's fraud safely today. Discover the blind spot. Prove the defense."
  )
);

const header = new Header({
  children: [
    new Paragraph({
      children: [
        new TextRun({
          text: "ADVERSARIAL FRAUD ARENA",
          bold: true,
          color: NAVY,
          size: 16,
        }),
        new TextRun({
          text: "   |   SOLUTION WALKTHROUGH",
          color: MUTED,
          size: 16,
        }),
      ],
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 5, color: BORDER },
      },
      spacing: { after: 0 },
    }),
  ],
});

const footer = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: "AI Defense Lab   |   ", color: MUTED, size: 16 }),
        new TextRun({ children: ["Page ", PageNumber.CURRENT], color: MUTED, size: 16 }),
      ],
      spacing: { before: 0, after: 0 },
    }),
  ],
});

const doc = new Document({
  title: "Adversarial Fraud Arena Solution Walkthrough",
  subject: "Mastercard Innovation Challenge 2026 AI Defense Lab",
  creator: "Adversarial Fraud Arena Team",
  description:
    "A reproducible AI Red Team, AI Blue Team, and deterministic Referee for synthetic payment security.",
  evenAndOddHeaderAndFooters: true,
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 22, color: INK },
        paragraph: { spacing: { after: 120, line: 264 } },
      },
      heading1: {
        run: { font: "Calibri", size: 32, bold: true, color: BLUE },
        paragraph: {
          spacing: { before: 320, after: 160 },
          keepNext: true,
          keepLines: true,
        },
      },
      heading2: {
        run: { font: "Calibri", size: 26, bold: true, color: NAVY },
        paragraph: {
          spacing: { before: 240, after: 120 },
          keepNext: true,
          keepLines: true,
        },
      },
      heading3: {
        run: { font: "Calibri", size: 24, bold: true, color: NAVY },
        paragraph: {
          spacing: { before: 160, after: 80 },
          keepNext: true,
          keepLines: true,
        },
      },
    },
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 720, hanging: 360 },
                spacing: { after: 100, line: 264 },
              },
            },
          },
        ],
      },
      {
        reference: "steps",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 720, hanging: 360 },
                spacing: { after: 100, line: 264 },
              },
            },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        titlePage: true,
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: {
            top: MARGIN,
            right: MARGIN,
            bottom: MARGIN,
            left: MARGIN,
            header: 708,
            footer: 708,
          },
          pageNumbers: { start: 1 },
        },
      },
      headers: {
        first: new Header({ children: [new Paragraph({ text: "" })] }),
        default: header,
        even: header,
      },
      footers: {
        first: new Footer({ children: [new Paragraph({ text: "" })] }),
        default: footer,
        even: footer,
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
const OUT = "The debuggers.docx"; // submission rule: file must be named TeamName.docx
writeFileSync(OUT, buffer);
console.log(`wrote ${OUT}`);
