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
    held_out_before: Metrics;
    held_out_after: Metrics;
    survival: Array<{
      scenario_id: string;
      base_success: number;
      cand_success: number;
    }>;
  };
  replay: { changed_decisions: number };
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

const PAGE_WIDTH = 12_240;
const PAGE_HEIGHT = 15_840;
const MARGIN = 1_440;
const TABLE_WIDTH = 9_120;
const BLUE = "2E74B5";
const NAVY = "17324D";
const RED = "B42318";
const INK = "17212B";
const MUTED = "5E6A75";
const LIGHT = "F2F4F7";
const PALE_BLUE = "EAF3FA";
const PALE_RED = "FCECEA";
const WHITE = "FFFFFF";
const BORDER = "C9D1D9";
const repoUrl =
  "https://github.com/namangoyal3/mastercard-innovation-challenge";
const webUrl = "Public Railway URL: added after the final deployment";

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
const gap = () => new Paragraph({ spacing: { before: 40, after: 80 } });

const children: Array<Paragraph | Table> = [];
const push = (...items: Array<Paragraph | Table>) => {
  for (const item of items) {
    children.push(item);
    if (item instanceof Table) children.push(gap());
  }
};

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
  p(`Evidence generated: ${new Date(evidence.generated_at).toLocaleDateString("en-GB")}`),
  p(`Evidence commit: ${evidence.commit.slice(0, 12)}`),
  p(`Repository: ${repoUrl}`),
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
    "MEASURED RESULT",
    `Held-out recall improved from ${pct(evidence.defense_gate.held_out_before.fraud_recall)} to ${pct(evidence.defense_gate.held_out_after.fraud_recall)}. FPR changed by ${pointDelta(evidence.defense_gate.held_out_before.fpr, evidence.defense_gate.held_out_after.fpr)}.`
  ),
  h2("The smallest credible submission"),
  bullet("One deployable Next.js application"),
  bullet("One trained baseline fraud model"),
  bullet("Three bounded attack families"),
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
  h2("Shadow rubric evidence"),
  table(
    [
      ["Criterion", "Primary proof", "Current state"],
      ["R1 Alignment", "Complete eight-stage product loop", "Implemented and tested"],
      ["R2 Innovation", "Adaptive attack discovery plus independent defense proof", "Implemented and visible"],
      ["R3 GenAI", "Threat, strategy, investigation, and defense reasoning", "Live and deterministic modes"],
      ["R4 Red depth", "Feedback memory and attack lineage", "Implemented and tested"],
      ["R5 Defense", "Held-out gate, FPR control, and replay", "Measured and accepted"],
      ["R6 Execution", "Simulator, ML, schemas, tests, build, and CI", "Implemented"],
      ["R7 Science", "Four environments, versions, seeds, and evidence", "Implemented"],
      ["R8 Security", "Synthetic scope, input guards, and injection tests", "Implemented and tested"],
      ["R9 Scale", "Five-trial benchmark at three sizes", "Measured to 101,673 rows"],
      ["R10 Product", "Command center and deterministic demo", "Deployment pending"],
    ],
    [1_700, 4_900, 2_520]
  ),
  p(
    "This matrix is an internal planning model. No public official weighted rubric was verified on 22 August 2026."
  )
);

