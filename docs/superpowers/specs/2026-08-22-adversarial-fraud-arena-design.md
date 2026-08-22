# Adversarial Fraud Arena Design

**Date:** 2026-08-22

**Status:** Approved blueprint

**Target:** Mastercard Innovation Challenge 2026 at Global Fintech Fest

**Repository:** `namangoyal3/mastercard-innovation-challenge`

## 1. Product decision

Build one web application named **Adversarial Fraud Arena**.

The application lets a bounded Red Agent evolve synthetic payment attacks against a fraud detector. A Blue Investigator proposes a bounded defense. A deterministic Referee verifies the result.

The product must show this loop:

```text
IDENTIFY → GENERATE → ATTACK → EVADE → DISCOVER → DEFEND → REPLAY → MEASURE
```

The product must not become a general fraud platform. The product must prove one complete attack-and-defense story.

## 2. Product contract

### Primary user

A payment-network fraud-model validation team uses the application.

### User problem

The team needs to find detector blind spots before those attacks appear in production.

### Desired result

The team reproduces a detector failure and validates a safe defense against exact and held-out attacks.

### Inputs

- Curated defensive threat intelligence
- Bounded Fraud Genomes
- Synthetic population parameters
- Detector and defense versions
- Referee-owned random seeds

### Outputs

- Attack hypotheses and lineage
- Synthetic transactions and deterministic labels
- Detector decisions and reason codes
- Red fitness and novelty values
- Blue failure hypotheses and defense proposals
- Gate verdicts and replay evidence
- Versioned experiment records

### Constraints

- Use synthetic data only.
- Reject real payment credentials.
- Do not connect to production payment systems.
- Do not let an LLM create labels, metrics, thresholds, permissions, or verdicts.
- Do not expose operational fraud instructions.
- Keep a complete DEMO mode that requires no network or API key.

## 3. Judge-facing thesis

Fraud models learn from attacks that already happened. The Arena generates tomorrow's attacks safely, finds detector blind spots, and proves whether a defense improves.

The judge must remember:

> Red attacks. Blue defends. The Referee owns truth.

## 4. Selected attack families

Implement only these families:

1. **Adaptive card testing and drain**
   - The baseline catches familiar probe bursts.
   - Red changes probe count, timing, and drain behavior.

2. **Low-and-slow camouflage**
   - Red reduces point-wise anomalies.
   - Sequence regularity reveals machine-like behavior.

3. **Coordinated mule fan-out**
   - Each synthetic account has mild behavior.
   - Customer-to-merchant convergence reveals the group.

The product can discuss other threats. The simulator must not implement them in the MVP.

## 5. System architecture

```text
CURATED THREAT RESEARCH
          │
          ▼
  THREAT INTERPRETER
  GenAI live / fixture demo
          │
          ▼
    RED STRATEGIST ◄──────── Experiment memory
          │                         ▲
          ▼                         │
  STRICT FRAUD GENOME               │
       Zod schema                    │
          │                         │
          ▼                         │
  MUTATION + BEAM SEARCH ───────────┘
          │
          ▼
   SCENARIO COMPILER
  pure(genome, seed, world)
          │
          ▼
 SYNTHETIC PAYMENT TWIN
          │
          ▼
 BASELINE RISK ENGINE
 rules + logistic regression
          │
          ▼
 DETERMINISTIC REFEREE
 labels · fitness · novelty
 metrics · versions · ledger
      │ caught
      ├──────────────────────► mutate again
      │ evaded + novel + confirmed
      ▼
 BLIND SPOT DISCOVERED
          │
          ▼
   BLUE INVESTIGATOR
 GenAI live / policy demo
          │
          ▼
 BOUNDED DEFENSE PROPOSAL
          │
          ▼
     DEFENSE GATE
 schema · held-out test · FPR regression
          │
          ▼
 EXACT REPLAY + FRESH DESCENDANTS
          │
          ▼
   ACCEPT OR REJECT
          │
          └──────────────────► Red attacks again
```

