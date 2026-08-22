# Experimental Methodology

## Objective

The experiment tests one claim: an adaptive synthetic attacker can expose a detector blind spot before production.

It then tests a second claim: a bounded defense can improve held-out detection within an FPR budget.

## Environment isolation

The Referee owns four fixed seeds.

| Environment | Seed | Purpose |
|---|---:|---|
| Training | `10101` | Fit the baseline on known legitimate and fraud patterns |
| Red search | `20202` | Evolve attacks against the baseline |
| Blue development | `30303` | Build the failure and defense hypothesis |
| Final test | `40404` | Test fresh descendants and legitimate regression |

The Blue Team never receives the final-test outcomes before it creates the proposal.

## Baseline

The baseline combines two deterministic rules with a trained logistic regression model.

The model uses amount, velocity, time, device, merchant, probe, and account-age signals.

The baseline must catch known card-testing and mule-burst templates. The T2 and T3 tests enforce this requirement.

## Adaptive search

The Red Team starts from known templates. It creates bounded child genomes with outcome-conditioned mutations.

The engine keeps the strongest valid children. It stores each parent identifier, child identifier, result, and fitness value.

Generation N receives the results from Generation N-1. The lineage and memory tests enforce this dependency.

## Fraud Genome validity

The `GenomeSchema` defines every permitted attack dimension. The schema rejects unknown fields and out-of-range values.

The simulator accepts only validated genomes. It never executes text or code from an LLM.

## Novelty

The Referee computes a normalized behavioral distance from every baseline template.

It applies logarithmic scaling to multiplicative dimensions. It also includes categorical differences.

The novelty score equals the minimum distance to any training template. A score above `1.2` passes the novelty threshold.

Novel wording does not affect this score.

## Attack fitness

The Referee computes this objective:

```text
fitness = evasion + novelty_bonus - realism_penalties
```

Evasion equals the fraction of attack rows that the detector allows.

The novelty bonus equals `0.25 * min(1.2, novelty_score / 1.2)`.

The Referee subtracts a `0.5` penalty for machine-speed probing below 20 seconds.

The Referee subtracts a `0.5` penalty for a card drain value above 6,000 synthetic currency units.

The target is strong evasion among valid and plausible synthetic behavior.

## Blind-spot confirmation

A search result cannot declare itself a blind spot. The Referee recompiles it with four fresh seeds.

The result must retain a median attack-success rate of at least `0.34`. It must also pass novelty and validity checks.

The confirmation stage limits seed-specific discoveries.

## Blue investigation

The Blue Team receives the false negatives, feature medians, reason codes, genome, lineage, and aggregate metrics.

The output contract contains these fields:

- Failure hypothesis
- Supporting evidence
- Candidate features
- Recommended change
- Bounded defense configuration
- Expected tradeoff
- Confidence

Blue cannot submit metrics, labels, or a verdict through this contract.

## Defense Gate

The candidate defense adds bounded escalation, pattern, or graph weights. It can also adjust the decision threshold.

The gate accepts a proposal only when all conditions pass:

- Held-out threat recall improves by at least five percentage points.
- The legitimate FPR increase stays within one percentage point.
- At least four of five fresh descendants improve.
- The exact stored attack replays under both defense versions.

The gate can reject a plausible Blue proposal. The audit ledger stores either verdict.

## Exact replay and generalization

Exact replay uses the same scenario identifier, genome, seed, dataset version, and model versions.

The replay shows causal decision changes for one stored attack. It does not prove generalization.

The five fresh descendants provide the separate generalization test.

## Metric definitions

The system treats `block` as a positive fraud decision. It reports `review` separately.

| Metric | Definition |
|---|---|
| Fraud recall | `TP / (TP + FN)` |
| Precision | `TP / (TP + FP)` |
| F1 | Harmonic mean of precision and recall |
| False-positive rate | `FP / (FP + TN)` |
| False-negative rate | `FN / (TP + FN)` |
| Review rate | Reviewed legitimate rows divided by all legitimate rows |
| Average precision | Mean precision at each positive rank |
| Attack success rate | Allowed attack rows divided by all attack rows |
| Mutation robustness | Fraction of fresh descendants that improve after defense |

The system does not label average precision as PR-AUC. The implementation uses the exact average-precision formula.

## Reproducibility

Every experiment record stores these values:

- Experiment identifier
- Scenario and parent identifiers
- Random seed
- Dataset version
- Attack version
- Detector version
- Defense version
- Reasoning version
- Timestamp
- Metrics or verdict

The same seed and versions reproduce the same results. The tests exclude measured wall-clock latency from byte equality.

## Limits

The population and fraud behavior are synthetic. The results show system behavior, not real-world loss prevention.

The final test uses fresh seeds from the same simulator. A production study needs authorized external distributions.

The current graph signal covers synthetic customer-to-merchant convergence. It does not cover a full payment-network graph.
