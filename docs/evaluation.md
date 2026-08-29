# Measured evaluation

Every number here is produced by the Referee and read straight out of
`data/evidence/latest.json` and `data/evidence/benchmark.json`.

**This file is generated.** Run `npm run evidence && npm run docs` to regenerate it.
Do not edit the numbers by hand — hand-editing is exactly how a claim drifts away from
the evidence that is supposed to support it.

Generated 2026-08-29T00:55:55.964Z from commit `1d0a953f5dc1`.

## Experiment identity

| Field | Value |
|---|---|
| dataset version | `synth-pop-1.3.0` |
| attack version | `genome-1.2.0` |
| detector version | `risk-engine-1.1.0` |
| defense version | `risk-engine-2.0.0` |
| reasoning version | `demo-policy-v1` |
| train seed | `10101` |
| search seed | `20202` |
| blue_dev seed | `30303` |
| final_test seed | `40404` |

## Attack families compiled end to end

- `card_testing_drain`
- `low_and_slow`
- `mule_fanout`
- `account_takeover`
- `transaction_splitting`

## The blind spot

```json
{
  "family": "mule_fanout",
  "amount": {
    "base": 154,
    "jitter": 0.2,
    "drain_multiplier": 1
  },
  "velocity": {
    "tx_per_hour": 3
  },
  "temporal": {
    "start_hour_utc": 14,
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
    "regularity": 0.5,
    "drain_after_probe": false
  },
  "takeover": {
    "victim_reuse": false,
    "recon_tx_count": 0,
    "dwell_hours": 0
  },
  "split": {
    "count": 1,
    "merchant_spread": 1,
    "ceiling_ratio": 0.9
  }
}
```

Discovered at generation 2, seed `38058`, evading 75.00% of
its transactions with a median risk score of 0.0329. The detector's catch
reasons on this scenario were `ODD_HOUR`, `AMOUNT_ANOMALY`, `VELOCITY_HIGH` — none of
which describe what the attack actually is, which is the point.

## Blue Team proposal

Source: `policy`.

> Evaded transactions are part of a coordinated newcomer burst: several recently-minted identities make their first payments at one merchant within 48 hours. Point-wise features stay individually mild, so the linear score under-fires while the cluster structure is visible in the merchant graph.

Evidence cited (all of it Referee output, none of it self-reported):

- median newcomer_count_48h on misses = 2.00
- median newcomer_burst_score on misses = 0.62
- median amt_z on misses only 1.75 — below classic anomaly thresholds
- catch reasons concentrate elsewhere: ODD_HOUR, AMOUNT_ANOMALY, VELOCITY_HIGH

Proposed configuration: `{"threshold":0.865,"escalation_weight":0,"pattern_weight":0,"graph_weight":0.6,"structuring_weight":0,"takeover_weight":0}`,
confidence 0.72.

Reproduce everything below with `npm run evidence`. The committed run records commit
`1d0a953f5dc1` and the fixed seeds `train=10101`, `search=20202`,
`blue_dev=30303`, `final_test=40404`.

### The detector on attacks it was trained to catch

81 fraud transactions against 29,948 legitimate ones — a 0.27% fraud rate,
chosen to match reported card-fraud prevalence rather than to flatter the numbers.

| Metric | Value |
|---|---:|
| Recall — declined | 70.37% |
| Recall — declined or held for review | 87.65% |
| Precision (on declines) | 50.00% |
| F1 (on declines) | 58.46% |
| ROC-AUC | 98.02% |
| Average precision | 59.89% |
| False-positive rate | 0.19% |
| Review rate | 1.57% |

Precision and F1 are always computed on the strict **decline** definition, so recall can
never be bought by pushing traffic into the review queue.

### The detector on an attack the red team evolved

The red team found `AF-1013` at generation 2 — a mule fanout variant
descended from `AF-1008` that evades 75.00% of its own transactions.
The Referee reproduced that evasion across four fresh seeds before the Blue Team was allowed to see it.

| Metric | Before defense | After defense | Change |
|---|---:|---:|---:|
| Recall — declined | 14.44% | 27.78% | +13.33 pts |
| Recall — declined or held for review | 44.44% | 70.00% | +25.56 pts |
| Precision (on declines) | 18.84% | 26.04% | +7.20 pts |
| F1 (on declines) | 16.35% | 26.88% | +10.53 pts |
| ROC-AUC | 83.28% | 87.30% | +4.02 pts |
| Average precision | 10.51% | 15.04% | +4.54 pts |
| False-positive rate | 0.19% | 0.24% | +0.05 pts |
| Review rate | 1.57% | 1.83% | +0.26 pts |

Recall counting review holds rises from **44.44% to 70.00%**
for +0.050 pts of false positives and +0.26 pts of extra analyst load.

**This is a paired result, not two independent samples.** Both runs scored the same
transactions, so McNemar's test applies: 23 transactions were newly caught and
0 were newly missed, p < 0.001. 95% Wilson intervals on the decline
recall are 8.6%–23.2% before and 19.6%–37.8% after.

