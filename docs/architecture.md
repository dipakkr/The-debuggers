# Architecture

One Next.js application. No external services are required to run the full loop.

```text
                    ┌──────────────────────────────────────────┐
                    │            DETERMINISTIC REFEREE          │
                    │  labels · metrics · seeds · novelty ·      │
                    │  fitness · gates · replay · audit ledger   │
                    └───────▲───────────────────────┬───────────┘
                            │ outcomes              │ verdicts
              ┌─────────────┴──────┐      ┌─────────▼──────────┐
              │     RED TEAM       │      │     BLUE TEAM      │
              │ genome mutation    │      │ failure hypothesis │
              │ (LLM or policy)    │      │ (LLM or policy)    │
              └─────────┬──────────┘      └─────────┬──────────┘
                        │ Genome                    │ DefenseConfig
                        ▼                            ▼
              ┌────────────────────┐      ┌────────────────────┐
              │ SCENARIO COMPILER  │─────▶│   RISK ENGINE      │
              │ seeded, pure       │  tx  │ rules + LR + graph │
              └────────────────────┘      └────────────────────┘
                        ▲
              ┌─────────┴──────────┐
              │ SYNTHETIC NETWORK  │  1,200 customers · 300 merchants
              └────────────────────┘
```

## Module map

| Path | Responsibility |
|---|---|
| `lib/contracts/genome.ts` | Fraud Genome, defense config, scenario, metrics and version schemas |
| `lib/threat-intel/families.ts` | IDENTIFY corpus, 20 families, assessment schema with an id allowlist |
| `lib/simulator/world.ts` | Synthetic population and legitimate transaction stream |
| `lib/simulator/scenario.ts` | Seeded, pure attack compiler for five families |
| `lib/attacks/templates.ts` | Loud canonical templates and same-family novelty distance |
| `lib/fraud/features.ts` | Single streaming pass producing 17 behavioural features |
| `lib/fraud/detector.ts` | Risk engine — rules, logistic regression, v2 defense signals |
| `lib/metrics/metrics.ts` | Every metric, including tie-aware ROC-AUC and PR curves |
| `lib/metrics/stats.ts` | Wilson intervals and McNemar's paired test |
| `lib/referee/referee.ts` | The one evaluation path, seeds, gate budgets, replay |
| `lib/referee/fitness.ts` | Attack fitness — code only, never LLM-asserted |
| `lib/referee/ledger.ts` | Append-only experiment ledger with content-derived ids |
| `lib/mutations/engine.ts` | Generation loop, beam, blind-spot confirmation |
| `lib/mutations/demo-policy.ts` | Deterministic expert red strategist |
| `lib/defense/investigator.ts` | Evidence-grounded blue proposals |
| `lib/defense/gate.ts` | Acceptance gate, survival, significance, replay |
| `lib/genai/client.ts` | OpenAI-compatible client: timeout, one repair, fail closed |
| `lib/guards/injection.ts` | Credential and prompt-injection guards |
| `lib/session.ts` | Cookie-scoped arena sessions |
| `app/` | The console — seven views, Mastercard design system |

## Trust boundaries

**The LLM may propose.** A genome, a threat assessment, a failure hypothesis, a defense
configuration. Every one passes through a Zod schema before it can reach the simulator or
the detector. An invalid proposal is recorded in the audit ledger and never executed.

**The LLM may never assert.** Labels, metrics, fitness, novelty, blind-spot status, gate
verdicts and replay results are computed by deterministic code from Referee output only.

**Untrusted text is data.** Merchant descriptors, memos and threat notes are size-capped,
scrubbed and fenced in `<data>` tags. The system prompt states that their contents are
never instructions.

**Provider failure degrades, never fabricates.** A timeout, an HTTP error or malformed
output falls back to the deterministic expert policy through the same interface. The
reasoning source is stamped on every result so a judge can see which path ran.

## Determinism

Scenario compilation is a pure function of `(genome, seed, world)`. Transaction ids are
assigned once at generation time and never renumbered downstream, so replays stay
byte-exact even when merge orders differ. Worlds and backdrops are cached by seed and
never mutated. `refereeEvaluate` is the single evaluation path — the UI, the gate, the
evidence script and the tests all call it, so no two surfaces can disagree.

## Production gaps

In-memory sessions with TTL and LRU eviction are adequate for a shared demo, not for a
multi-replica deployment; the durable record is the JSONL ledger. Production needs a
shared session store, isolated scoring workers, authorized network data, institution-
specific calibration, shadow-mode validation and independent model governance.
