# Coverage against the published judging criteria

The competition names five criteria. This matrix maps each to the artifact that answers
it and the exact evidence a judge can check. No score is claimed — only coverage.

## 1. Diversity of attacks identified

| Evidence | Where |
|---|---|
| 19 GenAI-accelerated fraud families across 7 categories | `lib/threat-intel/families.ts`, [threat research](threat-research.md) |
| Card-present, card-not-present, identity, instant rails, social engineering, merchant-side and agentic surfaces | Threat Intelligence view, grouped by category |
| Each family carries a GenAI mechanism, observable payment signals, the existing control, and the specific blind spot | Every entry; enforced by test |
| 5 families compiled and scored end to end | `ATTACK_FAMILIES`; the corpus marks exactly these as simulated, enforced by test |
| Families that need a different sensor are documented as such, not faked | Authorised push payment, deepfake KYC, voice-clone step-up, first-party chargeback |

Two of the five simulated families — account takeover and structuring — were added
specifically because the genome already carried the dimensions to express them
(`device.age_days`, `device.geo_jump_km`) and nothing used them.

## 2. Fidelity of attacks in simulation

| Evidence | Where |
|---|---|
| 1,200-customer synthetic network with per-customer amount, cadence, hour-window, device and merchant preferences | `lib/simulator/world.ts` |
| Lognormal amounts, Poisson arrivals, ~8% young accounts, home-country spend with genuine cross-border as the exception | Same |
| Account takeover rides an **existing** population account, so its cover history is genuine simulated behaviour | `compileScenario`, `victim_customer_ids`; enforced by test |
| Attacker warm-up history so behavioural features are meaningful, excluded from metric denominators | `warmupFor`, referee eval filter |
| Bounded genome: 17 numeric dimensions, 4 categorical flags, every range schema-enforced | `lib/contracts/genome.ts` |
| Realism penalties in fitness reject machine-speed probing and implausible cash-outs | `lib/referee/fitness.ts` |
| Compilation is a pure function of (genome, seed, world) | Enforced by determinism tests |

Three fidelity bugs found and fixed during development are documented in the README, most
consequentially that legitimate transaction country was taken from the merchant's
registered country, making cross-border spend a *legitimate*-traffic signal.

## 3. Detection algorithm efficacy

| Evidence | Where |
|---|---|
| ROC-AUC 0.980, F1 58.5%, precision 50.0% at 0.19% FPR on known templates | [evaluation](evaluation.md), generated from evidence |
| Rank-based tie-aware ROC-AUC and tie-aware average precision | `lib/metrics/metrics.ts`, enforced by test |
| Operating point swept for max F1 at deployment prevalence, not a percentile cut | `scripts/train.ts`, [methodology](methodology.md) |
| Both recall definitions reported; precision and F1 always on the strict decline definition | `computeMetrics` |
| Full precision/recall/F1 curve across the score range, for templates *and* for the evolved attack | Detection Engine view, evidence bundle |
| Paired McNemar test and 95% Wilson intervals on every headline delta | `lib/metrics/stats.ts` |
| Declines require corroboration; an uncorroborated outlier is held, never refused | `scoreFeaturized`, enforced by test |

The evolved-attack curve is the important one: the unchanged detector's F1 stays below
15% at *every* threshold, which is the evidence that the fix has to be a new feature
rather than a new threshold.

## 4. Novelty of the overall solution

| Evidence | Where |
|---|---|
| Closed loop, not a classifier: attacks generated become the training and stress-testing ground for the defense, and the defense's gaps feed back | Whole system |
| Adversary bounded by a schema rather than by prompt instructions — it cannot express arbitrary behaviour | `GenomeSchema` |
| Deterministic Referee owns all truth; neither AI grades itself | `lib/referee/` |
| Outcome-conditioned evolution: mutations are driven by the detector's own reason codes | `demoMutation`, `summarizeExperimentMemory` |
| Blind spots must survive four fresh seeds before they count | `runGeneration` |
| Defense acceptance is a deterministic budget test with a paired significance result | `gateDecision`, `runDefenseGate` |
| Measured documents are generated from the evidence bundle so claims cannot drift | `scripts/render-docs.ts` |

## 5. Real-world feasibility in live payments

| Evidence | Where |
|---|---|
| Operating point chosen for deployment fraud prevalence, with an explicit FPR ceiling | `scripts/train.ts` |
| Decline / review / allow separation matching how networks actually run queues | `scoreFeaturized`, `computeMetrics` |
| Review-queue load is itself budgeted | `GATE_BUDGETS` |
| Feature computation is a single streaming pass over time-sorted transactions | `featurize` |
| ~2.0M transactions/second scoring, ~184k/s feature pass, 100k rows in 672 ms, single process | [evaluation](evaluation.md) |
| Sub-millisecond per-transaction latency measured in hrtime nanoseconds | Same |
| Every experiment written to an append-only ledger with seeds, versions and a content-derived id | `lib/referee/ledger.ts` |
| Per-session isolation so concurrent reviewers do not overwrite each other | `lib/session.ts` |
| Guards for PAN/CVV/OTP/IBAN, prompt injection, oversized payloads, unsafe provider URLs | `lib/guards/injection.ts` |

## Stated limits

Synthetic behaviour is calibrated to plausible distributions, not to any real network's
data. The graph defense models merchant convergence only. Held-out fraud samples are 81
and 90 transactions, which is why deltas ship with intervals and a paired test. One
process, in-memory sessions; production needs durable storage, workload isolation,
authorized data and independent model governance.