### Why the defense is a new signal and not a lower threshold

The most important table in this repository is the operating curve of the *unchanged*
detector across the *whole* score range on the discovered attack:

| Threshold | Precision | Recall | F1 | False positives |
|---:|---:|---:|---:|---:|
| 0.30 | 4.40% | 62.22% | 8.21% | 1,218 |
| 0.40 | 5.81% | 60.00% | 10.60% | 875 |
| 0.50 | 6.53% | 50.00% | 11.55% | 644 |
| 0.60 | 6.90% | 38.89% | 11.73% | 472 |
| 0.70 | 8.43% | 33.33% | 13.45% | 326 |
| 0.80 | 9.95% | 24.44% | 14.15% | 199 |
| 0.90 | 11.11% | 13.33% | 12.12% | 96 |

There is no operating point that rescues this attack. Lowering the threshold buys false
positives, not recall. That is the argument for the Arena: a novel attack is not a
calibration problem, it is a **missing feature** problem, and you only find out which
feature is missing by generating the attack first.

### Fresh-seed survival

The gate re-evaluates on five fresh-seed recompiles of the blind-spot genome that the
Blue Team never saw.

| Descendant | Evasion before | Evasion after | Result |
|---|---:|---:|---|
| `AF-1013-H0` | 83.33% | 25.00% | Improved |
| `AF-1013-H1` | 100.00% | 50.00% | Improved |
| `AF-1013-H2` | 75.00% | 41.67% | Improved |
| `AF-1013-H3` | 41.67% | 16.67% | Improved |
| `AF-1013-H4` | 58.33% | 33.33% | Improved |

### Acceptance budgets

The Referee accepts or rejects; neither AI votes. Verdict: **ACCEPTED**.

| Check | Measured | Budget | Result |
|---|---:|---:|---|
| Threat recall gain | +25.56 pts | ≥ +5 pts | PASS |
| False-positive increase, absolute | +0.050 pts | ≤ +0.25 pts | PASS |
| False-positive increase, relative | 27% | ≤ 100% | PASS |
| Extra review-queue load | +0.26 pts | ≤ +0.50 pts | PASS |
| Fresh descendants improved | 5 of 5 | ≥ 80% | PASS |

A flat one-point false-positive allowance was sized for a detector running near 2.8% FPR.
At 0.19% it would wave through a five-fold increase, so both an absolute and a
relative ceiling apply, plus a budget on the review queue itself.

### Exact replay

Two replays are reported, and they are **not** interchangeable:

- **Discovery scenario** `AF-1013`, seed `38058` — the stored genome and
  the stored seed, rescored under both defenses. **5 decisions changed.** This is the causal
  claim about the very attack that was found.
- **Fresh-seed recompiles** of the same genome — **28 decisions changed** across 5 descendants.
  This is a generalisation check and is never presented as evidence about the stored scenario.

### Detector under the hood

`risk-engine-1.1.0` — calibrated rules plus logistic regression over 8 behavioural features.

| Feature | Weight |
|---|---:|
| `amt_z` | 0.487 |
| `vel_1h` | 0.654 |
| `vel_24h` | 0.702 |
| `hour_outside_pref` | 4.690 |
| `new_device` | 5.483 |
| `new_merchant` | 0.045 |
| `probe_count_24h` | 1.314 |
| `near_limit_repeat_24h` | 0.686 |

Bias -5.885. Block threshold 0.895, review threshold 0.5674.

The operating point is swept for maximum F1 at **0.3% deployment fraud prevalence**
under a 0.3% false-positive ceiling. The previous calibration took a fixed 98th
percentile of legitimate scores, which pins the false-positive rate at roughly 2% by
construction and caps precision in the single digits regardless of how well the model
separates the classes.

### Throughput

5 trials per scale on Node.js `v25.1.0`, `darwin-arm64`, single process.

| Transactions | Generation | Feature pass | Scoring | p95 scoring | Peak RSS | Experiment |
|---:|---:|---:|---:|---:|---:|---:|
| 1,053 | 2,117,115 tx/s | 327,002 tx/s | 1,009,185 tx/s | 1 µs | 104 MB | 5 ms |
| 10,232 | 1,963,178 tx/s | 257,415 tx/s | 1,606,311 tx/s | 1 µs | 218 MB | 54 ms |
| 101,681 | 2,099,674 tx/s | 183,887 tx/s | 2,051,601 tx/s | 0 µs | 470 MB | 672 ms |

No network, database, queue or provider latency is included, and no network-scale claim
is made.



## Test evidence

Run `npm run selfcheck` for the linter, type checker, full test suite and production
build. The suite covers legitimate-traffic robustness, outcome-conditioned mutation and
lineage, schema and boundary rejection, blind-spot confirmation, metric integrity
including tie-aware ROC-AUC and average precision, the paired significance test, the
exact replay, prompt-injection and credential guards, provider timeout and malformed
output handling, and byte-identical reruns from identical seeds.
