# Adversarial Fraud Arena

**Mastercard Innovation Challenge 2026 · AI Defense Lab for Payment Security**
Team: **The debuggers**

> Generate tomorrow's fraud today.

```text
   AI RED TEAM ─────────▶ SYNTHETIC PAYMENT NETWORK ─────────▶ FRAUD DEFENSE
        ▲                                                           │
        │                    DETERMINISTIC REFEREE                   │
        │              (labels · metrics · seeds · gates)            │
        └───────────────────── AI BLUE TEAM ◀───────────────────────┘
```

Fraud models learn from attacks that have already happened. The Arena generates the next
attack first, proves the detector misses it, and then proves a specific fix works —
all against synthetic traffic, with a deterministic referee that neither AI can argue with.

![The Adversarial Fraud Arena command centre, showing a confirmed detector blind spot](docs/images/01-command-centre.jpg)

## Team

| Name | Registered email |
|---|---|
| Deepak Kumar | dipakkr.co@gmail.com |
| Naman Goyal | namangoyal21197@gmail.com |

- **Repository:** https://github.com/dipakkr/The-debuggers
- **Prototype:** https://adversarial-fraud-arena.vercel.app
- **Walkthrough:** [`The debuggers.docx`](./The%20debuggers.docx)

## The idea

Fraud models learn from attacks that already happened. The Arena generates the next one
first, proves the detector misses it, then proves a specific fix works — on synthetic
traffic, with a deterministic referee that neither AI can argue with.

The detector scores 0.98 ROC-AUC on attacks it was trained on. Against an attack the red
team evolved to evade it, F1 falls to the twenties and stays under 15% at *every*
threshold. That is the finding: a novel attack is a missing-feature problem, not a
calibration problem, and you only learn which feature is missing by generating it first.

![Precision, recall and F1 against the decision threshold. On known templates the curves separate cleanly and F1 peaks at the chosen operating point. On the evolved attack all three stay flat near zero across the entire range.](docs/images/02-operating-curves.jpg)

## How it works

| Stage | Owner | Implementation |
|---|---|---|
| Identify | GenAI or curated corpus | 20 threat families, 7 categories, strict output schema |
| Generate | GenAI or expert policy | Outcome-conditioned mutation of a bounded Fraud Genome |
| Attack | Deterministic | Seeded scenario compiler over a synthetic payment network |
| Defend | ML and rules | Logistic regression, policy rules, graph and session signals |
| Investigate | GenAI or expert policy | Failure hypotheses grounded in Referee output |
| Measure | Deterministic | Metrics, novelty, fitness, gates, replay, audit ledger |

The **Fraud Genome** is the only language the red team has: 17 numeric dimensions and 4
categorical flags, every range schema-enforced. It can express amounts, cadence, device
age and cohort size — not an operational method. Generation N is mutated from N−1 using
the detector's own reason codes.

Five families are compiled end to end: card testing, low-and-slow, mule fan-out, account
takeover, structuring. Account takeover rides an **existing** population customer, so its
cover history is real simulated behaviour. The other 15 are documented with the sensor
they would need — authorised push payment fraud and deepfake KYC are excluded because
their signal lives outside the transaction stream.

The **Referee** owns every label, metric, seed, novelty score, gate verdict and replay,
across four seed-separated environments. Neither AI grades its own work.

## Run it

Node 22+. No API key, no database, no internet — demo mode runs the whole loop on
deterministic policies.

```bash
git clone https://github.com/dipakkr/The-debuggers.git
cd The-debuggers && npm ci && npm run dev
```

Open http://localhost:3000 → **Run red team** ×2 → **Investigate** → **Validate at the
gate**. About a minute. If port 3000 is busy, `PORT=3411 npm run dev`.

```bash
npm run evidence      # re-run the experiment  -> data/evidence/latest.json
npm run docs          # re-render README + docs/evaluation.md from it
npm run robustness    # the 8-world study
npm run selfcheck     # lint, typecheck, 90 tests, build
```

For the LLM path, put `OPENAI_API_KEY` in `.env` and click the mode pill in the header.
It is slower (~2 min/generation) and not reproducible, so cursor-rebuilt sessions are not
replayed in live mode. See [methodology](docs/methodology.md).

## The loop, screen by screen

Bounded evolution — every candidate is a genome, and schema-invalid ones are recorded but
never simulated.

![Red team evolution lineage: each candidate with family, generation, parent, evasion rate, fitness, novelty distance and the detector reason codes that drove the next mutation.](docs/images/03-red-team.jpg)

The blue team sees only Referee output, and proposes a bounded config it cannot self-grade.

![Blue investigation: a failure hypothesis, the false-negative feature medians it cites, and a schema-bounded proposed defense configuration.](docs/images/04-blue-investigation.jpg)

The gate decides, on fresh-seed attacks the blue team never saw.

![Defense gate: accepted verdict, recall including review rising 44% to 70%, McNemar p below 0.001, five acceptance budgets passing, five of five descendants improved.](docs/images/05-defense-gate.jpg)

The IDENTIFY corpus, grouped by channel.

![Threat intelligence: fraud families grouped by channel with SIMULATED and RESEARCH badges, each showing how GenAI changes the attack, its blind spot, observable signals and genome mapping.](docs/images/06-threat-intelligence.jpg)