Use one Next.js application. Do not create microservices, queues, graph databases, or vector stores.

## 6. Ownership of truth

### GenAI owns proposals

GenAI can:

- Interpret defensive threat research.
- Create attack hypotheses.
- Plan bounded genome mutations.
- Reason across previous experiments.
- Investigate measured detector failures.
- Propose bounded defense changes.
- Create analyst explanations.

### Machine learning owns scoring

Machine learning can:

- Score transaction risk.
- Rank transactions.
- Produce model reason contributions.

### Deterministic code owns decisions

Deterministic code must own:

- Synthetic generation
- Ground-truth labels
- Schemas and parameter limits
- Split seeds
- Fitness and novelty
- Metrics and thresholds
- Replay
- Versions
- Defense acceptance
- Permissions and safety gates

Neither AI can grade itself.

## 7. Fraud Genome contract

The Fraud Genome is the only language available to Red.

```json
{
  "scenario_id": "AF-1042",
  "parent_scenario_id": "AF-1037",
  "generation": 4,
  "family": "mule_fanout",
  "hypothesis": "Coordinated newcomers hide behind mild per-account behavior.",
  "seed": 40404,
  "genome": {
    "amount": {
      "base": 154,
      "jitter": 0.06,
      "drain_multiplier": 1
    },
    "velocity": {
      "tx_per_hour": 3
    },
    "temporal": {
      "start_hour_utc": 13,
      "span_hours": 96
    },
    "merchant": {
      "mcc": "grocery",
      "new_merchant": true
    },
    "device": {
      "age_days": 30,
      "geo_jump_km": 0
    },
    "identity": {
      "account_age_days": 90
    },
    "sequence": {
      "probe_count": 0,
      "interarrival_s": 19200,
      "regularity": 0.95,
      "drain_after_probe": false
    }
  }
}
```

Reject unknown keys, unsupported families, invalid types, and out-of-range values. Store rejected candidates in the lineage, but do not simulate them.

The family compiler can derive a bounded graph cohort from the existing fields. Do not add a second graph DSL unless a required test fails.

## 8. Red search design

Use a bounded evolutionary beam.

Each generation must:

1. Select the current family frontier.
2. Provide prior decisions, reason codes, and fitness to the strategist.
3. Generate one or two bounded mutations per parent.
4. Validate each mutation.
5. Compile valid mutations with deterministic seeds.
6. Score all transactions with the current defense.
7. Compute fitness in deterministic code.
8. Store lineage and experiment records.
9. Select the next family frontier.

Use this fitness contract:

```text
fitness =
    evasion_rate
  + 0.25 × normalized_novelty
  - realism_penalty
  - duplicate_penalty
```

Invalid candidates receive no fitness. A confirmed blind spot must remain evasive across fresh seeds.

DEMO mode uses a deterministic expert policy. LIVE mode uses an LLM and the same schemas. Invalid or unavailable LLM output must fall back to the policy.

## 9. Synthetic payment twin

The twin must contain:

- Customers
- Accounts
- Synthetic card tokens
- Merchants and merchant categories
- Devices
- Sessions
- Customer-to-merchant relationships
- Legitimate transactions
- Fraud transactions

Each transaction must include:

```text
transaction_id
timestamp
amount
currency
customer_id
account_id
token_id
merchant_id
merchant_category
device_id
session_id
channel
country
scenario_id
ground_truth
kind
```

The generator must remain a pure function of versions and seeds. The UI must always show **SYNTHETIC PAYMENT ENVIRONMENT**.

## 10. Fraud detector

Use a calibrated logistic regression model with deterministic payment rules.

The baseline must:

- Catch known card-testing behavior.
- Catch a second known fraud family.
- Preserve a measured legitimate false-positive budget.
- Return a risk score, decision, reason codes, model version, and latency.

Do not add XGBoost, LightGBM, or another model unless a measured requirement fails.

The advanced defense can use:

