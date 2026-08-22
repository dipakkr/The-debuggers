# ADVERSARIAL FRAUD ARENA

> **Generate tomorrow's fraud today.**

```
   AI RED TEAM  ──►  SYNTHETIC PAYMENT NETWORK  ──►  FRAUD DEFENSE
        ▲                                                      │
        │                                              DETERMINISTIC REFEREE
        │                                                      │
        └───────────────── AI BLUE TEAM ◄──────────────────────┘
                    (blind spot → investigation → gated defense → replay)
```

An AI red team continuously invents and evolves **synthetic** payment-fraud strategies against a live fraud detector. When an evolved attack evades detection, a blue-team investigator explains why, proposes a bounded defense, and a **deterministic referee** replays the exact attack to prove whether it improved.

Neither AI grades itself. Every number on screen comes from code.

[Quickstart](#quickstart) · [How it works](#how-it-works) · [Measured results](#measured-results) · [Demo script](#three-minute-demo) · [Docs](#docs)

---

## Quickstart

```bash
npm install
npm run train     # fit baseline detector on seeded synthetic data (~10s)
npm test          # 26 tests: adversarial loop, gate, replay, security, load
npm run build && npm start    # open http://localhost:3000
```

Then press **RUN RED TEAM** and watch:

```
ATTEMPT … BLOCKED · BLOCKED · EVADED ✓ → BLIND SPOT DISCOVERED
→ INVESTIGATE → VALIDATE DEFENSE → BEFORE/AFTER replay
```

`DEMO` mode is deterministic and offline-safe. Switch to `LIVE` mode with any OpenAI-compatible endpoint:

```bash
OPENAI_API_KEY=sk-… OPENAI_BASE_URL=https://api.openai.com/v1 ARENA_MODEL=gpt-4o-mini npm start
```

## How it works

| Stage | Module | What happens |
|---|---|---|
| IDENTIFY | `lib/threat-intel` | curated GenAI-fraud corpus; 3 families selected |
| GENERATE | `lib/mutations` | strategist/policy mutates schema-bounded **Fraud Genomes**, conditioned on referee outcomes |
| ATTACK | `lib/simulator` | pure compiler emits transactions into a seeded payment twin |
| DEFEND | `lib/fraud` | rules + logistic regression + blue-team graph/sequence knobs |
| INVESTIGATE | `lib/defense/investigator` | false-negative feature evidence → bounded proposal |
| MEASURE | `lib/referee` | splits, metrics, blind-spot confirmation, acceptance gate, exact replay, JSONL ledger |

**Fraud Genome**: every attack is ~15 bounded parameters (amounts, cadence, device age, regularity…). Out-of-range mutants are rejected as evidence, never simulated.

**Blind spot = proven, not claimed**: evasion must reproduce across fresh confirmation seeds before the referee declares it.

**Defense Gate**: threat-class recall gain ≥ +5 pts · ΔFPR ≤ +1 pt · ≥80% fresh-seed survival · exact replay — or the proposal is rejected (honestly).

## Measured results

Fixed seeds; reproduce via `npm test`.

- Baseline v1: **92.5% recall @ 2.84% FPR** on known attack templates
- Red team: novel mule-network variant confirmed after 2 generations; evades up to **100%** of its rows on held-out seeds
- Blue defense accepted by the referee: threat-class success **0.83–1.00 → 0.33–0.50**, ΔFPR **+0.33 pt**, replay shows **24 transactions** flipping decision between engines
- Throughput: **213k tx scored at ~1.7M tx/s**, per-tx p95 ≤ 1 ms

## Three-minute demo

0. `RESET` → baseline traffic: legit ALLOWED, templates BLOCKED (referee bar).
1. `RUN RED TEAM` → generations stream; evolution tree grows; blocked attempts feed the next mutation.
2. **BLIND SPOT DISCOVERED** banner — referee-confirmed across fresh seeds.
3. `INVESTIGATE` → evidence panel cites measured medians on missed rows.
4. `VALIDATE DEFENSE` → gate runs; verdict chip ACCEPTED.
5. Replay table: same seed, same transactions — `allow → block/review` under v2.
6. Press generation again: red now evolves against the defended engine.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — modules, loop, split hygiene
- [`docs/evaluation.md`](docs/evaluation.md) — all measured numbers
- [`docs/threat-model.md`](docs/threat-model.md) — what is untrusted and how it is contained
- [`docs/responsible-ai.md`](docs/responsible-ai.md) — safety by construction
- [`docs/judge-qa.md`](docs/judge-qa.md) — 20 hard questions, answered from evidence
- `docs/Adversarial-Fraud-Arena-Solution.docx` — submission document (`npm run docx`)

## Safety

Everything here is synthetic. No real cards, accounts or people exist in this system; credential-shaped input is rejected at the door; attack knowledge is abstract parameter ranges, not playbooks. See `docs/responsible-ai.md`.

## License

MIT
