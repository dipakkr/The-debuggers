# Experimental methodology

The Referee is the only component permitted to produce a number. Neither the Red Team
nor the Blue Team may assert a metric, a label, a fitness value or a verdict; they
propose, and deterministic code measures.

## Four separated environments

| Environment | Seed | Purpose | Who may see it |
|---|---|---|---|
| Training | `10101` | Fit the baseline on loud attack templates | Nobody at run time |
| Red search | `20202` | Adaptive attack exploration | Red Team |
| Blue development | `30303` | Blind-spot confirmation, failure evidence | Blue Team |
| Final test | `40404` | Gate evaluation, survival, replay | Neither — Referee only |

The Blue Team forms its hypothesis on development evidence and is graded on the final
test. Gate seeds are constants, not derived from wall-clock time, so a verdict cannot
depend on when it was run.

## Burn-in and evaluation window

Streams start cold. Behavioural features — amount z-score, velocity, device novelty,
cadence regularity — are meaningless until a customer has history. The first 16 days of
the 30-day backdrop are burn-in and are excluded from every metric denominator, as are
attacker warm-up rows, which exist to give features context and are labelled legitimate.

## Choosing the operating point

This is the single most consequential methodological decision in the repository.

A fraud detector produces a score; a *threshold* turns that score into a decision. The
original calibration set the block threshold at the 98th percentile of legitimate scores.
That pins the false-positive rate near 2% **by construction**, and precision is bounded by
prevalence:

```
precision(π) = π·TPR / (π·TPR + (1 − π)·FPR)
```

At π ≈ 0.003 and FPR = 0.02, precision cannot exceed roughly 7% even with perfect recall.
The reported F1 then describes the threshold, not the model — and indeed the model's
ROC-AUC was 0.99 while its reported F1 was 12.8%.

The threshold is now **swept for maximum F1 at deployment prevalence**, subject to a hard
false-positive ceiling. Two details matter:

1. **Prevalence adjustment is analytic, not by subsampling.** Throwing away positives to
   reach a 0.3% base rate leaves about 18 fraud rows and a very noisy sweep. TPR and FPR
   are prevalence-independent, so they are estimated on the full validation slice (452
   fraud rows) and converted to precision with the formula above.
2. **Two thresholds, two costs.** A decline is expensive and irreversible; an analyst
   review is cheap. The block threshold is swept for F1; the review threshold is set at a
   legitimate-score quantile so recall-with-review stays high without paying the precision
   cost on declines.

## Calibration provenance

Every number in this repository is measured inside our own simulator. That is the
design — a closed loop needs a world it fully controls — but it means the *fidelity*
of the world is an assumption, not a result. This table states, parameter by
parameter, whether a value is anchored to a published figure or simply assumed.
Rows marked **assumed** are chosen for plausibility and internal coherence; they
are not fitted to any real network's data, and we do not claim otherwise.

| Parameter | Value | Basis |
|---|---|---|
| Population size | 1,200 customers, 300 merchants | **Assumed.** Sized so cross-account graph structure is observable while an experiment stays under a second. |
| Per-customer spend | lognormal, mean drawn from $18–$90, CV 0.3–0.75 | **Assumed.** Lognormal is the standard shape for consumer transaction amounts; the parameters are not fitted. |
| Arrival process | Poisson, 0.3–3.2 payments/day per customer | **Assumed.** Poisson arrivals with per-customer intensity; rate range chosen to span light and heavy users. |
| Merchant ticket sizes | MCC base × U(0.6, 1.6) | **Assumed.** Relative ordering across MCCs (grocery < electronics < travel < luxury) is realistic; absolute values are not sourced. |
| Merchant loyalty | 88% of payments at a preferred merchant | **Assumed.** |
| Device churn | 25% of customers carry a second device; 10% of payments on it | **Assumed.** |
| Young accounts | ~8% of the population under 30 days old | **Assumed.** Present so the graph gate must tolerate genuine newcomers without exploding false positives — an explicit test. |
| Cross-border share | 4% of legitimate payments | **Assumed rate**, but the *asymmetry* it creates is sourced: the EBA/ECB 2024 payment-fraud report finds card fraud is disproportionately cross-border, with cross-border fraud rates substantially higher than domestic and roughly 30% of card-fraud value involving transactions outside the EEA. Legitimate cross-border spend therefore has to be the exception for the geography signal to mean anything — an earlier version drew transaction country from the merchant, which inverted the signal entirely. |
| Fraud prevalence in the evaluation pools | 0.27% **by transaction count** | **Deliberately higher than reality, and stated as such.** The Nilson Report puts 2024 global card-fraud losses at $33.41bn against $51.92tn of card volume — about **6.4 basis points of value**. That is a value-weighted figure and not directly comparable to a count-weighted one (fraudulent tickets skew larger), but a realistic count-based rate would still be well below 0.27%. We hold the pools fraud-richer than reality so that 81 and 90 fraud transactions exist to measure at all; the consequence is that reported precision is *optimistic* relative to production, which is why the operating point is calibrated separately. |
| Operating-point prevalence | 0.3% | Matched to the evaluation pools above, so the threshold is chosen for the prevalence it will actually face rather than for the fraud-dense training pool. |
| Decline / review split | block ≥ 0.895, review ≥ 0.5674 | **Derived, not assumed.** Swept for maximum F1 at deployment prevalence under a 0.3% false-positive ceiling. The two-tier split mirrors how networks separate auto-declines from analyst queues; the specific thresholds fall out of the sweep. |
| Burn-in | 16 of 30 backdrop days excluded | **Derived.** Behavioural features are meaningless until a customer has history. |