- Spend-escalation features
- Sequence-pattern features
- In-memory newcomer graph features

Do not add a graph database, GNN, or sequence transformer.

## 11. Blue Investigator

Blue receives only Referee evidence.

Required inputs:

- Blind-spot scenario and family
- Attack success rate
- False-negative feature summaries
- Detector reason codes
- Lineage and aggregate experiment history
- Baseline threshold

Required output:

```json
{
  "failure_hypothesis": "The point-wise model misses coordinated newcomer convergence.",
  "evidence": [
    "The measured newcomer burst score increased on false negatives."
  ],
  "candidate_features": [
    "newcomer_count_48h",
    "newcomer_burst_score"
  ],
  "recommended_change": "Add a bounded graph contribution.",
  "defense_config": {
    "threshold": 0.3574,
    "escalation_weight": 0,
    "pattern_weight": 0,
    "graph_weight": 0.6
  },
  "expected_tradeoff": "The false-positive rate can increase.",
  "confidence": 0.72
}
```

Blue proposes. The Defense Gate decides.

## 12. Defense Gate

The gate must:

1. Validate the proposal schema.
2. Validate the defense policy.
3. Evaluate the candidate on development data.
4. Evaluate fresh descendants on the final split.
5. Measure legitimate false-positive regression.
6. Replay the exact discovery scenario.
7. Accept or reject the candidate.

Use explicit experimental thresholds:

- Threat-class recall gain must reach at least five percentage points.
- The false-positive rate increase must not exceed one percentage point.
- At least 80 percent of improvable fresh seeds must improve.

Record rejected proposals. A rejection is a valid Referee result.

## 13. Experiment isolation

Use four referee-owned environments:

| Environment | Purpose |
|---|---|
| TRAIN | Fit the detector on known behavior. |
| RED SEARCH | Let Red observe and mutate. |
| BLUE DEVELOPMENT | Create and select candidate defenses. |
| FINAL HELD-OUT | Measure fresh descendants and legitimate traffic. |

Blue must not inspect final-test outcomes before the candidate freezes.

Every experiment record must contain:

- Experiment ID
- Timestamp
- Scenario and parent IDs
- Seed
- Dataset version
- Attack version
- Detector version
- Defense version
- Model provider and version
- Metrics
- Verdict

## 14. Metrics

Measure:

- Precision
- Recall
- F1
- Average precision or a defined PR-AUC
- False-positive rate
- False-negative rate
- Review rate
- Attack success rate
- Novel-attack recall
- Mutation robustness
- P50 and P95 latency
- Blind-spot discovery time
- Defense validation time

The repository currently labels average precision as `pr_auc`. Correct the name or implement the selected PR-AUC definition.

## 15. Security design

Apply these controls:

- Treat all threat notes and metadata as untrusted data.
- Strip instruction-override patterns before LLM use.
- Reject PAN, CVV, PIN, OTP, and IBAN patterns.
- Reject unsupported attack families.
- Reject unknown schema fields.
- Apply request-size limits.
- Restrict live-mode egress to the configured provider.
- Exclude environment variables and secrets from prompts and logs.
- Reject LLM-supplied metrics and verdicts.
- Record every agent action.

The attack system must not accept URLs, scripts, tools, external endpoints, or arbitrary executable instructions.

## 16. User experience

Use six tabs inside one command-center application.

### Command Center

Show Red, the payment rail, Blue, and Referee. Show the synthetic-environment label and primary controls.

### Threat Intelligence

Show the defensive threat corpus. Mark the three selected families. Use `SEND TO RED LAB` as the action.

### Fraud Evolution

Combine the Red Lab, genome inspector, and lineage tree. Show `CAUGHT`, `EVADED`, `INVALID`, and `MUTATING` states.

### Blind Spot

Render a hero alert inside the Command Center and Evolution tab. Show the exact lineage and measured baseline failure.

### Blue Investigation

Show the failure hypothesis, evidence, candidate features, configuration, confidence, and tradeoff.

