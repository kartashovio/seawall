// Score-history tide-chart — lifts the 120-tick `history` the SSE hook already
// keeps but the old UI never drew. NON-INTERACTIVE (status, not control): pure
// SVG, no handlers. The trace stroke is a vertical cyan→amber→coral gradient so
// height encodes risk automatically (a Scene-2 slow creep across the 60 line is
// visible as the trace warms from cyan toward amber). The dashed etch lines are
// read from BANDS (= the on-chain SCORE_LO/HI), so the chart shares the contract
// thresholds the gauge bands bind to.
import type { AgentTickDTO } from "@seawall/shared";
import { BANDS } from "../config";

const W = 1000;
const H = 44;
const PAD = 4;

const yOf = (s: number): number => PAD + (1 - Math.max(0, Math.min(100, s)) / 100) * (H - 2 * PAD);

export function Sparkline({ history }: { history: AgentTickDTO[] }) {
  const pts = history.slice(-120).map((t) => t.scoreOverall ?? 0);
  const n = pts.length;
  const last = history[history.length - 1];
  const mode = last?.mode ?? "calm";

  const xOf = (i: number): number => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const line = pts.map((s, i) => `${xOf(i).toFixed(1)},${yOf(s).toFixed(2)}`).join(" ");
  const area = n >= 2 ? `0,${H} ${line} ${W},${H}` : "";

  const lo = yOf(BANDS.lo);
  const hi = yOf(BANDS.hi);
  const dead = mode === "dead";

  return (
    <section className="card sparkstrip">
      <div className="sparkhead">
        <span className="lbl">Risk history</span>
        <span className="hint">last {n} ticks · color = height (cyan→amber→coral)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="risk score history">
        <defs>
          <linearGradient id="spark-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
            <stop offset="0%" stopColor="var(--coral)" />
            <stop offset="22%" stopColor="var(--amber)" />
            <stop offset="55%" stopColor="var(--cyan)" />
            <stop offset="100%" stopColor="var(--cyan)" />
          </linearGradient>
          <linearGradient id="spark-area" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
            <stop offset="0%" stopColor="rgba(45,212,191,0.16)" />
            <stop offset="100%" stopColor="rgba(45,212,191,0)" />
          </linearGradient>
        </defs>

        {/* band etch lines (SCORE_LO / SCORE_HI) */}
        <line x1="0" y1={lo} x2={W} y2={lo} stroke="var(--amber-line)" strokeWidth="1" strokeDasharray="4 6" />
        <line x1="0" y1={hi} x2={W} y2={hi} stroke="var(--coral-line)" strokeWidth="1" strokeDasharray="4 6" />

        {n >= 2 && (
          <>
            <polygon points={area} fill="url(#spark-area)" />
            <polyline
              points={line}
              fill="none"
              stroke={dead ? "var(--muted)" : "url(#spark-stroke)"}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={dead ? "5 5" : undefined}
            />
            {/* newest-tick dot */}
            <circle
              className="spark-dot"
              cx={W}
              cy={yOf(pts[n - 1])}
              r="3.2"
              fill={pts[n - 1] >= BANDS.hi ? "var(--coral)" : pts[n - 1] >= BANDS.lo ? "var(--amber)" : "var(--cyan)"}
            />
          </>
        )}
        {/* malicious: faint amber hatch over the right 20% */}
        {mode === "malicious" && <rect x={W * 0.8} y="0" width={W * 0.2} height={H} fill="var(--amber-wash)" />}
      </svg>
    </section>
  );
}
