# Judge Questions

Each answer points to working prototype evidence.

1. **Why do you need GenAI?**
   GenAI interprets threats, plans strategic mutations, reasons across experiments, investigates failures, and proposes defenses. Code owns every result.

2. **How is this different from conventional fraud detection?**
   A detector scores known attacks. The Arena continuously discovers unknown detector failures and verifies candidate defenses.

3. **Is this only synthetic data generation?**
   No. Generation feeds an adaptive search, a confirmation stage, a defense gate, and exact replay.

4. **How do you define a novel attack?**
   The Referee requires distance above `1.2` from every training template and measurable detector degradation.

5. **How do you know that an attack is realistic?**
   The schema limits behavior, and the fitness function penalizes implausible speed and drain patterns. Fresh-seed confirmation rejects seed luck.

6. **Why trust the Red Team?**
   Do not trust Red. The deterministic Referee validates schemas, labels, novelty, fitness, and blind-spot confirmation.

7. **How do you prevent unrealistic adversarial examples?**
   Red can change only bounded payment-behavior fields. Invalid mutants enter the audit record but never enter the simulator.

8. **What determines attack fitness?**
   Code computes evasion plus a bounded novelty bonus, minus realism penalties. The LLM cannot submit a fitness value.

9. **How does the system adapt?**
   Each mutation receives the previous verdict, fitness, reason codes, generation, lineage, and mutation budget.

10. **Why cannot Blue overfit?**
    Blue proposes a change from development evidence. The Referee tests five fresh descendants and untouched legitimate traffic.

11. **Who verifies Blue's improvement?**
    The deterministic Defense Gate accepts or rejects the proposal. Neither Red nor Blue controls this verdict.

12. **What happens to false positives?**
    The gate rejects an FPR increase above one point. The accepted defense increased FPR by 0.32 points.

13. **What part is deterministic?**
    The simulator, labels, seeds, schemas, model, fitness, novelty, metrics, versions, gates, replay, and audit records are deterministic.

14. **What part uses GenAI?**
    Live mode uses GenAI for threat assessment, mutation strategy, failure investigation, and defense hypotheses.

15. **What part actually works without internet access?**
    The complete loop works. Demo mode uses reviewed reasoning fixtures and runs every simulator, model, and Referee operation.

16. **How do you prevent misuse?**
    The application accepts only synthetic entities and bounded behavior. It rejects credential patterns and production provider URLs.

17. **How does this scale?**
    The 101,673-row benchmark completed in 508 ms. The scoring stage reached 2.08 million transactions per second.

18. **Why would Mastercard need this?**
    A network can use the Arena as a pre-production stress-test gate between threat intelligence and model deployment.

19. **Why not retrain once on synthetic data?**
    A fixed dataset stops changing. The Arena keeps testing the new defense and exposes its next blind spot.

20. **What does productionization require?**
    It requires authorized data, network calibration, durable experiment storage, isolated workers, independent governance, and shadow-mode validation.
