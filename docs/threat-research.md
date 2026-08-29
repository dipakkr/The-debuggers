# GenAI payment-fraud threat landscape

Defensive abstractions only. Every entry describes a behavioural shape and the payment
signal it produces; none contains an operational method.

## What actually changed

GenAI did not invent new fraud typologies. It changed four things about the existing ones:

1. **Marginal cost.** Personalised impersonation, synthetic identity histories and
   dispute narratives now cost effectively nothing per victim.
2. **Adaptation speed.** An agent can hypothesise, execute, observe a rejection and mutate
   faster than a defender can label the data and retrain. The gap between retraining
   cycles is now an exploitable window.
3. **Coherence at scale.** Batches of identities, storefronts and documents can be minted
   that are internally consistent, defeating checks that relied on inconsistency.
4. **New surfaces.** Delegated agentic commerce and prompt-injectable free-text fields in
   the payment message are attack surfaces that did not previously exist.

Sources for the defensive framing: Mastercard on AI in fraud prevention (July 2026), Visa
Biannual Threats Report (Spring 2026), FBI Internet Crime Report (2025), Europol IOCTA
(2025).

## The corpus

19 families across 7 categories. **Simulated** means the payment twin compiles and scores
it end to end; **research** means it is documented with the sensor it would need rather
than faked.

### Card not present

| Family | GenAI advantage | Blind spot | Status |
|---|---|---|---|
| Adaptive card testing to drain | Varies probe amount, timing and merchant mix after each rejection | Few-probe variants that jump straight to moderate escalation | **Simulated** |
| Low-and-slow camouflage | Tunes spend under thresholds, mimics human cadence over long horizons | Point-wise detectors see only mild individual signals | **Simulated** |
| Structuring across storefronts | Decomposes one value into legs under a ceiling, sprayed across merchants | Each leg is unremarkable; no merchant sees the repetition | **Simulated** |
| Adaptive velocity camouflage | Reshapes inter-arrival times after each block, learning window edges | Pacing below every local window while the daily total is extreme | Research |
| BIN enumeration and credential stuffing | Generated request signatures and timing jitter defeat bot fingerprinting | Enumeration spread thin stays under every per-merchant limit | Research |

### Identity

| Family | GenAI advantage | Blind spot | Status |
|---|---|---|---|
| Account takeover with device warming | Lures at scale, then paces the takeover around session-risk windows | A warmed device on a mature account suppresses every novelty signal | **Simulated** |
| Synthetic identity maturation | Personas pass documentary checks; histories farmed patiently | Behaviourally mature synthetic files look like real thin-file customers | Research |
| Wallet and token provisioning abuse | Voice-cloned call-centre verification defeats the yellow path | Once provisioned, downstream scoring sees a clean instrument | Research |
| Deepfake KYC and liveness defeat | Generated documents and injected video streams | The signal exists entirely before transaction scoring | Research |

### Instant rails

| Family | GenAI advantage | Blind spot | Status |
|---|---|---|---|
| Coordinated mule-network fan-out | Mints a coherent identity batch converging on one cash-out point | Per-account behaviour is normal; the structure lives *between* accounts | **Simulated** |

### Social engineering

| Family | GenAI advantage | Blind spot | Status |
|---|---|---|---|
| AI-personalised authorised push payment scams | Tailored scripts per victim, sustained over days | The payment is genuinely authorised; transaction data cannot prove coercion | Research |
| Voice-clone step-up bypass | Real-time cloning from seconds of public audio | The verification itself becomes the attack surface, and succeeds | Research |
| Multi-channel impersonation | One persona held consistent across voice, SMS, email and support | Signals sit across disconnected systems that never join | Research |

### Merchant side

| Family | GenAI advantage | Blind spot | Status |
|---|---|---|---|
| Merchant collusion and bust-out | Generated storefronts, catalogues and review histories | Each party looks normal alone; collusion is a property of the pair | Research |
| Orchestrated refund abuse | Dispute narratives generated per order and tuned against what works | Claims spread across merchants never accumulate at any one | Research |
| First-party (friendly) chargeback at scale | Assistants draft the strongest available dispute reason per transaction | The original payment is genuine; pre-authorisation scoring has nothing to flag | Research |

### Agentic

| Family | GenAI advantage | Blind spot | Status |
|---|---|---|---|
| Autonomous attack iteration | Hypothesise → execute → observe → mutate, faster than retraining | The gap between retraining cycles | Implemented **as this arena's loop** |
| Delegated agentic-commerce abuse | Compromised shopping agents transact with valid delegated credentials | Machine cadence is the *expected* shape here, so bot-detection signals invert | Research |
| Prompt injection of the defense pipeline | Attacker-controlled merchant descriptors and memos carry instructions for the defender's own LLM | The defense's reasoning layer becomes the attack surface | Implemented **as a defense** |

## Why these five are simulated

The five compiled families were chosen to break **five different parts of a detector**,
not to be five variations on one idea:

| Family | Detector weakness it exposes |
|---|---|
| Card testing to drain | Classic burst and sequence rules |
| Low-and-slow | Temporal shape, invisible to point-wise scoring |
| Mule fan-out | Cross-account graph structure |
| Account takeover | Session and device context on a mature account |
| Structuring | Cumulative value hidden by decomposition |

A family is only simulated if the payment twin can observe it honestly. Authorised push
payment fraud, deepfake KYC and voice-clone bypass are excluded on principle: their
signal lives outside the transaction stream, and simulating them at transaction level
would mean inventing evidence the sensor cannot see.

## The prompt-injection entry is a defense, not a simulation

Merchant descriptors and payment memos are attacker-controlled free text that flows into
any LLM in a fraud pipeline. This repository treats every such string as untrusted data:
scrubbed for instruction-override, role-hijack and decision-manipulation patterns, size
capped, and fenced inside `<data>` tags with a system instruction never to follow its
contents. See [the threat model](threat-model.md).
