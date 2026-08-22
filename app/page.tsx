"use client";

import { useCallback, useEffect, useState } from "react";

interface MetricsRow {
  fraud_recall: number;
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

interface GenomeShape {
  family: string;
  amount: { base: number; jitter: number; drain_multiplier: number };
  velocity: { tx_per_hour: number };
  temporal: { start_hour_utc: number; span_hours: number };
  merchant: { mcc: string; new_merchant: boolean };
  device: { age_days: number; geo_jump_km: number };
  identity: { account_age_days: number };
  sequence: { probe_count: number; interarrival_s: number; regularity: number; drain_after_probe: boolean };
}

interface Attempt {
  scenario_id: string;
  parent_scenario_id: string | null;
  generation: number;
  family: string;
  genome: GenomeShape | null;
  hypothesis: string;
  seed: number;
  verdict: "pending" | "caught" | "evaded" | "invalid";
  fitness: number | null;
  reasons: string[];
  attack_success_rate: number | null;
  risk_max: number | null;
}

interface DefenseCfg {
  threshold: number;
  escalation_weight: number;
  pattern_weight: number;
  graph_weight: number;
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

interface Snapshot {
  mode: "demo" | "live";
  generation: number;
  attempts: Attempt[];
  childrenOf: Record<string, string[]>;
  beam: string[];
  blindSpotScenarioId: string | null;
  baseline: MetricsRow | null;
  duringAttack: MetricsRow | null;
  afterDefense: MetricsRow | null;
  defenseAccepted: boolean | null;
  defenseProposal: Proposal | null;
  defenseConfig: DefenseCfg | null;
  replayDiff: { tx_id: string; amount: number; before: string; after: string }[] | null;
  gateReasons: string[];
  log: { ts: string; level: string; msg: string }[];
}

interface GateSurvival {
  scenario_id: string;
  base_success: number;
  cand_success: number;
}

const FAMILIES = ["card_testing_drain", "low_and_slow", "mule_fanout"];
const LANE_Y: Record<string, number> = {
  card_testing_drain: 70,
  low_and_slow: 150,
  mule_fanout: 230,
};
const FAMILY_SHORT: Record<string, string> = {
  card_testing_drain: "CARD-TEST",
  low_and_slow: "LOW-SLOW",
  mule_fanout: "MULE",
};

const pct = (x?: number | null) => (x == null ? "n/a" : (x * 100).toFixed(2) + "%");
const num = (x?: number | null, d = 3) => (x == null ? "n/a" : x.toFixed(d));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Tab = "command" | "intel" | "evo" | "investigation" | "validation" | "audit";

export default function Page() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>("command");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [survival, setSurvival] = useState<GateSurvival[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [intel, setIntel] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ledger, setLedger] = useState<any[]>([]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/session/state");
      const s = (await r.json()) as Snapshot;
      setSnap(s);
      setMode(s.mode);
    } catch {
      /* server unreachable */
    }
  }, []);

  useEffect(() => {
    void refresh();
    fetch("/api/threat-intel")
      .then((r) => r.json())
      .then(setIntel)
      .catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (tab === "audit") {
      fetch("/api/experiments")
        .then((r) => r.json())
        .then((d) => setLedger(d.experiments ?? []))
        .catch(() => {});
    }
  }, [tab]);

  async function post(url: string, body?: unknown) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.json();
  }

  async function doReset() {
    setBusy(true);
    try {
      const s = (await post("/api/session/reset", { mode })) as Snapshot;
      setSnap(s);
      setSurvival([]);
      setSelectedId(null);
    } finally {
      setBusy(false);
    }
  }

  async function stepGeneration(): Promise<Snapshot> {
    const s = (await post("/api/session/generate")) as Snapshot;
    setSnap(s);
    return s;
  }

  async function autoRedTeam() {
    if (!snap || busy || snap.blindSpotScenarioId) return;
    setBusy(true);
    try {
      let cur = snap;
      for (let i = 0; i < 6 && !cur.blindSpotScenarioId; i++) {
        await sleep(420); // let the feed breathe between generations
        cur = await stepGeneration();
      }
    } finally {
      setBusy(false);
    }
  }

  async function investigate() {
    setBusy(true);
    try {
      const d = await post("/api/blue/investigate");
      if (d && !d.error) setSnap(d as Snapshot);
      setTab("investigation");
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    setBusy(true);
    try {
      const d = (await post("/api/defense/validate")) as Snapshot & {
        gate?: { accepted: boolean; gateReasons: string[]; survival: GateSurvival[] };
      };
      if (d.gate) {
        setSnap(d);
        setSurvival(d.gate.survival ?? []);
      }
      setTab("validation");
    } finally {
      setBusy(false);
    }
  }

  if (!snap) {
    return (
      <div className="app">
        <div className="empty-note">connecting to the arena…</div>
      </div>
    );
  }

  const hasBlindSpot = Boolean(snap.blindSpotScenarioId);
  const feed = snap.attempts.slice(-12);
  const activeScenarioId = snap.blindSpotScenarioId ?? feed.at(-1)?.scenario_id ?? null;

  const stages: [string, boolean][] = [
    ["IDENTIFY", true],
    ["GENERATE", snap.generation > 0],
    ["ATTACK", snap.attempts.some((attempt) => attempt.generation > 0)],
    ["EVADE", hasBlindSpot],
    ["DISCOVER", hasBlindSpot],
    ["DEFEND", Boolean(snap.defenseProposal)],
    ["REPLAY", Boolean(snap.replayDiff)],
    ["MEASURE", Boolean(snap.duringAttack)],
  ];

  const railSteps: [string, boolean][] = [
    ["THREAT INTELLIGENCE", true],
    ["RED STRATEGIST", snap.generation > 0],
    ["FRAUD GENOME", snap.attempts.length > 0],
    ["PAYMENT TWIN", snap.attempts.length > 0],
    ["RISK ENGINE", snap.attempts.length > 0],
    ["REFEREE SCORES", snap.attempts.length > 0],
    ["BLUE INVESTIGATOR", Boolean(snap.defenseProposal)],
    ["DEFENSE GATE", snap.defenseAccepted !== null],
    ["EXACT REPLAY", Boolean(snap.replayDiff)],
  ];

  return (
    <div className="app">
      <section className="thesis" aria-labelledby="arena-thesis">
        <div>
          <p className="eyebrow">AI PAYMENT-SECURITY COMMAND CENTER</p>
          <h1 id="arena-thesis">Generate tomorrow’s fraud today.</h1>
          <p>Red evolves synthetic attacks. Blue proposes defenses. The Referee owns truth.</p>
        </div>
        <div className="arena-status" aria-live="polite">
          <span className="synthetic-banner">SYNTHETIC PAYMENT ENVIRONMENT</span>
          <span>{busy ? "ARENA RUNNING" : `GENERATION ${snap.generation}`}</span>
          <span>{activeScenarioId ? `ACTIVE ${activeScenarioId}` : "BASELINE READY"}</span>
        </div>
      </section>

      <ol className="stage-rail" aria-label="Arena stages">
        {stages.map(([stage, complete]) => (
          <li key={stage} className={complete ? "complete" : ""}>
            {stage}
          </li>
        ))}
      </ol>

      <header className="top">
        <div className="logo">
          ADVERSARIAL <span className="r">FRAUD</span> <span className="b">ARENA</span>
        </div>
        <div className="subtitle">Red AI vs Blue AI vs deterministic Referee</div>
        <div className="spacer" />
        <span className={"mode-badge" + (mode === "live" ? " live" : "")}>{mode.toUpperCase()} MODE</span>
        <label className="sr-only" htmlFor="arena-mode">Arena mode</label>
        <select
          id="arena-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "demo" | "live")}
          style={{ background: "var(--panel2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 8px" }}
        >
          <option value="demo">DEMO (deterministic)</option>
          <option value="live">LIVE (LLM)</option>
        </select>
        <button className="btn" onClick={doReset} disabled={busy}>
          RESET
        </button>
        <button className="btn primary-red" onClick={autoRedTeam} disabled={busy || hasBlindSpot}>
          {hasBlindSpot ? "BLIND SPOT FOUND" : "RUN RED TEAM"}
        </button>
        <button className="btn primary-blue" onClick={investigate} disabled={busy || !hasBlindSpot || Boolean(snap.defenseProposal)}>
          INVESTIGATE
        </button>
        <button className="btn accent-green" onClick={validate} disabled={busy || !snap.defenseProposal || snap.defenseAccepted !== null}>
          VALIDATE DEFENSE
        </button>
      </header>

      <nav className="tabs" aria-label="Arena views">
        {(
          [
            ["command", "COMMAND CENTER"],
            ["intel", "THREAT INTEL"],
            ["evo", "EVOLUTION"],
            ["investigation", "INVESTIGATION"],
            ["validation", "VALIDATION"],
            ["audit", "AUDIT"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "command" && (
        <>
          <div className="arena-grid">
            <div className="panel col-red">
              <h3>Red Team · attack evolution</h3>
              {feed.length === 0 && <div className="empty-note">press RUN RED TEAM</div>}
              {feed.map((a) => (
                <div key={a.scenario_id} className={"feed-item" + (a.verdict === "evaded" ? " evaded" : "") + (a.verdict === "invalid" ? " invalid" : "") + (a.scenario_id === activeScenarioId ? " active" : "")}>
                  <span className="fam-chip">{FAMILY_SHORT[a.family] ?? a.family}</span>
                  <span>{a.scenario_id}</span>
                  <span style={{ color: "var(--dim)" }}>g{a.generation}</span>
                  <span className="spacer" />
                  <span>{num(a.attack_success_rate, 2)} allow</span>
                  <span className={"badge " + (a.verdict === "caught" ? "blocked" : a.verdict === "evaded" ? "evaded" : "review")}>
                    {a.verdict === "caught" ? "BLOCKED" : a.verdict.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>

            <div className="panel col-rail">
              <h3>Payment Rail · pipeline</h3>
              {railSteps.map(([label, on], i) => (
                <div key={label}>
                  <div className="rail-step">
                    <span className={"rail-dot" + (on ? " on" : "")} />
                    <span style={{ color: on ? "var(--text)" : "var(--dim)" }}>{label}</span>
                  </div>
                  {i < railSteps.length - 1 && <div className="rail-line" />}
                </div>
              ))}
              {hasBlindSpot && <div className="hero-alert" role="alert">BLIND SPOT DISCOVERED: {snap.blindSpotScenarioId}</div>}
              {!hasBlindSpot && (
                <div className="empty-note">
                  generation {snap.generation} · red adapts to every referee outcome until it finds what the detector cannot see
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                {snap.log
                  .slice(-4)
                  .reverse()
                  .map((l, i) => (
                    <div key={i} className={"log-line" + (l.level === "hero" ? " hero" : "")}>
                      ▸ {l.msg}
                    </div>
                  ))}
              </div>
            </div>

            <div className="panel col-blue">
              <h3>Blue Team · risk engine</h3>
              <div className="kv">
                <span className="k">detector</span>
                <span className="v">{snap.afterDefense ? "risk-engine v2 (defended)" : "risk-engine v1"}</span>
              </div>
              <div className="kv">
                <span className="k">decision threshold</span>
                <span className="v">{num(snap.defenseConfig?.threshold ?? 0.3874, 4)}</span>
              </div>
              <div className="kv">
                <span className="k">graph weight</span>
                <span className="v">{num(snap.defenseConfig?.graph_weight ?? 0, 2)}</span>
              </div>
              <div className="kv">
                <span className="k">pattern / escalation weight</span>
                <span className="v">
                  {num(snap.defenseConfig?.pattern_weight ?? 0, 2)} / {num(snap.defenseConfig?.escalation_weight ?? 0, 2)}
                </span>
              </div>
              <div className="kv">
                <span className="k">defense status</span>
                <span className="v">
                  {snap.defenseAccepted === true ? "ACCEPTED" : snap.defenseAccepted === false ? "REJECTED" : "awaiting proposal"}
                </span>
              </div>
            </div>
          </div>

          <div className="panel referee-bar">
            <h3>Referee · authoritative metrics (neither AI grades itself)</h3>
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>metric</th>
                  <th>baseline v1</th>
                  <th>under red attack</th>
                  <th>after defense v2</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>fraud recall</td>
                  <td>{pct(snap.baseline?.fraud_recall)}</td>
                  <td>{pct(snap.duringAttack?.fraud_recall)}</td>
                  <td className={snap.afterDefense ? "good" : ""}>{pct(snap.afterDefense?.fraud_recall)}</td>
                </tr>
                <tr>
                  <td>false positive rate</td>
                  <td>{pct(snap.baseline?.fpr)}</td>
                  <td>{pct(snap.duringAttack?.fpr)}</td>
                  <td className={(snap.afterDefense?.fpr ?? 0) <= 0.03 ? "good" : "warn"}>{pct(snap.afterDefense?.fpr)}</td>
                </tr>
                <tr>
                  <td>review rate</td>
                  <td>{pct(snap.baseline?.review_rate)}</td>
                  <td>{pct(snap.duringAttack?.review_rate)}</td>
                  <td>{pct(snap.afterDefense?.review_rate)}</td>
                </tr>
                <tr>
                  <td>precision</td>
                  <td>{pct(snap.baseline?.precision)}</td>
                  <td>{pct(snap.duringAttack?.precision)}</td>
                  <td>{pct(snap.afterDefense?.precision)}</td>
                </tr>
                <tr>
                  <td>average precision</td>
                  <td>{num(snap.baseline?.average_precision)}</td>
                  <td>{num(snap.duringAttack?.average_precision)}</td>
                  <td>{num(snap.afterDefense?.average_precision)}</td>
                </tr>
                <tr>
                  <td>p95 latency / tx</td>
                  <td>{num(snap.baseline?.p95_latency_ms)} ms</td>
                  <td>{num(snap.duringAttack?.p95_latency_ms)} ms</td>
                  <td>{num(snap.afterDefense?.p95_latency_ms)} ms</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="footer-note">
            All identities, merchants, and transactions are synthetic. Bounded behavioral parameters contain each attack. The system has no real payment data.
          </div>
        </>
      )}

      {tab === "intel" && (
        <div className="panel">
          <h3>Threat Intelligence · IDENTIFY</h3>
          {intel?.assessment && (
            <div className="hypo">
              <strong>{intel.assessment.headline}</strong>
              <div style={{ marginTop: 8, color: "var(--dim)", fontSize: 13 }}>{intel.assessment.rationale}</div>
            </div>
          )}
          <table className="data">
            <thead>
              <tr>
                <th>family</th>
                <th>how GenAI changes it</th>
                <th>observable signals</th>
                <th>potential blind spot</th>
                <th>in arena</th>
              </tr>
            </thead>
            <tbody>
              {(intel?.families ?? []).map((f: { id: string; name: string; how_genai_changes_it: string; observable_signals: string[]; potential_blind_spot: string; selected: boolean }) => (
                <tr key={f.id} className={f.selected ? "selected-row" : ""}>
                  <td className="plain" style={{ fontWeight: f.selected ? 700 : 400 }}>{f.name}</td>
                  <td className="plain">{f.how_genai_changes_it}</td>
                  <td className="plain">{f.observable_signals.join(", ")}</td>
                  <td className="plain">{f.potential_blind_spot}</td>
                  <td>{f.selected ? "simulated" : "not selected"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "evo" && <EvolutionTab snap={snap} selectedId={selectedId} onSelect={setSelectedId} />}

      {tab === "investigation" && (
        <div className="panel">
          <h3>Blue Investigation · why the detector missed it</h3>
          {!snap.defenseProposal && <div className="empty-note">Confirm a blind spot, then select INVESTIGATE.</div>}
          {snap.defenseProposal && (
            <>
              <div className="hypo">{snap.defenseProposal.failure_hypothesis}</div>
              <h3 style={{ marginTop: 6 }}>Evidence (referee-measured medians on missed transactions)</h3>
              <ul className="evidence">
                {snap.defenseProposal.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              <h3 style={{ marginTop: 14 }}>Proposed defense change (bounded knobs only)</h3>
              <div className="diff-row"><span>knob</span><span>v1 → proposed</span></div>
              <div className="diff-row changed-after">
                <span>threshold</span>
                <span>0.3874 → {num(snap.defenseProposal.defense_config.threshold, 4)}</span>
              </div>
              <div className="diff-row">
                <span>escalation_weight</span>
                <span>0 → {num(snap.defenseProposal.defense_config.escalation_weight, 2)}</span>
              </div>
              <div className="diff-row">
                <span>pattern_weight</span>
                <span>0 → {num(snap.defenseProposal.defense_config.pattern_weight, 2)}</span>
              </div>
              <div className="diff-row changed-after">
                <span>graph_weight</span>
                <span>0 → {num(snap.defenseProposal.defense_config.graph_weight, 2)}</span>
              </div>
              <p style={{ marginTop: 10, fontSize: 13 }}>{snap.defenseProposal.recommended_change}</p>
              <p style={{ marginTop: 6, fontSize: 12, color: "var(--dim)" }}>expected tradeoff: {snap.defenseProposal.expected_tradeoff}</p>
            </>
          )}
        </div>
      )}

      {tab === "validation" && (
        <div className="panel">
          <h3>Defense Validation · deterministic referee verdict</h3>
          {snap.defenseAccepted === null && <div className="empty-note">nothing validated yet</div>}
          {snap.defenseAccepted !== null && (
            <>
              <div className={"hero-alert " + (snap.defenseAccepted ? "accepted" : "rejected")} role="status">
                DEFENSE {snap.defenseAccepted ? "ACCEPTED" : "REJECTED"}
              </div>
              {snap.gateReasons.length > 0 && (
                <ul className="evidence">
                  {snap.gateReasons.map((r, i) => (
                    <li key={i} style={{ color: "var(--red)" }}>{r.replace(/_/g, " ")}</li>
                  ))}
                </ul>
              )}
              <div style={{ display: "flex", gap: 8, margin: "10px 0", flexWrap: "wrap" }}>
                {survival.map((s) => (
                  <span key={s.scenario_id} className={"badge " + (s.cand_success < s.base_success ? "accepted" : "rejected")}>
                    {s.scenario_id}: {pct(s.base_success)} → {pct(s.cand_success)}
                  </span>
                ))}
              </div>
              <h3 style={{ marginTop: 12 }}>Exact replay · same seed, same transactions, both engines</h3>
              {!snap.replayDiff?.length && <div className="empty-note">no decision changes on replay</div>}
              {!!snap.replayDiff?.length && (
                <table className="data">
                  <thead>
                    <tr>
                      <th>transaction</th>
                      <th>amount</th>
                      <th>v1 before</th>
                      <th>v2 after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.replayDiff.map((r) => (
                      <tr key={r.tx_id}>
                        <td>{r.tx_id}</td>
                        <td>${r.amount.toFixed(2)}</td>
                        <td style={{ color: "var(--red)" }}>{r.before.toUpperCase()}</td>
                        <td style={{ color: "var(--green)" }}>{r.after.toUpperCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p style={{ marginTop: 10, fontSize: 12, color: "var(--dim)" }}>
                Replay recompiles the exact discovery scenario from its stored genome + seed and rescores it under both engine versions.
              </p>
            </>
          )}
        </div>
      )}

      {tab === "audit" && (
        <div className="panel">
          <h3>Experiment Audit · versioned ledger (JSONL)</h3>
          <table className="data">
            <thead>
              <tr>
                <th>time</th>
                <th>kind</th>
                <th>scenario</th>
                <th>seed</th>
                <th>decision</th>
                <th>metrics</th>
              </tr>
            </thead>
            <tbody>
              {[...ledger].reverse().slice(0, 40).map((e, i) => (
                <tr key={i}>
                  <td>{new Date(e.ts).toLocaleTimeString()}</td>
                  <td>{e.kind}</td>
                  <td>{e.scenario_id ?? "n/a"}</td>
                  <td>{e.seed ?? "n/a"}</td>
                  <td>{e.decision ?? ""}</td>
                  <td>{e.metrics ? JSON.stringify(e.metrics).slice(0, 90) : e.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ledger.length === 0 && <div className="empty-note">ledger empty</div>}
        </div>
      )}
    </div>
  );
}

function EvolutionTab({
  snap,
  selectedId,
  onSelect,
}: {
  snap: Snapshot;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const byId = new Map(snap.attempts.map((a) => [a.scenario_id, a]));
  const maxGen = Math.max(0, ...snap.attempts.map((a) => a.generation));
  const W = Math.max(760, 140 + maxGen * 105);
  const H = 300;

  const pos = (a: Attempt) => ({ x: 70 + a.generation * 105, y: LANE_Y[a.family] ?? 150 });

  const edges: { x1: number; y1: number; x2: number; y2: number; hot: boolean }[] = [];
  for (const a of snap.attempts) {
    if (!a.parent_scenario_id) continue;
    const p = byId.get(a.parent_scenario_id);
    if (!p) continue;
    const pPos = pos(p);
    const cPos = pos(a);
    const hot =
      snap.blindSpotScenarioId != null &&
      (a.scenario_id === snap.blindSpotScenarioId || isAncestor(a, snap.blindSpotScenarioId, byId));
    edges.push({ x1: pPos.x, y1: pPos.y, x2: cPos.x, y2: cPos.y, hot });
  }

  function isAncestor(node: Attempt, targetId: string, byId: Map<string, Attempt>): boolean {
    let cur = byId.get(targetId);
    while (cur?.parent_scenario_id) {
      if (cur.parent_scenario_id === node.scenario_id) return true;
      cur = byId.get(cur.parent_scenario_id);
    }
    return false;
  }

  const sel = selectedId ? byId.get(selectedId) : null;
  const active = snap.blindSpotScenarioId
    ? byId.get(snap.blindSpotScenarioId)
    : snap.attempts.at(-1);

  return (
    <div className="evo-wrap">
      <div className="panel">
        <h3>Fraud Evolution Tree · lineage of every attack</h3>
        <div className="evo-summary" aria-live="polite">
          <strong>ACTIVE MUTATION</strong>
          <span>{active?.scenario_id ?? "No mutation"}</span>
          <span>{active ? `${FAMILY_SHORT[active.family] ?? active.family} / ${active.verdict.toUpperCase()}` : "Run Red Team"}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
          {edges.map((e, i) => (
            <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={e.hot ? "#ff5c66" : "#232c3d"} strokeWidth={e.hot ? 2 : 1.5} />
          ))}
          {snap.attempts.map((a) => {
            const p = pos(a);
            const fill =
              a.verdict === "evaded" ? "#ff5c66" : a.verdict === "invalid" ? "#333c48" : a.verdict === "caught" ? "#2a3345" : "#d29922";
            return (
              <g
                key={a.scenario_id}
                className="tree-node"
                onClick={() => onSelect(a.scenario_id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(a.scenario_id);
                }}
                role="button"
                tabIndex={0}
                aria-label={`${a.scenario_id}, generation ${a.generation}, ${a.verdict}`}
              >
                {a.scenario_id === snap.blindSpotScenarioId && (
                  <circle cx={p.x} cy={p.y} r={20} fill="none" stroke="#ff5c66" strokeWidth={1.5} strokeDasharray="4 3">
                    <animate attributeName="stroke-opacity" values="1;0.15;1" dur="1.4s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={p.x} cy={p.y} r={13} fill={fill} stroke={selectedId === a.scenario_id || active?.scenario_id === a.scenario_id ? "#e8edf5" : "#0a0d13"} strokeWidth={2} />
                <text x={p.x} y={p.y + 30} textAnchor="middle" fontSize={9} fill="#7a8699" fontFamily="monospace">
                  {a.scenario_id}
                </text>
              </g>
            );
          })}
          {FAMILIES.map((f) => (
            <text key={f} x={8} y={(LANE_Y[f] ?? 150) + 4} fontSize={10} fill="#58a6ff" fontFamily="monospace">
              {FAMILY_SHORT[f]}
            </text>
          ))}
        </svg>
      </div>

      <div className="panel">
        <h3>Genome Inspector</h3>
        {!sel && <div className="empty-note">click any node</div>}
        {sel && (
          <>
            <div className="kv"><span className="k">scenario</span><span className="v">{sel.scenario_id}</span></div>
            <div className="kv"><span className="k">generation</span><span className="v">{sel.generation}</span></div>
            <div className="kv"><span className="k">seed</span><span className="v">{sel.seed}</span></div>
            <div className="kv"><span className="k">verdict</span><span className="v">{sel.verdict.toUpperCase()}</span></div>
            <div className="kv"><span className="k">fitness</span><span className="v">{num(sel.fitness)}</span></div>
            <div className="kv"><span className="k">attack success</span><span className="v">{pct(sel.attack_success_rate)}</span></div>
            <div className="kv"><span className="k">max risk seen</span><span className="v">{num(sel.risk_max)}</span></div>
            {sel.reasons.length > 0 && (
              <div className="kv"><span className="k">catch reasons</span><span className="v" style={{ textAlign: "right" }}>{sel.reasons.join(", ")}</span></div>
            )}
            {sel.genome && (
              <div className="genome-grid" style={{ marginTop: 10 }}>
                {[
                  ["base amount", `$${sel.genome.amount.base}`],
                  ["jitter", num(sel.genome.amount.jitter, 2)],
                  ["drain ×", num(sel.genome.amount.drain_multiplier, 1)],
                  ["tx/hour", String(sel.genome.velocity.tx_per_hour)],
                  ["start hour UTC", String(sel.genome.temporal.start_hour_utc)],
                  ["span hours", String(sel.genome.temporal.span_hours)],
                  ["mcc", sel.genome.merchant.mcc],
                  ["new merchant", sel.genome.merchant.new_merchant ? "yes" : "no"],
                  ["device age days", String(sel.genome.device.age_days)],
                  ["account age days", String(sel.genome.identity.account_age_days)],
                  ["probes", String(sel.genome.sequence.probe_count)],
                  ["interarrival s", String(sel.genome.sequence.interarrival_s)],
                  ["regularity", num(sel.genome.sequence.regularity, 2)],
                ].map(([k, v]) => (
                  <div className="kv" key={k}>
                    <span className="k">{k}</span>
                    <span className="v">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