**What would make this stronger.** Fitting the amount and cadence distributions to an
authorized network extract, and re-deriving the operating point against that
institution's own fraud rate and cost-of-decline. Neither is possible on public data
alone, and both are listed in the production roadmap rather than approximated here.

## Two recall definitions, reported together

- `fraud_recall` counts only **block** — an automatic decline.
- `recall_with_review` counts **block or review** — a decline or an analyst hold.

Both are always reported. Precision, F1 and FPR are computed **only** on the strict block
definition, so a defense cannot manufacture recall by pushing traffic into the review
queue — and the gate budgets the extra queue load on top of that.

## Declines require corroboration

An amount or odd-hour outlier on a familiar device, with no velocity, probe, structuring
or graph support, is held for an analyst rather than refused. A wrongly declined genuine
high-value purchase is the most expensive false positive a network can make. Note that
`escalation_score` is derived from the amount itself and therefore cannot corroborate an
amount anomaly — that would be the same evidence counted twice.

## Novelty

Novelty is Euclidean distance in normalised genome space, log-scaled on multiplicative
dimensions, measured **against templates of the same family only**. Measuring against all
templates would score a card-testing variant as novel merely for differing from a
mule-fanout template. Threshold τ = 1.2.

## Fitness

```
F = evasion + novelty_bonus − realism_penalties
```

Computed exclusively by deterministic code from Referee outcomes. The Red Team may
optimise toward it; it may never report it. Penalties fire on machine-speed probing and
implausible cash-out sizes, so the search cannot win by proposing behaviour no real
attacker could execute.

## Blind-spot confirmation

A candidate that evades on its search seed is not yet a blind spot — it may be seed luck.
The Referee recompiles the same genome under four fresh seeds on a different legitimate
pool and requires the median evasion to hold. Only then is the Blue Team allowed to see it.

## Acceptance budgets

| Check | Budget | Why |
|---|---|---|
| Threat recall gain | ≥ +5 pts | The change must do something material |
| False-positive increase, absolute | ≤ +0.25 pts | Hard ceiling on wrongly declined payments |
| False-positive increase, relative | ≤ +100% | A flat allowance sized for a 2.8% FPR would wave through a five-fold increase at 0.19% |
| Extra review-queue load | ≤ +0.50 pts | Recall counting holds must not be bought with analyst load |
| Fresh descendants improved | ≥ 80% | The fix must generalise across seed variation, not fit one scenario |

## Significance

Before and after score **the same transactions** — identical scenarios, identical seeds,
identical legitimate pool. The comparison is therefore paired, and McNemar's test is the
correct statistic; an unpaired two-proportion test would understate the evidence. The
continuity-corrected chi-square is used once b + c ≥ 25 and an exact binomial tail below
that. Recall is additionally reported with a 95% Wilson interval, which is preferred over
the normal approximation because the fraud counts are small and the proportions sit near
the ends of [0, 1].

## Replay

Two replays are produced and reported separately:

- the **discovery scenario**, recompiled from its stored genome and stored seed — the
  causal claim about the attack that was actually found;
- **fresh-seed recompiles** of the same genome — a generalisation check.

Conflating them allows a diff made entirely of fresh-seed rows to be presented as
evidence about the stored scenario. An earlier version of this repository did exactly
that, and the stored scenario had in fact changed zero decisions.

## Reproducibility

Compilation is a pure function of `(genome, seed, world)`. Transaction ids are assigned
once at generation time and never renumbered, so replays stay byte-exact even when merge
orders differ. Experiment ids are content-derived: the same experiment run twice produces
the same id. `npm run evidence` regenerates the entire bundle; `npm run docs` regenerates
every measured document from it.
