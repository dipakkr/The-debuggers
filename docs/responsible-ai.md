# Responsible AI

## Safety by construction

1. **Synthetic only.** Every identity, merchant, device and transaction is generated from a fixed seed. No real PAN, CVV, OTP, account or person can exist here; ingress guards reject credential-shaped text.
2. **Bounded adversary.** The red team operates only through a schema-bounded genome (12 numeric dimensions + 3 categorical flags). It cannot express arbitrary behaviour, let alone operational fraud instructions.
3. **Behavioral abstraction.** Genome fields describe statistical shapes (amounts, cadence, device age). They encode no step-by-step criminal method.
4. **No self-grading.** Neither AI scores itself. Labels, metrics, fitness, confirmation and acceptance live in deterministic code.
5. **Fallback-first.** LLM unavailability degrades the system to its deterministic expert policies; nothing fabricates results.

## Fairness note

The baseline detector deliberately excludes account age as a scoring feature (it appears only inside the graph-burst signal with merchant context). Threshold calibration is measured on legitimate traffic per pool, and false-positive regression is part of every gate decision.

## Intended use

Defensive research: continuous pre-production stress-testing of payment-fraud models. The prototype validates this paradigm on synthetic data; productionization requires network-specific data agreements, governance, and infrastructure review.
