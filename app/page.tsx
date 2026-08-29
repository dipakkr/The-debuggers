"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MastercardMark } from "./components/brand";
import { OperatingCurve, WeightBars, type Point } from "./components/charts";

/* ------------------------------------------------------------------ types */

interface MetricsRow {
  fraud_recall: number;
  recall_with_review: number;
  roc_auc: number;
  precision: number;
  f1: number;
  fpr: number;
  fnr: number;
  review_rate: number;
  average_precision: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  n_legit: number;
  n_fraud: number;
}

interface Genome {
  family: string;
  amount: { base: number; jitter: number; drain_multiplier: number };
  velocity: { tx_per_hour: number };
  temporal: { start_hour_utc: number; span_hours: number };
  merchant: { mcc: string; new_merchant: boolean };
  device: { age_days: number; geo_jump_km: number };
  identity: { account_age_days: number };
  sequence: { probe_count: number; interarrival_s: number; regularity: number; drain_after_probe: boolean };
  takeover: { victim_reuse: boolean; recon_tx_count: number; dwell_hours: number };
  split: { count: number; merchant_spread: number; ceiling_ratio: number };
}

interface Attempt {
  scenario_id: string;
  parent_scenario_id: string | null;
  generation: number;
  family: string;
  genome: Genome | null;
  hypothesis: string;
  seed: number;
  verdict: "pending" | "caught" | "evaded" | "invalid";
  fitness: number | null;
  reasons: string[];
  attack_success_rate: number | null;
  risk_max: number | null;
  n_fraud: number | null;
  n_flagged: number | null;
  novel: boolean;
  novelty: number | null;
}

interface DefenseCfg {
  threshold: number;
  escalation_weight: number;
  pattern_weight: number;
  graph_weight: number;
  structuring_weight: number;
  takeover_weight: number;
}

interface Proposal {
  failure_hypothesis: string;
  evidence: string[];
  candidate_features: string[];
  recommended_change: string;
  defense_config: DefenseCfg;
  expected_tradeoff: string;
  confidence: number;
}

interface Budgets {
  min_threat_recall_gain: number;
  max_fpr_delta_abs: number;
  max_fpr_delta_rel: number;
  max_review_rate_delta: number;
  min_survival_share: number;
}

interface Snapshot {
  mode: "demo" | "live";
  generation: number;
  attempts: Attempt[];
  beam: string[];
  blindSpotScenarioId: string | null;
  baseline: MetricsRow | null;
  baselineOperatingPoints: Point[];
  duringAttack: MetricsRow | null;
  duringAttackOperatingPoints: Point[];
  afterDefense: MetricsRow | null;
  defenseAccepted: boolean | null;
  defenseProposal: Proposal | null;
  defenseConfig: DefenseCfg | null;
  gateReasons: string[];
  gateBudgets: Budgets;
  families: string[];
  noveltyTau: number;
  versions: Record<string, string>;
  detector: {
    version: string;
    feature_names: string[];
    weights: number[];
    bias: number;
    threshold_block: number;
    threshold_review: number;
    calibration: Record<string, unknown>;
  };
  log: { ts: string; level: string; msg: string }[];
}

interface ReplayRow { scenario_id: string; tx_id: string; amount: number; before: string; after: string }
interface Gate {
  accepted: boolean;
  gateReasons: string[];
  survival: { scenario_id: string; base_success: number; cand_success: number }[];
  significance: { before_only: number; after_only: number; p_value: number; significant_at_05: boolean } | null;
  recallInterval: { before: { low: number; high: number }; after: { low: number; high: number } } | null;
  before: MetricsRow | null;
  after: MetricsRow | null;
  replayDiscovery: { scenario_id: string; seed: number; changed: ReplayRow[] } | null;
  replayFresh: { scenario_id: string; seed: number; changed: ReplayRow[] }[];
}

interface ThreatFamily {
  id: string;
  name: string;
  category: string;
  how_genai_changes_it: string;
  observable_signals: string[];
  existing_defense: string;
  potential_blind_spot: string;
  simulated: boolean;
  genome_mapping: string[];
}

/* ------------------------------------------------------------------ utils */

