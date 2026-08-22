# Measured Evaluation

The Referee produced all results in this document. The file `data/evidence/latest.json` stores the source values.

Run this command to reproduce the experiment:

```bash
npm run evidence
```

## Evidence identity

| Field | Value |
|---|---|
| Evidence commit | `3bdb8040b0bf076946d39aa9d4846ade798706f2` |
| Dataset | `synth-pop-1.2.0` |
| Attack contract | `genome-1.1.0` |
| Baseline detector | `risk-engine-1.0.0` |
| Candidate defense | `risk-engine-2.0.0` |
| Reasoning policy | `demo-policy-v1` |
| Training seed | `10101` |
| Red search seed | `20202` |
| Blue development seed | `30303` |
| Final test seed | `40404` |

## Baseline on known templates

The baseline uses calibrated rules and a trained logistic regression model. The evaluation contains 29,648 legitimate and 67 fraud transactions.

| Metric | Value |
|---|---:|
| Fraud recall | 92.54% |
| Precision | 6.85% |
| F1 | 12.76% |
| False-positive rate | 2.84% |
| False-negative rate | 7.46% |
| Review rate | 1.48% |
| Average precision | 65.41% |

The low precision reflects the intentionally imbalanced payment stream. The system never uses accuracy as a headline metric.

## Red discovery

Red found scenario `AF-1009` in generation 2. The scenario descends from `AF-1006`.

The attack uses the `mule_fanout` family and seed `38058`. Its discovery attack-success rate equals 75 percent.

The policy changed the synthetic behavior after earlier detector results. The stored lineage proves this dependency.

The Referee confirmed the blind spot with fresh seeds before the Blue Team received the scenario.

## Held-out defense result

The final test combines the new attack family with untouched legitimate traffic. It contains 29,648 legitimate and 90 fraud transactions.

| Metric | Before defense | After defense | Change |
|---|---:|---:|---:|
| Fraud recall | 41.11% | 50.00% | +8.89 points |
| Precision | 4.20% | 4.57% | +0.37 points |
| F1 | 7.63% | 8.38% | +0.75 points |
| False-positive rate | 2.84% | 3.17% | +0.32 points |
| False-negative rate | 58.89% | 50.00% | -8.89 points |
| Review rate | 1.48% | 1.56% | +0.08 points |
| Average precision | 13.38% | 14.54% | +1.15 points |

The Defense Gate accepted the proposal. The recall gain exceeded five points, and the FPR increase stayed below one point.

## Fresh-descendant survival

| Descendant | Attack success before | Attack success after | Result |
|---|---:|---:|---|
| `AF-1009-H0` | 83.33% | 41.67% | Improved |
| `AF-1009-H1` | 100.00% | 50.00% | Improved |
| `AF-1009-H2` | 58.33% | 33.33% | Improved |
| `AF-1009-H3` | 50.00% | 41.67% | Improved |
| `AF-1009-H4` | 41.67% | 41.67% | No change |

Four of five descendants improved. This result meets the 80 percent survival gate.

## Exact replay

The Referee recompiled scenario `AF-1009` with seed `38058`. It then scored the same transactions with both defense versions.

The replay recorded 24 decision changes. The committed evidence stores every changed transaction identifier and decision.

This replay provides causal evidence for the stored scenario. The fresh descendants provide the separate generalization check.

## Benchmark

The benchmark uses five trials per scale. It ran on Node.js `v22.22.3` and `darwin-arm64`.

| Transactions | Generation rate | Feature rate | Scoring rate | P95 scoring latency | RSS | Duration |
|---:|---:|---:|---:|---:|---:|---:|
| 1,053 | 1,605,183 tx/s | 438,674 tx/s | 944,535 tx/s | 0.001 ms | 93 MB | 5 ms |
| 10,308 | 2,800,961 tx/s | 281,774 tx/s | 1,547,573 tx/s | 0.001 ms | 150 MB | 46 ms |
| 101,673 | 2,367,510 tx/s | 247,602 tx/s | 2,079,713 tx/s | 0.000 ms | 329 MB | 508 ms |

The timer rounds very short per-row values to three decimals. Use throughput and experiment duration for this in-process benchmark.

The benchmark does not include network, database, queue, or provider latency. It does not claim Mastercard-scale performance.

## Test evidence

The test suite covers the required T1 through T25 behaviors and extra contract checks.

The checks include these areas:

- Known fraud and legitimate traffic
- Outcome-conditioned mutations and lineage
- Schema and boundary rejection
- Blind-spot confirmation and metric integrity
- Blue evidence and proposal validation
- Exact replay and held-out descendants
- False-positive regression
- Prompt injection and credential rejection
- Provider timeout and malformed output
- Stable seeds, versions, and experiment identifiers
- UI accessibility and load smoke tests

Run `npm run selfcheck` to execute the complete repository check.
