# Responsible AI

## Safety by construction

1. **Synthetic only.** Every identity, merchant, device and transaction is generated from a fixed seed. No real PAN, CVV, OTP, account or person can exist here; ingress guards reject credential-shaped text.
2. **Bounded adversary.** The red team operates only through a schema-bounded genome (17 numeric dimensions and 4 categorical flags). It cannot express arbitrary behaviour, let alone operational fraud instructions.
3. **Behavioral abstraction.** Genome fields describe statistical shapes (amounts, cadence, device age). They encode no step-by-step criminal method.
4. **No self-grading.** Neither AI scores itself. Labels, metrics, fitness, confirmation and acceptance live in deterministic code.
5. **Fallback-first.** LLM unavailability degrades the system to its deterministic expert policies; nothing fabricates results.

## Fairness and customer-harm notes

The baseline detector deliberately excludes account age as a linear scoring feature; it
appears only inside the graph-burst signal, where merchant context is present. Roughly 8%
of the simulated population are young accounts, and the graph gate must tolerate them
without exploding false positives — that is an explicit test.

Geography is handled the same way. "A country you have never paid in" is not a linear
risk feature, because genuine travel and a takeover look identical on that dimension
alone; it carries signal only as an interaction with device novelty and dormancy, which
is what the blue team has to discover. Treating it as a standalone risk signal would
penalise customers who travel.

Declines require corroboration. An amount or odd-hour outlier on a familiar device is
held for an analyst rather than refused, because a wrongly declined genuine purchase is
the most expensive error a network can make for the customer in front of it.

False-positive regression is part of every gate decision, in both absolute and relative
terms, and the extra analyst-queue load a defense creates is budgeted separately so that
"recall" can never be improved by quietly shifting cost onto customers waiting on a hold.

## Intended use

Defensive research: continuous pre-production stress-testing of payment-fraud models. The prototype validates this paradigm on synthetic data; productionization requires network-specific data agreements, governance, and infrastructure review.
