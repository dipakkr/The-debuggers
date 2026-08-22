# Architecture

## The loop

```
threat intel (curated corpus)
      │
      ▼
RED STRATEGIST ── LLM (live) or expert policy (demo)
      │ proposes bounded genome mutations
      ▼
FRAUD GENOME ── zod schema; every field range-checked
      │
      ▼
SCENARIO COMPILER ── pure function of (genome, seed, world)
      │
      ▼
SYNTHETIC PAYMENT TWIN ── seeded population + backdrop stream
      │
      ▼
RISK ENGINE v1/v2 ── rules + logistic regression (+ blue knobs)
      │
      ▼
REFEREE ── deterministic code: labels, seeds, splits, metrics,
      │   fitness, confirmation, acceptance gate, replay, ledger
      ├─► caught → red mutates again (outcome-conditioned)
      └─► evaded+novel+confirmed → BLIND SPOT
                 │
                 ▼
        BLUE INVESTIGATOR ── false-negative feature evidence
                 │ schema-bounded defense proposal
                 ▼
        DEFENSE GATE ── held-out fresh-seed evaluation,
            threat-recall gain ≥ +5pts, ΔFPR ≤ +1pt,
            ≥80% seed survival, exact replay
```

## Modules

| Path | Responsibility | Determinism |
|---|---|---|
| `lib/rng.ts` | mulberry32 PRNG, lognormal/poisson draws | seeded |
| `lib/contracts/genome.ts` | zod schemas: genome, scenario, proposal, config | static |
| `lib/simulator/world.ts` | customers, merchants, legit streams | seeded |
| `lib/simulator/scenario.ts` | genome → attack transactions (pure) | seeded |
| `lib/fraud/features.ts` | single-pass behavioural features | deterministic |
| `lib/fraud/detector.ts` | rules + LR scoring + defense knobs | deterministic |
| `lib/attacks/templates.ts` | canonical genomes + novelty distance | static |
| `lib/mutations/engine.ts` | generation loop, beam, blind-spot confirmation | seeded |
| `lib/genai/client.ts` | OpenAI-compatible calls, timeout, fallback | n/a |
| `lib/defense/investigator.ts` | FN-evidence analysis → proposal | policy or LLM |
| `lib/referee/referee.ts` | evaluation, replayPair, gateDecision | deterministic |
| `lib/referee/ledger.ts` | JSONL experiment audit trail | append-only |

## Data splits (referee-owned seeds)

| Split | Seed constant | Use |
|---|---|---|
| TRAIN | `SEEDS.train` | detector weight fitting |
| SEARCH | `SEEDS.search` | red mutation environment |
| BLUE DEV | `SEEDS.blue_dev` | blind-spot confirmation pass |
| FINAL TEST | `SEEDS.final_test` | gate evaluation, replay |

No example crosses splits. Gate seeds are constants, so a verdict never depends on when it runs.

## Versions stamped in every ledger row

`dataset_version` · `attack_version` · `detector_version` · `defense_version`