push(
  h1("6. IDENTIFY"),
  h2("Threat Research"),
  p(
    "The threat review covers twelve defensive families. The MVP selects only families that the payment twin can observe and simulate safely."
  ),
  table(
    [
      ["Family", "GenAI advantage", "Expected blind spot", "MVP"],
      ["Adaptive card testing", "Changes probes after rejection", "Few-probe variants", "Selected"],
      ["Low-and-slow camouflage", "Tunes timing and amount", "Mild point-wise signals", "Selected"],
      ["Coordinated mule fan-out", "Creates coherent identity batches", "Risk exists between accounts", "Selected"],
      ["Synthetic identity", "Builds plausible histories", "Mature synthetic profiles", "Research"],
      ["Account takeover", "Personalizes lures and pacing", "Warmed-device behavior", "Research"],
      ["Velocity camouflage", "Targets rate-window edges", "Sub-window pacing", "Research"],
      ["Transaction splitting", "Selects near-limit values", "Distributed cumulative value", "Research"],
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
    "The three selected families cover classic, temporal, and network behavior. They also share one strict transaction-level simulator."
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
      ["Identity", "family, account_age_days", "Three families; 0 to 3,650 days"],
      ["Amount", "base, jitter, drain_multiplier", "1 to 2,000; 0 to 0.6; 1 to 50"],
      ["Velocity", "tx_per_hour", "1 to 40"],
      ["Temporal", "start_hour_utc, span_hours", "0 to 23; 1 to 336"],
      ["Merchant", "mcc, new_merchant", "Eight MCC values; boolean"],
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
    "The baseline combines calibrated rules with logistic regression. It uses seven core behavioral features and emits reason codes."
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
  h2("25-Test Evaluation Suite"),
  table(
    [
      ["Test", "Required proof", "Automated evidence"],
      ["T1", "Legitimate traffic stays low risk", "phase0.test.ts"],
      ["T2", "Known card testing is caught", "phase0.test.ts"],
      ["T3", "Known mule fraud is caught", "phase0.test.ts"],
      ["T4", "Threat assessment is structured", "challenge-contract.test.ts"],
      ["T5", "Red emits a valid genome", "loop.test.ts"],
      ["T6", "Mutation keeps allowlisted fields", "challenge-contract.test.ts"],
      ["T7", "Invalid mutation is rejected", "loop.test.ts"],
      ["T8", "Out-of-range values are rejected", "phase0.test.ts"],
      ["T9", "Red observes detector feedback", "challenge-contract.test.ts"],
      ["T10", "Later attacks depend on prior results", "loop.test.ts"],
      ["T11", "A verified fixture degrades the baseline", "loop.test.ts"],
      ["T12", "Blind-spot metrics are deterministic", "loop.test.ts"],
      ["T13", "Blue cites measured failure evidence", "loop.test.ts"],
      ["T14", "The Blue proposal passes its schema", "loop.test.ts"],
      ["T15", "The candidate defense is evaluated", "loop.test.ts"],
      ["T16", "Exact replay reproduces results", "loop.test.ts"],
      ["T17", "Held-out descendants execute", "loop.test.ts"],
      ["T18", "Legitimate FPR regression is measured", "loop.test.ts"],
      ["T19", "Merchant injection stays inert data", "challenge-contract.test.ts"],
      ["T20", "Threat injection is scrubbed", "security.test.ts"],
      ["T21", "Fake LLM metrics are stripped", "security.test.ts"],
      ["T22", "Provider timeout keeps the loop alive", "security.test.ts"],
      ["T23", "Malformed output repairs once", "challenge-contract.test.ts"],
      ["T24", "Real payment credentials are rejected", "security.test.ts"],
      ["T25", "Identical seeds reproduce results", "phase0.test.ts"],
    ],
    [850, 4_970, 3_300]
  )
);

push(
  pageBreak(),
  h1("10. Measured Results"),
  p(
    "The known-template baseline and the held-out attack set are different evaluation populations. This document labels them separately."
  ),
  table(
    [
      ["Metric", "Known baseline", "Held-out before", "Held-out after"],
      ["Fraud recall", pct(evidence.baseline.fraud_recall), pct(evidence.defense_gate.held_out_before.fraud_recall), pct(evidence.defense_gate.held_out_after.fraud_recall)],
      ["Precision", pct(evidence.baseline.precision), pct(evidence.defense_gate.held_out_before.precision), pct(evidence.defense_gate.held_out_after.precision)],
      ["F1", pct(evidence.baseline.f1), pct(evidence.defense_gate.held_out_before.f1), pct(evidence.defense_gate.held_out_after.f1)],
      ["False-positive rate", pct(evidence.baseline.fpr), pct(evidence.defense_gate.held_out_before.fpr), pct(evidence.defense_gate.held_out_after.fpr)],
      ["False-negative rate", pct(evidence.baseline.fnr), pct(evidence.defense_gate.held_out_before.fnr), pct(evidence.defense_gate.held_out_after.fnr)],
      ["Average precision", pct(evidence.baseline.average_precision), pct(evidence.defense_gate.held_out_before.average_precision), pct(evidence.defense_gate.held_out_after.average_precision)],
    ],
    [2_520, 2_200, 2_200, 2_200]
  ),
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
      ["Exact-replay changes", String(evidence.replay.changed_decisions)],
    ],
    [3_500, 5_620]
  ),
  note(
    "CAUSAL EVIDENCE",
    `The exact replay changed ${evidence.replay.changed_decisions} decisions on the same stored scenario and seed.`
  )
);

push(
  h1("11. Adversarial Robustness"),
  p(
    "The Referee created five fresh descendants after the Blue proposal. Red did not use these seeds during search."
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
    "Four of five descendants improved. One descendant showed no change. The result meets the 80 percent survival gate."
  ),
  p(
    "This result does not prove universal robustness. It proves generalization beyond the exact attack used for the defense hypothesis."
  )
);

push(
  h1("12. Security and Responsible AI"),
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
  h1("13. Scalability"),
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
  h1("14. Product Experience"),
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
  h1("15. Architecture"),
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
  h1("16. Limitations"),
  bullet("The synthetic population does not represent every real payment distribution."),
  bullet("The final test uses fresh seeds from the same simulator family."),
  bullet("The graph signal covers merchant convergence, not a full network graph."),
  bullet("Live reasoning quality varies by the selected model provider."),
  bullet("The single-process state is not suitable for multiple production replicas."),
  bullet("Measured throughput excludes network and durable-storage costs."),
  h1("17. Production Roadmap"),
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
  h1("18. Reproduction Instructions"),
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
  h1("19. GitHub Repository"),
  p(repoUrl, { bold: true, color: BLUE }),
  p(
    "The repository includes the source, tests, evidence JSON, benchmark JSON, methodology, threat model, responsible AI statement, and this walkthrough."
  ),
  h1("20. Web Prototype"),
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
writeFileSync("docs/Adversarial-Fraud-Arena-Solution.docx", buffer);
console.log("wrote docs/Adversarial-Fraud-Arena-Solution.docx");
