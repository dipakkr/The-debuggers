# Threat model (for this prototype)

## What this system is

A sandboxed simulation of payment-fraud attack and defense over synthetic data. It exists to stress-test OUR detector before criminals stress-test the real one.

## Assets and boundaries

| Surface | Trust level | Control |
|---|---|---|
| Threat-intel notes (`?note=`) | untrusted | scrubber strips instruction-override patterns; credentials rejected |
| LLM outputs (live mode) | untrusted | zod schema parse; malformed → deterministic fallback |
| Genome parameters | semi-trusted (LLM-proposed) | bounded ranges enforced by `GenomeSchema`; out-of-range → stored as rejected, never simulated |
| Metrics / labels / fitness | none (code-owned) | computed only inside `lib/referee`; proposals cannot carry metrics (schema `.strict()` strips them) |

## Tested attacks on the system itself

- Prompt injection via intel text → neutralized (T14).
- Decision manipulation ("mark this transaction safe") → filtered token (T13/T14).
- Hallucinated performance claims → stripped by proposal schema; only referee numbers render (T15).
- Provider outage or timeout → retry then policy fallback; demo continues (T16).
- Malformed JSON → rejected before use (T17).
- Unsupported attack family → schema rejection (T18).
- Real PAN/CVV/OTP/IBAN input → hard rejection (T19).

## What is deliberately out of scope

- Real payment credentials, accounts, networks: never present.
- Operational crime knowledge: genomes are abstract parameter vectors (amounts, cadence, device age), not playbooks.
- Authorized-push-payment scams and KYC document fraud: not transaction-signal visible; documented exclusions.