## Measured evidence

<!-- MEASURED:START — generated by `npm run docs`; do not edit by hand -->

Reproduce with `npm run evidence`. This run is commit `1d0a953f5dc1`,
seeds `train=10101` `search=20202` `blue_dev=30303` `final_test=40404`.

**On attacks it was trained to catch** (81 fraud / 29,948 legitimate, a 0.27% fraud rate):
ROC-AUC 98.02%, F1 58.46%, precision 50.00%, at 0.19% false positives.

**On an attack the red team evolved to evade it** — `AF-1013`, found at generation 2:

| | Before | After | Change |
|---|---:|---:|---:|
| Recall — declined | 14.44% | 27.78% | +13.33 pts |
| Recall — declined or held for review | 44.44% | 70.00% | +25.56 pts |
| Precision (on declines) | 18.84% | 26.04% | +7.20 pts |
| F1 (on declines) | 16.35% | 26.88% | +10.53 pts |
| ROC-AUC | 83.28% | 87.30% | +4.02 pts |
| Average precision | 10.51% | 15.04% | +4.54 pts |
| False-positive rate | 0.19% | 0.24% | +0.05 pts |
| Review rate | 1.57% | 1.83% | +0.26 pts |

Both runs scored the same transactions, so the comparison is paired: McNemar gives
**23 newly caught, 0 newly missed, p < 0.001**.

### The gate

The Referee accepts or rejects; neither AI votes. Verdict: **accepted**.

| Check | Measured | Budget |
|---|---:|---:|
| Threat recall gain | +25.56 pts | ≥ +5 pts |
| False positives, absolute | +0.050 pts | ≤ +0.25 pts |
| False positives, relative | 27% | ≤ 100% |
| Extra review-queue load | +0.26 pts | ≤ +0.50 pts |
| Fresh descendants improved | 5 of 5 | ≥ 80% |

### Also measured

- **No threshold rescues the evolved attack.** Across the entire score range v1's F1 stays
  under 15% on it. Lowering the bar buys false positives, not recall.
- **It holds in 6 of 8 shifted worlds.** Trained on one population, scored without
  retraining on eight. ROC-AUC never drops below 89.73%; the operating point breaks in the
  high-frequency regimes, and the diagnosis is velocity scored as an absolute count.
- **The model beats the hand-written policy.** Given the same parent and scored by the same
  Referee, its proposals land 4.3× the novelty distance.

Tables, per-world numbers and every proposed genome: **[docs/evaluation.md](docs/evaluation.md)**.

<!-- MEASURED:END -->

## Corrections

Things that were wrong, and what they cost:

- **The operating point capped precision at 7%.** The block threshold was set at the 98th
  percentile of legitimate scores, which pins FPR near 2% by construction. Replaced with
  an F1 sweep at deployment prevalence. It used to score F1 12.8% at 2.84% false
  positives; the current figures are in the table above.
- **A replay claim contradicted its evidence.** The bundle reported a diff made entirely
  of fresh-seed recompiles as evidence about the stored scenario, which had changed zero
  decisions. The two are now measured and reported separately.
- **Cross-border spend was mislabelled as anomalous.** Transaction country came from the
  merchant over a merchant population that is half non-US, so "a country you have never
  paid in" was a *legitimate*-traffic signal and the trained geo weight came out negative.
- **Live mode silently did nothing.** A hardcoded `temperature: 0.7` that reasoning models
  reject, a 20s timeout on 25–40s calls, and a prompt phrased as "reduce detection" that
  models refuse. All three fell back to the policy, which looks identical to success.
- **Every latency percentile read zero.** `performance.now()` is coarser than one scoring
  pass; now measured in hrtime nanoseconds.

## Security

No real cards, customers, credentials or payment endpoints exist here. Guards reject PAN,
CVV, OTP and IBAN patterns; untrusted merchant and threat text is scrubbed for injection
and fenced as data before reaching any model; provider URLs must be HTTPS; model artifacts
are schema-validated on load. See [threat model](docs/threat-model.md) and
[responsible AI](docs/responsible-ai.md).

## Documentation

[Threat research](docs/threat-research.md) ·
[Methodology](docs/methodology.md) ·
[Measured evaluation](docs/evaluation.md) ·
[Architecture](docs/architecture.md) ·
[Judging criteria](docs/rubric-coverage.md) ·
[Judge questions](docs/judge-qa.md) ·
[Threat model](docs/threat-model.md) ·
[Responsible AI](docs/responsible-ai.md)

## Limits

The simulator uses stylized synthetic behaviour calibrated to plausible distributions, not
to any real network's data; [methodology](docs/methodology.md) states parameter by
parameter what is anchored and what is assumed. The graph defense models merchant
convergence only. Held-out fraud samples are 81 and 90 transactions, which is why every
delta ships with a confidence interval and a paired test.

The 8-world study found a concrete failure: velocity is scored in absolute counts, so the
operating point does not transfer to a portfolio with a different baseline transaction
frequency. Ranking survives, the threshold does not. Per-customer velocity normalisation
and per-portfolio threshold derivation are the fix, and are not implemented here.

The prototype runs in one process with in-memory sessions. Production needs durable
storage, workload isolation, authorized data and independent model governance.

## License

MIT