const pct = (x?: number | null, d = 2) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
const pts = (x: number, d = 2) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)} pts`;

const FAMILY_LABEL: Record<string, string> = {
  card_testing_drain: "Card testing",
  low_and_slow: "Low & slow",
  mule_fanout: "Mule fan-out",
  account_takeover: "Account takeover",
  transaction_splitting: "Structuring",
};
const CATEGORY_LABEL: Record<string, string> = {
  card_present: "Card present",
  card_not_present: "Card not present",
  identity: "Identity",
  instant_rails: "Instant rails",
  social_engineering: "Social engineering",
  merchant_side: "Merchant side",
  agentic: "Agentic",
};

const STAGES = ["IDENTIFY", "GENERATE", "ATTACK", "EVADE", "DISCOVER", "DEFEND", "REPLAY", "MEASURE"];

type View = "command" | "intel" | "red" | "detector" | "blue" | "gate" | "audit";

const NAV: { id: View; label: string }[] = [
  { id: "command", label: "Command centre" },
  { id: "intel", label: "Threat intelligence" },
  { id: "red", label: "Red team" },
  { id: "detector", label: "Detection engine" },
  { id: "blue", label: "Blue investigation" },
  { id: "gate", label: "Defense gate" },
  { id: "audit", label: "Experiment audit" },
];

/* ------------------------------------------------------------------- page */

export default function Page() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [view, setView] = useState<View>("command");
  const [busy, setBusy] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [proposalSource, setProposalSource] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [intel, setIntel] = useState<{ families: ThreatFamily[]; assessment: { headline: string; selected_ids: string[]; rationale: string }; source: string } | null>(null);
  const [ledger, setLedger] = useState<Record<string, unknown>[]>([]);
  const [ledgerBacking, setLedgerBacking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/session/state");
    if (r.ok) setSnap((await r.json()) as Snapshot);
  }, []);

  useEffect(() => {
    void refresh();
    void fetch("/api/threat-intel").then((r) => r.json()).then(setIntel).catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (view === "audit") {
      void fetch("/api/experiments")
        .then((r) => r.json())
        .then((d) => {
          setLedger(d.experiments ?? []);
          setLedgerBacking(d.backing ?? null);
        })
        .catch(() => undefined);
    }
  }, [view, snap?.generation]);

  const call = useCallback(
    async (label: string, url: string, init?: RequestInit) => {
      setBusy(label);
      setError(null);
      try {
        const r = await fetch(url, init);
        const data = await r.json();
        if (!r.ok) {
          setError(String(data.error ?? `${label} failed`));
          return null;
        }
        setSnap(data as Snapshot);
        return data;
      } catch (e) {
        setError(String(e));
        return null;
      } finally {
        setBusy(null);
      }
    },
    []
  );

  const runGeneration = () => call("Evolving attacks", "/api/session/generate", { method: "POST" });
  const reset = async () => {
    setGate(null);
    setProposalSource(null);
    setSelected(null);
    await call("Resetting arena", "/api/session/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "demo" }),
    });
  };
  const investigate = async () => {
    const d = await call("Investigating failure", "/api/blue/investigate", { method: "POST" });
    if (d) {
      setProposalSource(d.investigationSource ?? null);
      setView("blue");
    }
  };
  const validate = async () => {
    const d = await call("Running defense gate", "/api/defense/validate", { method: "POST" });
    if (d?.gate) {
      setGate(d.gate as Gate);
      setView("gate");
    }
  };

  const blindSpot = snap?.attempts.find((a) => a.scenario_id === snap.blindSpotScenarioId) ?? null;
  const stageIndex = useMemo(() => {
    if (!snap) return 0;
    if (gate) return 8;
    if (snap.defenseProposal) return 6;
    if (snap.blindSpotScenarioId) return 5;
    if (snap.generation > 0) return 4;
    return 1;
  }, [snap, gate]);

  const detail = snap?.attempts.find((a) => a.scenario_id === selected) ?? blindSpot;

  return (
    <div className="shell">
      {busy && <div className="busybar" role="status" aria-live="polite"><span /><span className="sr-only">{busy}</span></div>}

      <aside className="sidebar">
        <div className="brand">
          <MastercardMark size={26} />
          <span className="brand-text">
            <strong>Fraud Arena</strong>
            <span>AI Defense Lab</span>
          </span>
        </div>
        <nav className="nav" aria-label="Sections">
          <span className="nav-label">Closed loop</span>
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              aria-current={view === n.id ? "page" : undefined}
            >
              <span className="dot" />
              {n.label}
              {n.id === "red" && snap ? <span className="nav-count">{snap.attempts.length}</span> : null}
              {n.id === "intel" && intel ? <span className="nav-count">{intel.families.length}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="row"><span>detector</span><span>{snap?.detector.version ?? "—"}</span></div>
          <div className="row"><span>attacks</span><span>{snap?.versions.attack_version ?? "—"}</span></div>
          <div className="row"><span>dataset</span><span>{snap?.versions.dataset_version ?? "—"}</span></div>
          <div className="row"><span>reasoning</span><span>{snap?.versions.reasoning_version ?? "—"}</span></div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>Adversarial Fraud Arena</h1>
          <span className="sub">Mastercard Innovation Challenge 2026 · Team The debuggers</span>
          <span className="spacer" />
          <span className="pill synthetic">Synthetic environment</span>
          <span className="pill mode">{snap?.mode === "live" ? "Live reasoning" : "Deterministic mode"}</span>
          <button className="btn" onClick={reset} disabled={!!busy}>Reset</button>
          <button className="btn primary" onClick={runGeneration} disabled={!!busy}>
            {busy === "Evolving attacks" ? "Evolving…" : "Run red team"}
          </button>
        </header>

        <main className="content">
          {error && (
            <div className="alert critical" role="alert">
              <span className="icon" aria-hidden>■</span>
              <div><h4>Request failed</h4><p>{error}</p></div>
            </div>
          )}

          <ol className="rail" aria-label="Closed-loop progress">
            {STAGES.map((s, i) => (
              <li key={s} className={`rail-step ${i < stageIndex ? "done" : ""} ${i === stageIndex ? "active" : ""}`}>
                <div className="n">{String(i + 1).padStart(2, "0")}</div>
                <div className="s">{s}</div>
              </li>
            ))}
          </ol>

          {!snap ? (
            <div className="card"><div className="empty"><strong>Loading arena</strong>Building the synthetic payment network and scoring the baseline.</div></div>
          ) : view === "command" ? (
            <CommandCentre
              snap={snap} blindSpot={blindSpot} gate={gate} busy={busy}
              onInvestigate={investigate} onValidate={validate} onGenerate={runGeneration}
              onOpen={setView}
            />
          ) : view === "intel" ? (
            <ThreatIntel intel={intel} families={snap.families} />
          ) : view === "red" ? (
            <RedTeam snap={snap} selected={selected} onSelect={setSelected} detail={detail ?? null} />
          ) : view === "detector" ? (
            <DetectionEngine snap={snap} />
          ) : view === "blue" ? (
            <BlueInvestigation snap={snap} source={proposalSource} blindSpot={blindSpot} onValidate={validate} busy={busy} />
          ) : view === "gate" ? (
            <DefenseGate snap={snap} gate={gate} />
          ) : (
            <Audit snap={snap} ledger={ledger} backing={ledgerBacking} />
          )}
        </main>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- command centre */

function CommandCentre({
  snap, blindSpot, gate, busy, onInvestigate, onValidate, onGenerate, onOpen,
}: {
  snap: Snapshot;
  blindSpot: Attempt | null;
  gate: Gate | null;
  busy: string | null;
  onInvestigate: () => void;
  onValidate: () => void;
  onGenerate: () => void;
  onOpen: (v: View) => void;
}) {
  const base = snap.baseline;
  const after = snap.afterDefense;
  const before = snap.duringAttack;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Command centre</h2>
          <p>
            A bounded red team evolves synthetic payment attacks against a trained detector. A deterministic
            referee owns every label, metric, seed and acceptance decision — neither AI grades its own work.
          </p>
        </div>
      </div>

      <section className="kpis" aria-label="Baseline detector performance on known attack templates">
        <Kpi k="ROC-AUC" v={pct(base?.roc_auc)} d="separation on known templates" />
        <Kpi k="F1" v={pct(base?.f1)} d={`precision ${pct(base?.precision)}`} />
        <Kpi k="Recall (decline)" v={pct(base?.fraud_recall)} d={`${pct(base?.recall_with_review)} incl. review`} />
        <Kpi k="False positives" v={pct(base?.fpr)} d={`${base ? Math.round(base.fpr * base.n_legit) : 0} of ${base?.n_legit.toLocaleString() ?? 0} legit`} />
        <Kpi k="Attack families" v={String(snap.families.length)} d="simulated end to end" />
        <Kpi k="Generation" v={String(snap.generation)} d={`${snap.attempts.length} candidates evaluated`} />
      </section>

      {blindSpot ? (
        <div className="alert critical">
          <span className="icon" aria-hidden>▲</span>
          <div>
            <h4>Blind spot confirmed — {blindSpot.scenario_id}</h4>
            <p>
              A {FAMILY_LABEL[blindSpot.family] ?? blindSpot.family} variant evolved at generation {blindSpot.generation} evades
              the detector on {pct(blindSpot.attack_success_rate)} of its transactions, reproduced across four fresh seeds.
              Novelty distance {blindSpot.novelty?.toFixed(2)} against a threshold of {snap.noveltyTau}.
            </p>
          </div>
          <div className="actions">
            {!snap.defenseProposal ? (
              <button className="btn accent" onClick={onInvestigate} disabled={!!busy}>Investigate</button>
            ) : !gate ? (
              <button className="btn accent" onClick={onValidate} disabled={!!busy}>Validate defense</button>
            ) : (
              <button className="btn" onClick={() => onOpen("gate")}>View gate verdict</button>
            )}
          </div>
        </div>
      ) : (
        <div className="alert neutral">
          <span className="icon" aria-hidden>●</span>
          <div>
            <h4>{snap.generation === 0 ? "Baseline established" : `Generation ${snap.generation} evaluated`}</h4>
            <p>
              {snap.generation === 0
                ? `The detector catches ${pct(base?.recall_with_review)} of known-template fraud at ${pct(base?.fpr)} false positives. Run the red team to search for variants it has never seen.`
                : "No confirmed blind spot yet. Each generation mutates the survivors using the detector's own reason codes."}
            </p>
          </div>
          <div className="actions">
            <button className="btn accent" onClick={onGenerate} disabled={!!busy}>Evolve next generation</button>
          </div>
        </div>
      )}

      <div className="grid sidebar-right">
        <div className="card">
          <header>
            <h3>Detector under attack</h3>
            <span className="hint">Held-out pool · same legitimate traffic throughout</span>
          </header>
          <div className="body tight">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="num">Known templates</th>
                  <th className="num">Evolved attack</th>
                  <th className="num">After defense</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ["Recall (decline)", "fraud_recall"],
                  ["Recall incl. review", "recall_with_review"],
                  ["Precision", "precision"],
                  ["F1", "f1"],
                  ["ROC-AUC", "roc_auc"],
                  ["False-positive rate", "fpr"],
                  ["Review rate", "review_rate"],
                ] as [string, keyof MetricsRow][]).map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td className="num">{pct(base?.[key] as number)}</td>
                    <td className="num">{pct(before?.[key] as number)}</td>
                    <td className="num">{after ? pct(after[key] as number) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <header><h3>Referee activity</h3></header>
          <div className="body">
            {snap.log.length === 0 ? (
              <p className="note">No referee events yet this session.</p>
            ) : (
              <div className="log">
                {[...snap.log].reverse().map((l, i) => (
                  <div key={i}>
                    <time>{new Date(l.ts).toISOString().slice(11, 19)}</time>
                    <span className={l.level === "hero" ? "hero" : undefined}>{l.msg}</span>
                  </div>
                ))}
              </div>
            )}
            <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "14px 0" }} />
            <dl className="kv">
              <dt>Block threshold</dt><dd>{snap.detector.threshold_block}</dd>
              <dt>Review threshold</dt><dd>{snap.detector.threshold_review}</dd>
              <dt>Scoring p95</dt><dd>{base ? `${(base.p95_latency_ms * 1000).toFixed(0)} µs` : "—"}</dd>
              <dt>Legit evaluated</dt><dd>{base?.n_legit.toLocaleString() ?? "—"}</dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({ k, v, d, tone }: { k: string; v: string; d?: string; tone?: "up" | "down" }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {d && <div className={`d ${tone ?? ""}`}>{d}</div>}
    </div>
  );
}

/* ----------------------------------------------------- threat intelligence */

function ThreatIntel({ intel, families }: { intel: ThreatIntelProps["intel"]; families: string[] }) {
  if (!intel) return <div className="card"><div className="empty"><strong>Loading threat corpus</strong>Retrieving the curated family assessment.</div></div>;
  const byCategory = intel.families.reduce<Record<string, ThreatFamily[]>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});
  const simulated = intel.families.filter((f) => f.simulated).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Threat intelligence</h2>
          <p>
            {intel.families.length} GenAI-accelerated payment-fraud families across {Object.keys(byCategory).length} channels
            and rails. {simulated} are compiled and scored end to end by the payment twin; the rest are documented with the
            sensor they would need, rather than faked.
          </p>
        </div>
      </div>

      <div className="card">
        <header><h3>Cycle assessment</h3><span className="hint">source: {intel.source}</span></header>
        <div className="body">
          <p>{intel.assessment.headline}</p>
          <p className="note" style={{ marginTop: 10 }}>{intel.assessment.rationale}</p>
          <div className="reasons" style={{ marginTop: 12 }}>
            {intel.assessment.selected_ids.map((id) => (
              <span key={id} className="tag info">{id}</span>
            ))}
          </div>
        </div>
      </div>

      {Object.entries(byCategory).map(([cat, list]) => (
        <section key={cat}>
          <div className="page-head" style={{ marginBottom: -4 }}>
            <h2 style={{ fontSize: 14, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
              {CATEGORY_LABEL[cat] ?? cat}
            </h2>
          </div>
          <div className="threats">
            {list.map((f) => (
              <article key={f.id} className={`threat ${f.simulated ? "sim" : ""}`}>
                <div className="meta">
                  <span className={`tag ${f.simulated ? "block" : "muted"}`}>
                    {f.simulated ? "SIMULATED" : "RESEARCH"}
                  </span>
                  {families.includes(f.id) && <span className="tag info">GENOME</span>}
                </div>
                <h4>{f.name}</h4>
                <dl>
                  <div><dt>How GenAI changes it</dt><dd>{f.how_genai_changes_it}</dd></div>
                  <div><dt>Blind spot</dt><dd>{f.potential_blind_spot}</dd></div>
                  <div><dt>Observable signals</dt><dd>{f.observable_signals.join(" · ")}</dd></div>
                  {f.genome_mapping.length > 0 && (
                    <div><dt>Genome mapping</dt><dd className="mono">{f.genome_mapping.join(", ")}</dd></div>
                  )}
                </dl>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
interface ThreatIntelProps {
  intel: { families: ThreatFamily[]; assessment: { headline: string; selected_ids: string[]; rationale: string }; source: string } | null;
}

/* ------------------------------------------------------------- red team */

function RedTeam({
  snap, selected, onSelect, detail,
}: { snap: Snapshot; selected: string | null; onSelect: (id: string) => void; detail: Attempt | null }) {
  const rows = [...snap.attempts].sort(
    (a, b) => a.generation - b.generation || a.scenario_id.localeCompare(b.scenario_id)
  );
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Red team</h2>
          <p>
            Every candidate is a bounded genome. Generation N is mutated from generation N−1 using the detector&apos;s own
            reason codes, so the search is conditioned on measured outcomes rather than on a script. Schema-invalid
            candidates are recorded and never simulated.
          </p>
        </div>
      </div>

      <div className="grid sidebar-right">
        <div className="card">
          <header><h3>Evolution lineage</h3><span className="hint">{rows.length} candidates</span></header>
          <div className="body tight scroll">
            <table>
              <thead>
                <tr>
                  <th>Scenario</th><th>Family</th><th className="num">Gen</th><th>Parent</th>
                  <th className="num">Evasion</th><th className="num">Fitness</th><th className="num">Novelty</th>
                  <th>Verdict</th><th>Detector reasons</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.scenario_id}
                    className="selectable"
                    aria-selected={selected === a.scenario_id}
                    onClick={() => onSelect(a.scenario_id)}
                  >
                    <td className="mono">
                      {a.scenario_id}
                      {a.scenario_id === snap.blindSpotScenarioId && <span className="tag block" style={{ marginLeft: 6 }}>BLIND SPOT</span>}
                    </td>
                    <td>{FAMILY_LABEL[a.family] ?? a.family}</td>
                    <td className="num">{a.generation}</td>
                    <td className="mono" style={{ color: "var(--muted)" }}>{a.parent_scenario_id ?? "root"}</td>
                    <td className="num">{pct(a.attack_success_rate, 1)}</td>
                    <td className="num">{a.fitness?.toFixed(3) ?? "—"}</td>
                    <td className="num">{a.novelty?.toFixed(2) ?? "—"}{a.novel ? "*" : ""}</td>
                    <td>
                      <span className={`tag ${a.verdict === "evaded" ? "block" : a.verdict === "caught" ? "allow" : "muted"}`}>
                        {a.verdict.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className="reasons">
                        {a.reasons.slice(0, 2).map((r) => <span key={r} className="tag muted">{r}</span>)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="body" style={{ borderTop: "1px solid var(--line)" }}>
            <p className="note">
              <strong>*</strong> novelty is measured against templates of the <strong>same family</strong> only, so a
              card-testing variant is never counted as novel merely for differing from a mule-fanout template.
              Threshold {snap.noveltyTau}.
            </p>
          </div>
        </div>

        <div className="card">
          <header><h3>Genome detail</h3><span className="hint">{detail?.scenario_id ?? "select a row"}</span></header>
          <div className="body">
            {!detail?.genome ? (
              <p className="note">Select a candidate to inspect the exact bounded parameters it was compiled from.</p>
            ) : (
              <>
                <p className="note" style={{ marginBottom: 12 }}>{detail.hypothesis}</p>
                <dl className="kv">
                  <dt>family</dt><dd>{detail.genome.family}</dd>
                  <dt>seed</dt><dd>{detail.seed}</dd>
                  <dt>amount.base</dt><dd>{detail.genome.amount.base}</dd>
                  <dt>amount.jitter</dt><dd>{detail.genome.amount.jitter}</dd>
                  <dt>drain_multiplier</dt><dd>{detail.genome.amount.drain_multiplier}</dd>
                  <dt>tx_per_hour</dt><dd>{detail.genome.velocity.tx_per_hour}</dd>
                  <dt>start_hour_utc</dt><dd>{detail.genome.temporal.start_hour_utc}</dd>
                  <dt>span_hours</dt><dd>{detail.genome.temporal.span_hours}</dd>
                  <dt>mcc</dt><dd>{detail.genome.merchant.mcc}</dd>
                  <dt>device.age_days</dt><dd>{detail.genome.device.age_days}</dd>
                  <dt>geo_jump_km</dt><dd>{detail.genome.device.geo_jump_km}</dd>
                  <dt>account_age_days</dt><dd>{detail.genome.identity.account_age_days}</dd>
                  <dt>probe_count</dt><dd>{detail.genome.sequence.probe_count}</dd>
                  <dt>interarrival_s</dt><dd>{detail.genome.sequence.interarrival_s}</dd>
                  <dt>regularity</dt><dd>{detail.genome.sequence.regularity}</dd>
                  <dt>victim_reuse</dt><dd>{String(detail.genome.takeover.victim_reuse)}</dd>
                  <dt>dwell_hours</dt><dd>{detail.genome.takeover.dwell_hours}</dd>
                  <dt>split.count</dt><dd>{detail.genome.split.count}</dd>
                  <dt>merchant_spread</dt><dd>{detail.genome.split.merchant_spread}</dd>
                  <dt>ceiling_ratio</dt><dd>{detail.genome.split.ceiling_ratio}</dd>
                </dl>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------ detection engine */

function DetectionEngine({ snap }: { snap: Snapshot }) {
  const cal = snap.detector.calibration as Record<string, number | string>;
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Detection engine</h2>
          <p>
            Calibrated rules plus a logistic model over behavioural features. The operating point is a stated
            choice — swept for maximum F1 at deployment fraud prevalence under a hard false-positive ceiling —
            not a by-product of a percentile cut on legitimate scores.
          </p>
        </div>
      </div>

      <section className="kpis">
        <Kpi k="ROC-AUC" v={pct(snap.baseline?.roc_auc)} d="known templates" />
        <Kpi k="Average precision" v={pct(snap.baseline?.average_precision)} d="ranking quality" />
        <Kpi k="Block threshold" v={String(snap.detector.threshold_block)} d={`review at ${snap.detector.threshold_review}`} />
        <Kpi k="Calibrated for" v={pct(Number(cal.deploy_prevalence ?? 0), 2)} d="fraud prevalence" />
        <Kpi k="Scoring p95" v={snap.baseline ? `${(snap.baseline.p95_latency_ms * 1000).toFixed(0)} µs` : "—"} d="per transaction" />
      </section>

      <div className="grid two">
        <div className="card">
          <header><h3>Operating curve · known templates</h3><span className="hint">F1 peaks at a usable point</span></header>
          <div className="body">
            <OperatingCurve points={snap.baselineOperatingPoints} marker={snap.detector.threshold_block} />
            <p className="note" style={{ marginTop: 12 }}>
              Against attacks the model was trained on, precision and recall trade off cleanly and the swept
              threshold sits near the F1 peak.
            </p>
          </div>
        </div>

        <div className="card">
          <header><h3>Operating curve · evolved attack</h3><span className="hint">no threshold rescues it</span></header>
          <div className="body">
            {snap.duringAttackOperatingPoints.length ? (
              <>
                <OperatingCurve points={snap.duringAttackOperatingPoints} marker={snap.detector.threshold_block} />
                <p className="note" style={{ marginTop: 12 }}>
                  On the discovered blind spot the same detector&apos;s curves stay flat near zero across the entire
                  range. This is the central result: the operating point is not the problem, the <strong>missing
                  signal</strong> is. Lowering the threshold buys false positives, not recall.
                </p>
              </>
            ) : (
              <div className="empty"><strong>Not yet measured</strong>Run the red team and validate a defense to populate this curve.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <header><h3>Model coefficients</h3><span className="hint">{snap.detector.version}</span></header>
          <div className="body">
            <WeightBars names={snap.detector.feature_names} weights={snap.detector.weights} />
            <p className="note" style={{ marginTop: 14 }}>
              Bias {snap.detector.bias.toFixed(3)}. Every coefficient is positive and interpretable; features that
              only carry signal as an interaction are deliberately excluded from the linear model and left for the
              blue team to discover.
            </p>
          </div>
        </div>
        <div className="card">
          <header><h3>Calibration record</h3></header>
          <div className="body">
            <dl className="kv">
              {Object.entries(cal).map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt>{k}</dt>
                  <dd style={{ maxWidth: 260, whiteSpace: "normal", textAlign: "right" }}>
                    {typeof v === "number" ? (v < 1 && v > 0 ? v.toFixed(4) : String(v)) : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------- blue investigation */

function BlueInvestigation({
  snap, source, blindSpot, onValidate, busy,
}: { snap: Snapshot; source: string | null; blindSpot: Attempt | null; onValidate: () => void; busy: string | null }) {
  const p = snap.defenseProposal;
  if (!p) {
    return (
      <div className="card">
        <div className="empty">
          <strong>No investigation yet</strong>
          A confirmed blind spot is required first. Run the red team until the referee reproduces an evasion
          across four fresh seeds.
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Blue investigation</h2>
          <p>
            The investigator sees only referee output: false-negative feature medians, catch reasons and evasion
            rates. It may propose a bounded configuration change; it cannot assert that the change worked.
          </p>
        </div>
        <span className="spacer" />
        <button className="btn primary" onClick={onValidate} disabled={!!busy}>Validate at the gate</button>
      </div>

      <div className="grid sidebar-right">
        <div className="card">
          <header>
            <h3>Failure hypothesis</h3>
            <span className="hint">{blindSpot?.scenario_id} · source {source ?? "policy"} · confidence {(p.confidence * 100).toFixed(0)}%</span>
          </header>
          <div className="body">
            <p>{p.failure_hypothesis}</p>
            <h4 style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", margin: "16px 0 8px" }}>
              Measured evidence
            </h4>
            <ul className="bullets">
              {p.evidence.map((e, i) => <li key={i} className="mono">{e}</li>)}
            </ul>
            <h4 style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", margin: "16px 0 8px" }}>
              Recommended change
            </h4>
            <p className="note">{p.recommended_change}</p>
            <p className="note" style={{ marginTop: 8 }}><strong>Expected trade-off.</strong> {p.expected_tradeoff}</p>
          </div>
        </div>

        <div className="card">
          <header><h3>Proposed configuration</h3></header>
          <div className="body">
            <dl className="kv">
              {Object.entries(p.defense_config).map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt>{k}</dt><dd>{String(v)}</dd>
                </div>
              ))}
            </dl>
            <p className="note" style={{ marginTop: 14 }}>
              Every field is schema-bounded. A proposal outside these ranges is rejected before it can be
              evaluated, and the rejection is written to the audit ledger.
            </p>
            <div className="reasons" style={{ marginTop: 12 }}>
              {p.candidate_features.map((f) => <span key={f} className="tag info">{f}</span>)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ defense gate */

function DefenseGate({ snap, gate }: { snap: Snapshot; gate: Gate | null }) {
  if (!gate) {
    return (
      <div className="card">
        <div className="empty">
          <strong>Gate not run</strong>
          Investigate a confirmed blind spot, then validate the proposal against fresh-seed held-out attacks.
        </div>
      </div>
    );
  }
  const b = gate.before;
  const a = gate.after;
  const budgets = snap.gateBudgets;
  const fprDelta = b && a ? a.fpr - b.fpr : 0;
  const reviewDelta = b && a ? a.review_rate - b.review_rate : 0;
  const improved = gate.survival.filter((s) => s.cand_success < s.base_success).length;

  const checks: { label: string; actual: string; budget: string; pass: boolean }[] = [
    {
      label: "Threat recall gain",
      actual: b && a ? pts(a.recall_with_review - b.recall_with_review) : "—",
      budget: `≥ ${pts(budgets.min_threat_recall_gain, 0)}`,
      pass: !!b && !!a && a.recall_with_review - b.recall_with_review >= budgets.min_threat_recall_gain,
    },
    {
      label: "False-positive increase (absolute)",
      actual: pts(fprDelta, 3),
      budget: `≤ ${pts(budgets.max_fpr_delta_abs, 2)}`,
      pass: fprDelta <= budgets.max_fpr_delta_abs,
    },
    {
      label: "False-positive increase (relative)",
      actual: b && b.fpr > 0 ? `${((fprDelta / b.fpr) * 100).toFixed(0)}%` : "—",
      budget: `≤ ${(budgets.max_fpr_delta_rel * 100).toFixed(0)}%`,
      pass: !b || b.fpr === 0 || fprDelta / b.fpr <= budgets.max_fpr_delta_rel,
    },
    {
      label: "Extra review-queue load",
      actual: pts(reviewDelta, 2),
      budget: `≤ ${pts(budgets.max_review_rate_delta, 2)}`,
      pass: reviewDelta <= budgets.max_review_rate_delta,
    },
    {
      label: "Fresh descendants improved",
      actual: `${improved} of ${gate.survival.length}`,
      budget: `≥ ${(budgets.min_survival_share * 100).toFixed(0)}%`,
      pass: improved / Math.max(1, gate.survival.length) >= budgets.min_survival_share,
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Defense gate</h2>
          <p>
            The referee, not the blue team, decides. Fresh-seed held-out evaluation, a false-positive regression
            in both absolute and relative terms, a review-queue budget so recall cannot be bought with analyst
            load, a survival check across descendants, and an exact replay.
          </p>
        </div>
      </div>

      <div className={`alert ${gate.accepted ? "success" : "critical"}`}>
        <span className="icon" aria-hidden>{gate.accepted ? "✓" : "✕"}</span>
        <div>
          <h4>{gate.accepted ? "Defense accepted" : "Defense rejected"}</h4>
          <p>
            {gate.accepted
              ? "Every budget held on held-out attacks the blue team never saw. The candidate becomes the active defense."
              : gate.gateReasons.join("; ")}
          </p>
        </div>
      </div>

      <section className="kpis">
        <Kpi k="Recall incl. review" v={pct(a?.recall_with_review)} d={b ? `from ${pct(b.recall_with_review)}` : ""} tone="up" />
        <Kpi k="Recall (decline)" v={pct(a?.fraud_recall)} d={b ? `from ${pct(b.fraud_recall)}` : ""} tone="up" />
        <Kpi k="False positives" v={pct(a?.fpr)} d={pts(fprDelta, 3)} tone={fprDelta > 0 ? "down" : "up"} />
        <Kpi k="ROC-AUC" v={pct(a?.roc_auc)} d={b ? `from ${pct(b.roc_auc)}` : ""} tone="up" />
        <Kpi
          k="McNemar p"
          v={gate.significance ? (gate.significance.p_value < 0.001 ? "<0.001" : gate.significance.p_value.toFixed(4)) : "—"}
          d={gate.significance ? `${gate.significance.after_only} newly caught · ${gate.significance.before_only} newly missed` : ""}
          tone="up"
        />
      </section>

      <div className="grid sidebar-right">
        <div className="card">
          <header><h3>Acceptance budgets</h3><span className="hint">deterministic policy, not judgement</span></header>
          <div className="body tight">
            <table>
              <thead><tr><th>Check</th><th className="num">Measured</th><th className="num">Budget</th><th>Result</th></tr></thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.label}>
                    <td>{c.label}</td>
                    <td className="num">{c.actual}</td>
                    <td className="num" style={{ color: "var(--muted)" }}>{c.budget}</td>
                    <td><span className={`tag ${c.pass ? "allow" : "block"}`}>{c.pass ? "PASS" : "FAIL"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="body" style={{ borderTop: "1px solid var(--line)" }}>
            <p className="note">
              <strong>Why a paired test.</strong> Before and after score the same transactions, so McNemar&apos;s test
              is the correct statistic — an unpaired comparison would understate the evidence. Recall is reported
              with a 95% Wilson interval
              {gate.recallInterval
                ? `: ${pct(gate.recallInterval.before.low, 1)}–${pct(gate.recallInterval.before.high, 1)} before, ${pct(gate.recallInterval.after.low, 1)}–${pct(gate.recallInterval.after.high, 1)} after.`
                : "."}
            </p>
          </div>
        </div>

        <div className="card">
          <header><h3>Fresh-seed survival</h3><span className="hint">descendants blue never saw</span></header>
          <div className="body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {gate.survival.map((s) => (
              <div key={s.scenario_id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 5 }}>
                  <span className="mono">{s.scenario_id}</span>
                  <span className={`tag ${s.cand_success < s.base_success ? "allow" : "muted"}`}>
                    {s.cand_success < s.base_success ? "IMPROVED" : "NO CHANGE"}
                  </span>
                </div>
                <div className="deltabar">
                  <span className="label">before</span>
                  <span className="track"><span className="before" style={{ width: `${s.base_success * 100}%` }} /></span>
                  <span className="num">{pct(s.base_success, 0)}</span>
                </div>
                <div className="deltabar">
                  <span className="label">after</span>
                  <span className="track"><span className="after" style={{ width: `${s.cand_success * 100}%` }} /></span>
                  <span className="num">{pct(s.cand_success, 0)}</span>
                </div>
              </div>
            ))}
            <p className="note">Share of each descendant&apos;s transactions that still evade the detector. Shorter is better.</p>
          </div>
        </div>
      </div>

      <div className="grid two">
        <ReplayCard
          title="Exact replay · discovery scenario"
          hint="stored genome, stored seed"
          rows={gate.replayDiscovery?.changed ?? []}
          note={`Scenario ${gate.replayDiscovery?.scenario_id} recompiled from seed ${gate.replayDiscovery?.seed} and rescored under both defenses. This is the causal claim about the very attack that was discovered.`}
        />
        <ReplayCard
          title="Generalisation replay · fresh seeds"
          hint="same genome, unseen seeds"
          rows={gate.replayFresh.flatMap((r) => r.changed)}
          note="Fresh-seed recompiles of the same genome, reported separately so they are never mistaken for evidence about the stored scenario."
        />
      </div>
    </>
  );
}

function ReplayCard({ title, hint, rows, note }: { title: string; hint: string; rows: ReplayRow[]; note: string }) {
  return (
    <div className="card">
      <header><h3>{title}</h3><span className="hint">{hint} · {rows.length} changed</span></header>
      <div className="body tight scroll">
        {rows.length === 0 ? (
          <div className="empty">No decisions changed.</div>
        ) : (
          <table>
            <thead><tr><th>Transaction</th><th className="num">Amount</th><th>Before</th><th>After</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tx_id}>
                  <td className="mono">{r.tx_id}</td>
                  <td className="num">${r.amount.toFixed(2)}</td>
                  <td><span className={`tag ${r.before}`}>{r.before.toUpperCase()}</span></td>
                  <td><span className={`tag ${r.after}`}>{r.after.toUpperCase()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="body" style={{ borderTop: "1px solid var(--line)" }}><p className="note">{note}</p></div>
    </div>
  );
}

/* ------------------------------------------------------------------ audit */

const LEDGER_BACKING_NOTE: Record<string, string> = {
  repo: "Appended to data/ledger/experiments.jsonl in the working tree — durable across restarts on this host.",
  tmp: "This host's bundle directory is read-only, so records are appended to the instance temp directory. They survive within an instance but not across a redeploy — a production deployment needs a real append-only store.",
  memory: "No writable filesystem on this host; records are held in memory for this instance only.",
};

function Audit({
  snap, ledger, backing,
}: { snap: Snapshot; ledger: Record<string, unknown>[]; backing: string | null }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Experiment audit</h2>
          <p>
            Every referee decision is appended to a durable ledger with its seeds, versions and a content-derived
            experiment id. Two runs of the same experiment produce the same id.
          </p>
        </div>
      </div>

      <div className="grid three">
        {Object.entries(snap.versions).map(([k, v]) => (
          <div className="card" key={k}>
            <div className="body">
              <div className="k" style={{ fontSize: 10.5, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600 }}>{k.replace(/_/g, " ")}</div>
              <div className="mono" style={{ fontSize: 14, marginTop: 6 }}>{v}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <header>
          <h3>Referee ledger</h3>
          <span className="hint">{ledger.length} records</span>
          {backing && <span className={`tag ${backing === "repo" ? "allow" : "muted"}`}>{backing.toUpperCase()}</span>}
        </header>
        <div className="body tight scroll">
          {ledger.length === 0 ? (
            <div className="empty">No experiments recorded in this session yet.</div>
          ) : (
            <table>
              <thead><tr><th>Experiment</th><th>Kind</th><th>Scenario</th><th className="num">Seed</th><th>Decision</th><th>Notes</th></tr></thead>
              <tbody>
                {ledger.slice(-60).reverse().map((row, i) => (
                  <tr key={i}>
                    <td className="mono">{String(row.experiment_id ?? "").slice(0, 18)}</td>
                    <td><span className="tag muted">{String(row.kind ?? "")}</span></td>
                    <td className="mono">{String(row.scenario_id ?? "—")}</td>
                    <td className="num">{String(row.seed ?? "—")}</td>
                    <td>{row.decision ? <span className={`tag ${String(row.decision) === "ACCEPT" ? "allow" : String(row.decision) === "REJECT" ? "block" : "info"}`}>{String(row.decision)}</span> : "—"}</td>
                    <td className="note">{String(row.notes ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {backing && (
          <div className="body" style={{ borderTop: "1px solid var(--line)" }}>
            <p className="note">{LEDGER_BACKING_NOTE[backing]}</p>
          </div>
        )}
      </div>
    </>
  );
}
