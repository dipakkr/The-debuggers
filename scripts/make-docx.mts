import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { writeFileSync } from "node:fs";

// ---- tiny authoring helpers -------------------------------------------------
const h1 = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1 });
const h2 = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2 });
const p = (t: string, opts?: { bold?: boolean; italics?: boolean }) =>
  new Paragraph({ children: [new TextRun({ text: t, bold: opts?.bold, italics: opts?.italics })], spacing: { after: 120 } });
const bullet = (t: string) => new Paragraph({ text: t, bullet: { level: 0 }, spacing: { after: 60 } });

function table(rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (cells, ri) =>
        new TableRow({
          children: cells.map(
            (c) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: c, bold: ri === 0, size: 20 })] })],
              })
          ),
        })
    ),
  });
}

const spacer = () => new Paragraph({ text: "" });

// ---- content ----------------------------------------------------------------
const children: Paragraph[] = [];
const push = (...xs: (Paragraph | Table)[]) => children.push(...(xs as Paragraph[]));

push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: "ADVERSARIAL FRAUD ARENA", bold: true, size: 52 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text: "Mastercard Innovation Challenge 2026 — AI Defense Lab for Payment Security", size: 24, color: "555555" })],
  }),
  p("Generate tomorrow's fraud today. An AI red team continuously invents and evolves synthetic payment-fraud strategies against a live fraud-defense system. When an attack evades detection, a blue-team investigator explains the failure and proposes a bounded defense. A deterministic referee replays the exact attack and proves whether the defense improved.", { italics: true }),
  h1("1. Executive Summary"),
  p("Payment-fraud models learn from attacks that already happened. Generative AI lets adversaries create behavioural variants faster than defenders can label them. We built the smallest complete counter-system: an arena in which an AI red team evolves synthetic fraud against our own detector, a blue-team AI investigates every discovered weakness, and independent deterministic code proves which defenses actually generalize."),
  p("Every claim in this document is produced by the referee module on fixed seeds and reproduced by the automated test suite (26 tests) and the audit ledger. The prototype runs fully offline in DEMO mode and optionally uses any OpenAI-compatible LLM in LIVE mode.")
);

push(
  h1("2. The Problem"),
  p("Fraud detection is reactive. Models train on labelled history. Between retraining cycles, an adaptive adversary probes the deployed detector, learns its boundaries through trial and error, and industrializes what it learns. GenAI compresses that learning loop from weeks to minutes."),
  h1("3. Why GenAI Changes Payment Fraud"),
  bullet("Autonomous iteration: hypothesize, execute, observe rejection, mutate — without human patience limits."),
  bullet("Behavioural camouflage: planners tune amounts, cadence and device usage to sit under thresholds."),
  bullet("Coordinated identity generation: batch-minted accounts converge on cash-out points while looking normal individually."),
  h1("4. Our Insight"),
  p("If attackers iterate against our defenses, we should iterate attacks against our own defenses first — safely, at scale, with proof of what we find. Neither side grades itself: an LLM may propose strategies or defenses, but only deterministic code measures outcomes and accepts changes.")
);

push(
  h1("5. Challenge Alignment"),
  table([
    ["Stage", "Implementation", "Evidence"],
    ["IDENTIFY", "Curated emerging-threat corpus; 10 families surveyed, 3 selected for simulation", "Threat Intel screen"],
    ["GENERATE", "LLM strategist / expert policy produces schema-bounded attack genomes", "Evolution tree"],
    ["ATTACK (simulate)", "Seeded compiler emits transactions into a synthetic payment twin (~63k-row backdrop)", "Audit ledger"],
    ["DEFEND", "Risk engine v1/v2 scores every transaction with reason codes", "Command Center referee bar"],
    ["MITIGATE", "Blue investigator proposes bounded defense knobs from measured false-negative evidence", "Investigation screen"],
    ["REPLAY + MEASURE", "Referee recompiles identical scenarios under both engines and diffs decisions", "24-row replay diff; gate metrics"],
  ]),
  spacer(),
  h1("6. System Architecture"),
  p("Red Strategist → Fraud Genome (zod-bounded) → Scenario Compiler → Synthetic Payment Twin → Risk Engine → Referee. The referee owns labels, seeds, splits, fitness, confirmation, acceptance and replay. On confirmed evasion the Blue Investigator returns a schema-bound proposal, which must pass the Defense Gate: held-out fresh-seed evaluation, threat-recall gain ≥ +5 points, false-positive delta ≤ +1 point, ≥80% seed survival, exact replay.")
);

