# Current GenAI Payment-Fraud Threat Landscape

This review uses defensive abstractions only. The simulator implements three families and documents the other families.

## Research basis

Current public sources show three major changes:

- GenAI increases the scale and credibility of impersonation and scam content.
- Synthetic identities and coordinated fraud remain important payment risks.
- Attackers shift behavior after stronger authentication and network controls.

Sources:

- [Mastercard: AI and payment fraud prevention, July 2026](https://www.mastercard.com/global/en/news-and-trends/Insights/2026/ai-is-helping-banks-save-millions-by-transforming-payment-fraud-prevention.html)
- [Visa: Spring 2026 Biannual Threats Report](https://corporate.visa.com/en/sites/visa-perspectives/newsroom/visa-spring-2026-biannual-threats-report.html)
- [FBI: 2025 Internet Crime Report summary, April 2026](https://www.fbi.gov/news/press-releases/cryptocurrency-and-ai-scams-bilk-americans-of-billions)
- [Europol: 2025 Internet Organised Crime Threat Assessment](https://www.europol.europa.eu/media-press/newsroom/news/steal-deal-repeat-cybercriminals-cash-in-your-data)

## Family assessment

| Attack family | GenAI advantage | Observable payment signals | Expected blind spot | Safe simulation | MVP |
|---|---|---|---|---|---|
| Adaptive card testing and drain | Varies probes, timing, and merchant mix after rejection | Probe bursts, velocity, later escalation | Few-probe variants avoid familiar sequence rules | Bounded probes against synthetic tokens and merchants | Selected |
| Low-and-slow camouflage | Tunes amount and cadence below fixed thresholds | Flat tickets, regular gaps, cumulative spend | Point-wise features remain mild | Synthetic cadence and amount profiles | Selected |
| Coordinated mule fan-out | Creates consistent identity batches and shared cash-out behavior | Newcomer convergence, ticket coherence, young accounts | Per-account activity looks normal | Synthetic customer-to-merchant graph | Selected |
| Synthetic identity maturation | Builds plausible personas and long activity histories | Thin files, age cohorts, later behavior shifts | Mature synthetic histories resemble legitimate users | Synthetic account-age distributions | Research only |
| Account takeover adaptation | Personalizes lures and adjusts login or payment pacing | New device, geography, recipient change, drain | A warmed device weakens new-device rules | Synthetic device and session history | Research only |
| Adaptive velocity camouflage | Changes event spacing after fixed-window blocks | Burst-pause cycles and window-edge timing | Payments stay below each local window | Bounded interarrival values | Research only |
| Transaction splitting | Selects many near-limit values across contexts | Repeated cumulative value and recipient spread | Each payment remains under an amount rule | Synthetic split counts and totals | Research only |
| AI-personalized payment scams | Produces credible messages, voices, and videos at scale | New payee, urgency, channel change, authorized payment | Transaction data cannot prove the social context | Aggregate risk flags only | Research only |
| KYC and document manipulation | Creates coherent identity artifacts quickly | Document anomalies and cross-application reuse | The signal exists before transaction scoring | Synthetic metadata only | Research only |
| Merchant and customer collusion | Coordinates storefront and customer behavior | Shared devices, circular flows, concentrated refunds | Each party can appear normal alone | Synthetic bipartite graph patterns | Research only |
| Multi-channel impersonation | Maintains one story across voice, text, email, and support | Channel switching and unusual beneficiary setup | Signals sit across disconnected systems | Synthetic channel events without content generation | Research only |
| Autonomous boundary probing | Repeats hypothesis, execution, feedback, and mutation | Cross-attempt behavior drift | Retraining cycles react too slowly | The Arena's bounded feedback loop | Selected capability |

## Selection decision

The MVP implements three families:

1. Adaptive card testing and drain proves known-fraud detection and mutation.
2. Low-and-slow camouflage proves temporal evasion without a sequence model.
3. Coordinated mule fan-out proves the value of a justified graph signal.

These families cover classic, temporal, and network behavior. They stay observable inside the synthetic payment twin.

The MVP excludes content-level phishing, deepfake, and document analysis. Those families need different sensors and weaken the vertical slice.
