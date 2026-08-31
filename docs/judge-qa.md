# Judge questions

Each answer points at something checkable in the prototype or the repository.

**1. Why do you actually need GenAI here?**
For open-ended reasoning under a schema: interpreting a threat corpus, proposing which
bounded parameters to move next given what the detector just said, and hypothesising why
a miss happened. Deterministic code owns every result. In demo mode an expert policy
occupies the same interface, which is how you can tell the loop is real rather than a
tape — the policy is conditioned on measured outcomes, not on a script.

**2. Isn't the demo scripted? You built the detector, the attack and the fix.**
This is the fair version of the hardest question, and the answer is a recorded
negative result. In a live run the model — not the hand-written policy — found a
*different* blind spot in generation 1: distributed card testing. The blue model
diagnosed it correctly, said the detector has no cross-entity fan-in signal to
catch it with, named the features that would be needed, and proposed a bounded
config. **The deterministic gate then rejected that config**: 0 points of recall
gain, 0 of 5 fresh descendants improved, precision down 6.9 points. Nothing in a
choreographed demo refuses its own author. The full record is in
`data/evidence/live-run.json`, and both branches are reproducible — demo mode
shows an accepted defense, live mode shows a rejected one.

**3. How is this different from a fraud classifier?**
A classifier scores attacks that already exist. The Arena manufactures the attack that
does not exist yet, proves the detector misses it, proposes a fix, and then proves the
fix generalises to attacks the proposer never saw.

**4. Your held-out recall is 27.8%. Isn't that bad?**
That is the number *after* the fix, on an attack specifically evolved to evade. The
honest production figure is recall including analyst holds: 44.4% → 70.0%. More
importantly, look at the operating curve on that attack — the unchanged detector's F1
stays under 15% at *every* threshold. No calibration rescues it. That gap is the result.

**5. Then why is your baseline F1 58% and your held-out F1 27%?**
Because they are different problems. A threshold optimal for attacks the model was
trained on is not optimal for an attack evolved to sit beneath it. That tension is not a
flaw in the write-up; it is the reason the Arena exists.

**6. How do you know the improvement is real and not noise?**
Before and after score the same transactions, so it is a paired comparison. McNemar's
test gives p < 0.001 with 23 newly caught and 0 newly missed. Recall ships with 95%
Wilson intervals. Fraud sample sizes are 81 and 90, and we say so.

**7. What stops the Blue Team from overfitting to the one scenario it saw?**
It forms its hypothesis on development evidence and is graded on the final test: five
fresh-seed recompiles it never saw, plus untouched legitimate traffic. Four of five
budgets are about *not* breaking something else.

**8. Couldn't you buy recall by reviewing more traffic?**
That is exactly why precision, F1 and FPR are computed only on the strict decline
definition, and why the gate has a separate budget on the extra review-queue load.

**9. Why is the false-positive budget 0.25 points and not one point?**
A one-point allowance was sized for a detector running at 2.8% FPR. At 0.19% it would
wave through a five-fold increase, so both an absolute and a relative ceiling apply.

**10. How do you define a novel attack?**
Distance above τ = 1.2 from every template **of the same family**, plus measured detector
degradation, plus reproduction across four fresh seeds. Distance against all templates
would score a card-testing variant as novel just for differing from a mule template.

**11. How do you know the synthetic attacks are realistic?**
The genome bounds every field to a plausible range; fitness penalises machine-speed
probing and implausible cash-outs; fresh-seed confirmation rejects seed luck. Account
takeover rides a real population account, so its cover history is genuine simulated
behaviour rather than a stub. We also found and fixed three fidelity bugs, documented in
the README.

**12. Why should we trust the Red Team's claims?**
Don't. It cannot make claims. It emits a genome; the Referee compiles it, scores it,
labels it, computes its fitness and novelty, and decides whether it is a blind spot.

**13. Why should we trust the Blue Team's claims?**
Same answer. It emits a bounded configuration; the deterministic gate decides.

**14. What runs without an API key or internet?**
The entire loop. Only the reasoning layer swaps to a deterministic expert policy. The
simulator, detector, mutation search, Referee, gate, metrics and replay are always real.

**15. What happens if the model returns garbage in live mode?**
One schema-guided repair attempt, then a fail-closed fallback to the deterministic
policy. Covered by tests for timeout, HTTP error and malformed output.

**16. What stops prompt injection through merchant names or memos?**
Untrusted text is size-capped, scrubbed for instruction-override, role-hijack and
decision-manipulation patterns, and fenced in `<data>` tags with a system instruction
never to treat its contents as instructions. This is also entry 19 in the threat corpus.

**17. Could this be used to attack a real payment system?**
No. The genome expresses statistical shapes — amounts, cadence, device age, cohort size —
against a synthetic population. There is no operational method anywhere in the corpus or
the code, and ingress guards reject anything resembling real credentials.

**18. How does it scale?**
About 2.0M transactions/second scoring and 184k/s for the feature pass, single process;
100k rows end to end in 672 ms. Feature computation is one streaming pass over a
time-sorted stream, which is the shape a real pipeline needs. No network-scale claim.

**19. Why would a payment network want this?**
As a pre-production stress-test gate between threat intelligence and model deployment:
before a model ships, find the attack class it misses, and prove the candidate fix
generalises before it ever touches live traffic.

**20. Why not just retrain once on synthetic data?**
A fixed dataset stops changing. The Arena keeps attacking whatever the current defense
is, which means it keeps finding the *next* blind spot rather than one.

**21. What would productionisation actually require?**
Authorized network data and institution-specific calibration; a shared session and
experiment store; isolated scoring workers; shadow-mode validation before any config
reaches live decisioning; and independent model governance sign-off on the gate budgets,
which are policy choices and should be owned by risk, not by engineering.
