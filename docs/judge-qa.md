# Judge Q&A — answered from prototype evidence

1. **Why does this need GenAI?** Removing the LLM removes novel strategy generation, outcome-conditioned mutation planning, and failure investigation. Arithmetic, labels and metrics never touch it (see AI necessity map in solution doc; T15–T17).
2. **Isn't this just synthetic fraud generation?** Generation is one step. The product is the loop: evolve → confirm → investigate → gate → replay, with a referee that can reject the defender's own proposal.
3. **How are attacks novel?** Quantified: log-scale behavioural distance to every training template must exceed τ=1.2 (`lib/attacks/templates.ts`), plus confirmed detector degradation on fresh seeds.
4. **Why trust synthetic attacks?** You don't have to trust them — you verify them. A "blind spot" only exists if evasion reproduces across 4 fresh seeds against the real detector.
5. **Different from adversarial ML?** Classic adversarial ML perturbs inputs to models. Here an agent explores a behavioural parameter space against a full decision system, and defenses must survive held-out seed variation.
6. **How is this different from fraud detection?** Detection is one column of the UI. The differentiator is continuous discovery of what the detector cannot see, before production does.
7. **What if red finds unrealistic attacks?** Realism penalties in fitness and schema bounds reject them; machine-speed probing is penalized (`lib/referee/fitness.ts`). Rejected mutants are stored as evidence, never simulated.
8. **How do you stop criminal misuse?** No real data can enter; outputs are abstract parameters; ingress rejects credential-shaped text (T19); the repo contains no operational playbooks.
9. **What determines attack fitness?** Deterministic formula in `lib/referee/fitness.ts`: evasion rate + novelty bonus − realism penalties. The LLM may optimize toward it, never assert it.
10. **Who verifies Blue's improvement?** `gateDecision`: threat-class recall gain ≥ +5pts, ΔFPR ≤ +1pt, ≥80% fresh-seed survival — all computed by code on the FINAL split.
11. **Why can't Blue overfit?** Gate evaluation uses fresh seeds red never searched on, plus untouched legitimate pools. The demo investigator also proposes threshold changes that could hurt FPR — the gate would refuse them.
12. **What happens to false positives?** They are first-class: review rate is tracked separately from decline FPR, and ΔFPR is a hard gate condition (+0.33pt measured for the accepted defense).
13. **Why should Mastercard need this?** Fraud models learn from yesterday's attacks between retraining cycles; this continuously generates tomorrow's candidates safely, and proves which ones actually generalize.
14. **How does this scale?** Measured 213k tx end-to-end at ~260k tx/s single process; features use per-customer and per-merchant local state → shard by partition.
15. **What part is actually live?** Everything except optional LLM calls: simulator, detector, referee, gate, replay run on every request. DEMO mode runs the identical pipeline with deterministic policies.
16. **What data did you use?** None external. Seeded synthetic population (1,200 customers, 300 merchants); all seeds and versions are in the ledger.
17. **How do you measure GenAI's contribution?** Run the same loop in DEMO vs LIVE mode; identical referee instrumentation scores both. Ablation: remove any LLM role and that capability disappears while metrics stay honest.
18. **Which model?** Any OpenAI-compatible endpoint via env vars (`OPENAI_BASE_URL`, `ARENA_MODEL`). The architecture does not depend on a specific provider.
19. **Why not just retrain on synthetic fraud once?** One-shot augmentation is concept B in our evaluation; it loses because attackers iterate faster than labeling cycles, and there is no referee to prove generalization.
20. **Production architecture?** Event-stream consumers feed the twin; mutation workers scale horizontally; the referee becomes a versioned evaluation service gating model deploys exactly as it gates proposals here.
