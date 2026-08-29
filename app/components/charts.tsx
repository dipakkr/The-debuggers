"use client";

export interface Point {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  fpr: number;
  false_positives: number;
}

/**
 * Precision / recall / F1 against the decision threshold.
 *
 * This is the chart that carries the argument. On known templates the three
 * curves separate and F1 peaks at a usable operating point. On an evolved
 * attack the same detector's curves stay flat near zero across the whole
 * range — no threshold rescues it, which is why a new signal is needed rather
 * than a new threshold.
 */
export function OperatingCurve({
  points,
  marker,
  height = 190,
}: {
  points: Point[];
  marker?: number;
  height?: number;
}) {
  const W = 460;
  const H = height;
  const pad = { l: 34, r: 10, t: 12, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  if (!points.length) return null;

  const x = (t: number) => pad.l + t * iw;
  const y = (v: number) => pad.t + (1 - v) * ih;
  const line = (key: "precision" | "recall" | "f1") =>
    points.map((p, i) => `${i ? "L" : "M"}${x(p.threshold).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  const series: [string, string, string][] = [
    ["recall", "var(--block)", "Recall"],
    ["precision", "var(--info)", "Precision"],
    ["f1", "var(--allow)", "F1"],
  ];

  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label="Precision, recall and F1 plotted against the decision threshold">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line className="gridline" x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} />
            <text x={pad.l - 6} y={y(g) + 3} textAnchor="end">{Math.round(g * 100)}</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <text key={g} x={x(g)} y={H - 7} textAnchor="middle">{g.toFixed(2)}</text>
        ))}
        <line className="axis" x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} />
        <line className="axis" x1={pad.l} x2={pad.l} y1={pad.t} y2={y(0)} />
        {marker !== undefined && (
          <g>
            <line x1={x(marker)} x2={x(marker)} y1={pad.t} y2={y(0)}
              stroke="var(--mc-orange)" strokeWidth="1.5" strokeDasharray="3 3" />
            <text x={x(marker)} y={pad.t - 3} textAnchor="middle" fill="var(--mc-orange)">
              block {marker.toFixed(3)}
            </text>
          </g>
        )}
        {series.map(([key, colour]) => (
          <path key={key} className="chart-line" d={line(key as "precision")} fill="none"
            stroke={colour} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      <div className="legend">
        {series.map(([, colour, label]) => (
          <span key={label}><i style={{ background: colour }} />{label}</span>
        ))}
        {marker !== undefined && <span><i style={{ background: "var(--mc-orange)" }} />Chosen operating point</span>}
      </div>
    </div>
  );
}

/** Horizontal weight chart for the trained model's coefficients. */
export function WeightBars({ names, weights }: { names: string[]; weights: number[] }) {
  const max = Math.max(...weights.map(Math.abs), 0.001);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {names.map((n, i) => (
        <div key={n} style={{ display: "grid", gridTemplateColumns: "142px 1fr 54px", gap: 10, alignItems: "center" }}>
          <span className="mono" style={{ color: "var(--muted)" }}>{n}</span>
          <span className="meter">
            <span style={{
              width: `${(Math.abs(weights[i]) / max) * 100}%`,
              background: weights[i] >= 0 ? "var(--mc-orange)" : "var(--info)",
            }} />
          </span>
          <span className="num mono">{weights[i].toFixed(3)}</span>
        </div>
      ))}
    </div>
  );
}
