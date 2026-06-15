// Split risk-history: SEPARATE testnet + mainnet small-multiple, lifted from the
// 120-tick `history` the SSE hook keeps. NON-INTERACTIVE (status, not control):
// pure SVG, no handlers. Each trace is colored by the LAST value's band and the
// 60/95 lines are etched (bound to BANDS). Keeps the single `{history}` prop so
// App.test (which mocks history:[]) renders the clean "warming up…" state.
import type { AgentTickDTO } from "@seawall/shared";
import { BANDS } from "../config";

const W = 320;
const H = 72;
const PADX = 6;
const PADTOP = 8;
const PADBOT = 8;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const yOf = (s: number): number => PADTOP + (1 - clamp(s, 0, 100) / 100) * (H - PADTOP - PADBOT);
const bandColor = (s: number): string => (s < BANDS.lo ? "var(--teal)" : s < BANDS.hi ? "var(--amber)" : "var(--red)");

function Mini({
  series,
  label,
  badge,
  badgeCls,
  mode,
}: {
  series: number[];
  label: string;
  badge: string;
  badgeCls: string;
  mode: string;
}) {
  const n = series.length;
  const xOf = (i: number): number => PADX + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * PADX));
  const line = series.map((s, i) => `${xOf(i).toFixed(1)},${yOf(s).toFixed(2)}`).join(" ");
  const area = n >= 2 ? `${PADX},${H - PADBOT} ${line} ${W - PADX},${H - PADBOT}` : "";
  const last = series[n - 1] ?? 0;
  const col = bandColor(last);
  const dead = mode === "dead";

  return (
    <div className="mini-spark">
      <div className="mini-head">
        <span className="lbl">{label}</span>
        <span className={"tag " + badgeCls}>{badge}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label} risk history`}>
        {/* band etch lines (SCORE_LO / SCORE_HI) */}
        <line x1="0" y1={yOf(BANDS.lo)} x2={W} y2={yOf(BANDS.lo)} stroke="var(--amber-line)" strokeWidth="1" strokeDasharray="3 5" opacity="0.5" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={yOf(BANDS.hi)} x2={W} y2={yOf(BANDS.hi)} stroke="var(--coral-line)" strokeWidth="1" strokeDasharray="3 5" opacity="0.5" vectorEffect="non-scaling-stroke" />
        {n >= 2 ? (
          <>
            <polygon points={area} fill={col} opacity="0.1" />
            <polyline
              points={line}
              fill="none"
              stroke={dead ? "var(--muted)" : col}
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={dead ? "4 4" : undefined}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={xOf(n - 1)} cy={yOf(last)} r="2.6" fill={col} />
          </>
        ) : (
          <text x={W / 2} y={H / 2} fontSize="10" fontFamily="var(--font-mono)" fill="var(--muted)" textAnchor="middle" dominantBaseline="middle">
            warming up…
          </text>
        )}
        {/* malicious: faint amber wash on the right 20% of the testnet panel only */}
        {mode === "malicious" && <rect x={W * 0.8} y="0" width={W * 0.2} height={H} fill="var(--amber-wash)" />}
      </svg>
    </div>
  );
}

export function Sparkline({ history }: { history: AgentTickDTO[] }) {
  const h = history.slice(-120);
  const testnet = h.map((t) => t.scoreOverall ?? 0);
  const mainnet = h.filter((t) => t.observatory?.ok).map((t) => t.observatory!.score);
  const mode = h[h.length - 1]?.mode ?? "calm";

  return (
    <section className="card sparkstrip">
      <div className="sparkhead">
        <span className="lbl">Risk history</span>
        <span className="hint">last {h.length} ticks · color = current band (60 / 95 etched)</span>
      </div>
      <div className="spark-split">
        <Mini series={testnet} label="TESTNET" badge="ENFORCED · IN USE" badgeCls="tag-agent" mode={mode} />
        <Mini series={mainnet} label="MAINNET" badge="READ-ONLY · OBSERVING" badgeCls="tag-readonly" mode="calm" />
      </div>
    </section>
  );
}