push(
  h1("7. Measured Results (fixed seeds, reproducible)"),
  table([
    ["Measure", "Baseline v1", "Under red attack", "After defense v2"],
    ["Recall on known templates", "92.5%", "—", "—"],
    ["False-positive rate (blocks)", "2.84%", "2.84%", "3.17% (+0.33pt)"],
    ["Discovered threat: attack success", "42–100% across fresh seeds", "—", "33–50% after defense"],
    ["Threat-class caught-rate gain", "—", "—", "≥ +11 points"],
    ["Exact-replay decision changes", "—", "—", "24 transactions"],
  ]),
  spacer(),
  p("Throughput (measured, single process): scoring 1.7M tx/s, feature pass 316k tx/s, end-to-end ≈260k tx/s at 213k transactions; per-transaction p95 latency ≤ 1 ms."),
  h1("8. Scientific Method"),
  bullet("Four disjoint splits with referee-owned seeds: TRAIN, RED SEARCH, BLUE DEV, FINAL TEST."),
  bullet("A blind spot exists only if evasion reproduces across four fresh confirmation seeds."),
  bullet("Gate seeds are constants; a verdict cannot depend on when it runs."),
  bullet("Wall-clock latency is excluded from determinism claims; every other output is byte-stable (tested).")
);

push(
  h1("9. Security and Responsible AI"),
  bullet("Synthetic-only world; credential-shaped input is rejected at ingress (PAN/CVV/OTP/IBAN guards)."),
  bullet("Attack knowledge stays abstract: 12 numeric genome dimensions, no operational playbooks."),
  bullet("Prompt injection via intel text or metadata is neutralized; proposals are schema-stripped so an LLM cannot inject metrics."),
  bullet("Provider outage degrades to deterministic policies; the demo cannot fail from lost internet."),
  h1("10. Product Experience"),
  p("A war-room command center: red column streams evolving attempts, the rail shows the live pipeline, blue column shows engine state; the referee bar publishes authoritative metrics. Tabs cover threat intelligence, the fraud evolution tree, investigation evidence, validation with exact replay, and the versioned experiment ledger. The full loop runs in under three minutes.")
);

push(
  h1("11. Limitations"),
  bullet("Synthetic population statistics are stylized; production value requires network-specific data agreements."),
  bullet("Graph signal covers merchant fan-out patterns; cross-institution identity graphs are future work."),
  bullet("LLM roles are provider-mediated; quality varies by model and is always subordinate to the referee."),
  h1("12. Future Deployment"),
  p("Event-stream consumers feed the digital twin; mutation workers scale horizontally by customer/merchant partition; the referee becomes a versioned evaluation service that gates model deployments exactly as it gates defense proposals here."),
  h1("13. Reproduction"),
  p("git clone && npm install && npm run train && npm test && npm run demo. Seeds, versions and metrics ship in the repository; the ledger (data/ledger/experiments.jsonl) records every experiment row."),
  h1("14. Repository"),
  p("github.com/<account>/adversarial-fraud-arena — Next.js + TypeScript, one deployable app. Docs: architecture.md, evaluation.md, threat-model.md, responsible-ai.md, judge-qa.md.")
);

const doc = new Document({
  styles: {
    default: {
      heading1: { run: { size: 32, bold: true, color: "111111" } },
      heading2: { run: { size: 26, bold: true, color: "333333" } },
    },
  },
  sections: [{ properties: {}, children }],
});

const buf = await Packer.toBuffer(doc);
writeFileSync("docs/Adversarial-Fraud-Arena-Solution.docx", buf);
console.log("wrote docs/Adversarial-Fraud-Arena-Solution.docx");
