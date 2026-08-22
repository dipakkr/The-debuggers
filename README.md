# ADVERSARIAL FRAUD ARENA

> Generate tomorrow's fraud today.

```text
AI RED TEAM -> SYNTHETIC PAYMENT NETWORK -> FRAUD DEFENSE
     ^                                        |
     |                                DETERMINISTIC REFEREE
     |                                        |
     +-------------- AI BLUE TEAM <-----------+
```

**IDENTIFY -> GENERATE -> DEFEND**

Fraud models learn from attacks that already happened. The Arena generates new attacks before they reach production.

The Red Team evolves bounded synthetic payment attacks against a real detector. The Blue Team investigates a confirmed failure.

The Referee owns all labels, metrics, seeds, gates, and replay results. Neither AI grades itself.

Repository: [namangoyal3/mastercard-innovation-challenge](https://github.com/namangoyal3/mastercard-innovation-challenge)

Public prototype: [adversarial-fraud-arena-production.up.railway.app](https://adversarial-fraud-arena-production.up.railway.app)

## The product

The Arena runs one complete payment-defense loop:

```text
IDENTIFY -> GENERATE -> ATTACK -> EVADE -> DISCOVER -> DEFEND -> REPLAY -> MEASURE
```

The application includes these judge-visible views:

- The Command Center shows the live Red, Rail, Blue, and Referee state.
- Threat Intelligence shows ten defensive threat families.
- Fraud Evolution shows every parent, child, verdict, and fitness result.
- Blue Investigation shows measured failure evidence and a bounded proposal.
- Defense Validation shows the gate verdict, held-out metrics, and exact replay.
- Experiment Audit shows seeds, versions, identifiers, and authoritative results.

The application labels all activity as a **SYNTHETIC PAYMENT ENVIRONMENT**.

## Quick start

Use Node.js 22.

```bash
npm ci
npm run evidence
npm run selfcheck
npm run dev
```

Open `http://localhost:3000`.

Select **RUN RED TEAM**. Then complete these actions:

1. Wait for the blind-spot alert.
2. Select **INVESTIGATE**.
3. Select **VALIDATE DEFENSE**.
4. Review the held-out metrics and exact replay.

## Demo mode and live mode

Demo mode needs no API key or internet connection. It uses reviewed reasoning fixtures through the same strict contracts.

The simulator, detector, mutation loop, Referee, Defense Gate, metrics, and replay always run as real code.

Configure live mode with an OpenAI-compatible endpoint:

```bash
OPENAI_API_KEY=<key> \
OPENAI_BASE_URL=https://api.openai.com/v1 \
ARENA_MODEL=<model> \
npm start
```

**Warning:** Never commit a real API key.

The application falls back to the reviewed policy after a provider timeout or invalid response.

## Architecture

| Stage | Owner | Implementation |
|---|---|---|
| IDENTIFY | GenAI or reviewed fixture | Threat interpretation with a strict output schema |
| GENERATE | GenAI or deterministic policy | Outcome-conditioned Fraud Genome mutation |
| ATTACK | Deterministic code | Seeded scenario compiler and payment simulator |
| DEFEND | ML and rules | Logistic regression, rules, and bounded graph signals |
| INVESTIGATE | GenAI or deterministic policy | Evidence-grounded failure and defense hypotheses |
| MEASURE | Deterministic code | Metrics, novelty, fitness, gates, replay, and audit records |

The Fraud Genome contains only allowlisted behavioral fields. The schema rejects unsupported families and invalid values.

The Red Team receives the previous verdict, fitness, reason codes, lineage, and the remaining mutation budget.

The Red Team uses bounded evolutionary search. Generation N depends on the outcomes from Generation N-1.

The baseline combines calibrated rules with a trained logistic regression model. It catches known attack templates before Red begins.

The advanced defense adds two graph-derived convergence signals. The Defense Gate accepts only measured improvements.

## Measured evidence

Run `npm run evidence` to reproduce the current deterministic experiment.

The committed evidence records commit `3bdb804` and fixed seeds.

| Metric | Known-template baseline | Held-out attack before | Held-out attack after |
|---|---:|---:|---:|
| Fraud recall | 92.54% | 41.11% | 50.00% |
| Precision | 6.85% | 4.20% | 4.57% |
| F1 | 12.76% | 7.63% | 8.38% |
| False-positive rate | 2.84% | 2.84% | 3.17% |
| False-negative rate | 7.46% | 58.89% | 50.00% |
| Average precision | 65.41% | 13.38% | 14.54% |

The accepted defense reduced attack success for four of five fresh descendants. One descendant showed no change.

The exact replay changed 24 decisions on the same stored scenario and seed.

These results prove a prototype behavior. They do not claim production effectiveness.

## Performance benchmark

Run `npm run bench` to create `data/evidence/benchmark.json`.

The benchmark uses five trials on Node.js 22 and an Apple Silicon Mac.

| Transactions | Generation | Feature pass | Scoring | Peak RSS | Experiment |
|---:|---:|---:|---:|---:|---:|
| 1,053 | 1.61M tx/s | 438,674 tx/s | 944,535 tx/s | 93 MB | 5 ms |
| 10,308 | 2.80M tx/s | 281,774 tx/s | 1.55M tx/s | 150 MB | 46 ms |
| 101,673 | 2.37M tx/s | 247,602 tx/s | 2.08M tx/s | 329 MB | 508 ms |

The prototype uses one process. The results do not represent Mastercard-scale performance.

## Scientific method

The Referee separates four environments:

1. The training set fits the baseline on known fraud templates.
2. The Red search set supports adaptive attack exploration.
3. The Blue development set supports the defense hypothesis.
4. The final test uses fresh attack seeds and legitimate traffic.

The Referee confirms a blind spot across four fresh seeds. The Defense Gate then uses five held-out descendants.

The gate requires these conditions:

- The threat recall gain equals at least five percentage points.
- The false-positive increase stays within one percentage point.
- At least 80 percent of fresh descendants improve.
- The exact replay uses the stored scenario and seed.

See [the methodology](docs/methodology.md) for the formulas and split rules.

## Security model

The repository contains no real cards, customers, credentials, or payment endpoints.

The guards reject these inputs:

- Real PAN, CVV, OTP, and IBAN patterns
- Prompt injection in merchant or threat text
- Unsupported attack types
- Out-of-range attack parameters
- Oversized requests
- Unsafe external provider URLs
- Malformed model artifacts
- LLM-generated metrics or verdicts

The test suite checks provider failure, malformed output, one repair attempt, and deterministic fallback behavior.

## Verification

Run the complete repository check:

```bash
npm run selfcheck
```

The command runs the linter, type checker, tests, evidence validation, and production build.

Generate a continuation file for another coding agent:

```bash
npm run handoff
```

The command creates an ignored `CLAUDE_RESUME.md`. It never reads or writes environment secrets.

## Documentation

- [Approved blueprint](docs/superpowers/specs/2026-08-22-adversarial-fraud-arena-design.md)
- [Architecture](docs/architecture.md)
- [Threat research](docs/threat-research.md)
- [Experimental methodology](docs/methodology.md)
- [Measured evaluation](docs/evaluation.md)
- [Rubric coverage](docs/rubric-coverage.md)
- [Security threat model](docs/threat-model.md)
- [Responsible AI](docs/responsible-ai.md)
- [Judge questions](docs/judge-qa.md)
- `docs/Adversarial-Fraud-Arena-Solution.docx`

Generate the Word document with `npm run docx`.

## Limits

The simulator uses stylized synthetic behavior. A production system needs authorized network data and institution-specific calibration.

The graph defense models merchant convergence only. It does not model a complete cross-institution identity network.

The prototype runs in one process. Production deployment needs durable storage, workload isolation, and independent model governance.

## License

MIT