### Validation, Replay, and Audit

Show gate conditions, held-out results, exact replay, legitimate regression, and the experiment record.

Use a dark neutral interface with restrained red and blue semantics. Do not use fake terminals, Matrix effects, skulls, or generic chat layouts.

## 17. Demo contract

The deterministic demo must complete within three minutes.

```text
0:00–0:15  Explain the problem.
0:15–0:30  Show legitimate traffic and known fraud.
0:30–0:55  Run Red and grow the lineage.
0:55–1:20  Reveal the confirmed blind spot.
1:20–1:45  Show Blue's evidence and proposal.
1:45–2:05  Run the Defense Gate.
2:05–2:30  Show exact before-and-after replay.
2:30–2:45  Show fresh descendants.
2:45–2:55  Show the audit record.
2:55–3:00  Restart Red against the accepted defense.
```

The application must support a single reset action with fixed demo seeds.

## 18. Failure behavior

| Failure | Required behavior |
|---|---|
| No internet | Continue in DEMO mode. |
| Provider timeout | Retry once, then use the policy. |
| Malformed model output | Attempt one schema-guided repair, then use the policy. |
| Invalid genome | Store it as invalid and skip simulation. |
| Rejected defense | Explain the gate reason and preserve the baseline. |
| Missing model artifact | Fail the self-check before the demo. |
| Dirty demo state | Reset the state and ledger with fixed seeds. |

## 19. Verification contract

The repository must provide one command:

```bash
npm run selfcheck
```

It must run:

- Lint
- Typecheck
- Unit tests
- Schema tests
- Adversarial tests
- Injection tests
- Replay tests
- Reproducibility tests
- Production build

The final test matrix must include the 25 approved challenge tests. Add browser, accessibility, and load checks as separate evidence.

## 20. Performance contract

Benchmark approximately 1,000, 10,000, and 100,000 transactions.

For each size:

1. Warm the runtime once.
2. Run five measured trials.
3. Report median throughput.
4. Report P50 and P95 latency.
5. Report peak RSS memory.
6. Report total experiment duration.
7. Record the hardware, runtime, commit, and seed.

Do not claim Mastercard-scale performance. Describe only a measured scaling path.

## 21. Submission artifacts

The final submission must contain:

- A working public web prototype
- A public GitHub repository
- A rendered solution walkthrough in DOCX format
- A submission-ready README
- A deterministic three-minute demo
- Measured evaluation and benchmark evidence
- Responsible-AI and threat-model documentation
- A rubric coverage matrix

The DOCX and README must link each major claim to a screen, test, experiment, or source file.

## 22. Explicit exclusions

Do not build:

- Microservices
- A graph database
- A vector database
- A GNN
- A sequence transformer
- A chatbot
- Autonomous production blocking
- Real payment integrations
- More attack families
- More AI agents
- Fake benchmarks

## 23. Acceptance criteria

The product reaches submission-ready state only when:

- The complete loop works in DEMO mode.
- Known fraud gets caught.
- Red creates outcome-dependent descendants.
- A confirmed blind spot degrades the baseline.
- Blue produces an evidence-linked proposal.
- The gate measures held-out recall and false-positive regression.
- Exact replay reproduces the discovery scenario.
- Fresh descendants test generalization.
- Prompt injection and credential tests pass.
- Provider failure preserves the demo.
- The benchmark includes memory and duration.
- Browser and accessibility checks pass.
- The README and DOCX contain verified evidence.
- The public deployment matches the tested commit.
- Every rubric row links to implementation, tests, demo evidence, and documentation.

## 24. Handoff requirement

Before a context limit, run a small handoff script. The script must create `CLAUDE_RESUME.md` without secrets.

The handoff must contain:

- The current objective
- The current branch and commit
- The worktree status
- Completed work
- Remaining work
- The last verification result
- The next exact command
- Relevant file paths

The next agent must continue from the existing state. It must not restart the project.
