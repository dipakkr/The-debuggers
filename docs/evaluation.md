# Evaluation

All numbers below are produced by `lib/referee` on this repository's fixed seeds. Reproduce with `npm test` and the API walkthrough in the README.

## Baseline detector (v1)

Logistic regression over 7 behavioural features + 2 policy rules, trained by `npm run train` on the TRAIN split (world seed 20260822, train seed 10101).

| Measure | Value (held-out FINAL pool) |
|---|---|
| Recall on loud canonical templates | 0.925 |
| False-positive rate (blocks) | 0.0284 |
| Review rate | ~0.014 |
| p95 scoring latency per transaction | ≤ 0.001 ms |

The baseline is not a strawman: it catches card-testing bursts 22/22 and loud mule bursts 18/18 at calibration time.

## Red-team discovery

- Blind spot confirmed after **2 generations** of outcome-conditioned mutation (mule lineage).
- Confirmation pass: evasion must hold a median attack-success ≥ 0.34 across **4 fresh seeds** — seed-luck does not qualify.
- On 5 held-out fresh-seed recompiles of the discovered genome, v1 allowed **42–100%** of fraud rows (median ≈ 58%).

## Defense validation

Blue proposal (from measured false-negative evidence): `graph_weight = 0.6`, threshold −3 points.

Gate result on FINAL split:

| Fresh-seed variant | Attack success v1 | Attack success v2 |
|---|---|---|
| H0 | 0.83 | 0.42 |
| H1 | 1.00 | 0.50 |
| H2 | 0.58 | 0.33 |
| H3 | 0.50 | 0.42 |
| H4 | 0.42 | 0.42 |

- Threat-class caught-rate gain: **≥ +11 points** (gate bar: +5).
- ΔFPR: **+0.33 points** (budget: +1).
- Seed survival: **4/5 improved** (bar: 80%).
- Verdict: **ACCEPTED**.
- Exact replay: **24 transactions** change decision between engines on identical compiled streams.

A rejected defense is also a valid referee outcome; the ledger records both.

## Throughput (measured, not extrapolated)

`npm run bench` on Node 22, single process:

| Stage | Rate |
|---|---|
| Legit stream generation | ~2.4M tx/s |
| Feature pass | ~316k tx/s |
| Scoring | ~1.7M tx/s |
| Per-tx p95 latency | ≤ 1 ms |

End-to-end the prototype sustains roughly 260k tx/s, bounded by the feature pass. Horizontal scaling path: shard by customer/merchant partition; features are per-customer plus per-merchant local state only.

## Test suite

26 vitest tests cover the T1–T25 matrix from the challenge contract: legitimate allow, known-fraud block, schema rejection, injection neutrality, credential rejection, provider-timeout fallback, replay byte-stability, load smoke. Run `npm run selfcheck` (lint + typecheck + tests + build).
