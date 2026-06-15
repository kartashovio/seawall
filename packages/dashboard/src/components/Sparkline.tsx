// Risk history — an INTERACTIVE instrument, not a decoration.
//
// TESTNET (enforced) gets the full chart: the 0-100 risk score over the last N
// ticks, OVERLAID with the two live lending params the contract ratchets in
// response (max LTV + borrow cap, both already in 0-100% terms). The whole point
// is to make the cause→effect visible: as the score rises the two knobs descend
// toward their floor — only ever safer. Hover anywhere to read the exact values
// at that minute. Score bands (60 / 95) are etched; the warm-up region (model
// still calibrating, reading not yet trusted) is shaded out and labelled.
//
// MAINNET (read-only observatory) gets a compact score-only trace — it enforces
// nothing, so it HAS no params and we don't invent any.
//
// STATUS, NOT CONTROL: pure SVG + a hover read-out, no handlers that mutate
// anything. Keeps the single `{history}` prop so App + the static-markup tests
// render the clean empty state with history:[].
import { useState } from "react";
import type { AgentTickDTO } from "@seawall/shared";
import { BANDS, CORRIDOR, pct } from "../config";

// ── geometry (viewBox units; the frame is responsive at a fixed aspect ratio so
// an HTML tooltip can be positioned by percentage and line up exactly) ──────────
const W = 760;
const H = 248;
const ML = 34; // left gutter (score axis)
const MR = 16; // right gutter
const MT = 14; // top
const MB = 24; // bottom (time axis)
const PW = W - ML - MR;
const PH = H - MT - MB;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
// Both the score (0-100) and the params (LTV 55-75%, cap 40-100%) live on ONE
// shared 0-100 vertical scale — that shared axis is what makes the inverse move
// (score up ⇄ knobs down) read at a glance.
const vY = (v: number): number => MT + (1 - clamp(v, 0, 100) / 100) * PH;
const vX = (i: number, n: number): number => ML + (n <= 1 ? 0 : (i / (n - 1)) * PW);
const bandColor = (s: number): string => (s < BANDS.lo ? "var(--teal)" : s < BANDS.hi ? "var(--amber)" : "var(--red)");

const LTV_FLOOR = pct(CORRIDOR.maxLtv.floor); // 55
const CAP_FLOOR = pct(CORRIDOR.borrowCap.floor); // 40

const hhmm = (ts: number): string => {
  const d = new Date(ts);
  const p = (x: number): string => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};
const hhmmss = (ts: number): string => {
  const d = new Date(ts);
  const p = (x: number): string => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const polyline = (pts: Array<[number, number]>): string => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(2)}`).join(" ");

// ── the enforced testnet chart ──────────────────────────────────────────────
function TestnetChart({ history }: { history: AgentTickDTO[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const h = history;
  const n = h.length;
  const mode = h[n - 1]?.mode ?? "calm";
  const dead = mode === "dead";

  if (n < 2) {
    return (
      <div className="rc-frame rc-frame--empty">
        <span className="rc-empty">warming up — collecting the first readings…</span>
      </div>
    );
  }

  const score = h.map((t) => t.scoreOverall ?? 0);
  const ltv = h.map((t) => pct(t.applied?.maxLtv ?? CORRIDOR.maxLtv.baseline));
  const cap = h.map((t) => pct(t.applied?.borrowCap ?? CORRIDOR.borrowCap.baseline));

  const scorePts = score.map((s, i): [number, number] => [vX(i, n), vY(s)]);
  const ltvPts = ltv.map((v, i): [number, number] => [vX(i, n), vY(v)]);
  const capPts = cap.map((v, i): [number, number] => [vX(i, n), vY(v)]);
  const area = `${ML},${MT + PH} ${polyline(scorePts)} ${ML + PW},${MT + PH}`;

  const last = score[n - 1] ?? 0;
  const col = bandColor(last);

  // Leading warm-up region (model not yet trusted) → shade + label. A restart
  // resets warmup, so this only appears when the window includes a cold start.
  let warmEnd = -1;
  for (let i = 0; i < n; i++) {
    if (h[i].warmup && h[i].warmup.ready === false) warmEnd = i;
    else break;
  }
  const warmX = warmEnd >= 0 ? vX(warmEnd, n) : 0;

  // ~5 time ticks across the window.
  const ticks = Array.from({ length: Math.min(5, n) }, (_, j) => Math.round((j / (Math.min(5, n) - 1)) * (n - 1)));

  const hi = hover != null && hover >= 0 && hover < n ? hover : null;

  const onMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width; // 0..1 across the frame
    const dataFrac = (frac * W - ML) / PW; // back out the plot area
    setHover(Math.round(clamp(dataFrac, 0, 1) * (n - 1)));
  };

  const tipLeftPct = hi != null ? (vX(hi, n) / W) * 100 : 0;
  const flip = tipLeftPct > 62; // place the tooltip on the left when near the right edge

  return (
    <div className="rc-frame" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Testnet risk score and lending params over time">
        <defs>
          <pattern id="rc-warmhatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="var(--inset)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-lit)" strokeWidth="1" />
          </pattern>
        </defs>

        {/* horizontal gridlines at 20/40/80 (faint) */}
        {[20, 40, 80].map((g) => (
          <line key={g} x1={ML} y1={vY(g)} x2={ML + PW} y2={vY(g)} stroke="var(--line-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {/* score band lines (60 amber / 95 coral) — bound to BANDS */}
        <line x1={ML} y1={vY(BANDS.lo)} x2={ML + PW} y2={vY(BANDS.lo)} stroke="var(--amber-line)" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        <line x1={ML} y1={vY(BANDS.hi)} x2={ML + PW} y2={vY(BANDS.hi)} stroke="var(--coral-line)" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        {/* param floors — the cage the knobs can't drop below */}
        <line x1={ML} y1={vY(LTV_FLOOR)} x2={ML + PW} y2={vY(LTV_FLOOR)} stroke="var(--amber-line)" strokeWidth="1" strokeDasharray="1 4" opacity="0.7" vectorEffect="non-scaling-stroke" />
        <line x1={ML} y1={vY(CAP_FLOOR)} x2={ML + PW} y2={vY(CAP_FLOOR)} stroke="var(--cyan-line)" strokeWidth="1" strokeDasharray="1 4" opacity="0.7" vectorEffect="non-scaling-stroke" />

        {/* y-axis labels (score) */}
        {[0, 60, 95, 100].map((g) => (
          <text key={g} x={ML - 5} y={vY(g)} fontSize="9" fontFamily="var(--font-mono)" fill="var(--muted-deep)" textAnchor="end" dominantBaseline="middle">
            {g}
          </text>
        ))}

        {/* warm-up (calibrating) shade */}
        {warmEnd >= 0 && (
          <>
            <rect x={ML} y={MT} width={Math.max(0, warmX - ML)} height={PH} fill="url(#rc-warmhatch)" opacity="0.85" />
            <text x={(ML + warmX) / 2} y={MT + 11} fontSize="9" fontFamily="var(--font-mono)" fill="var(--muted-deep)" textAnchor="middle">
              calibrating · not trusted
            </text>
          </>
        )}

        {/* param overlays (thin) — drawn under the score so the score reads on top */}
        <polyline points={polyline(capPts)} fill="none" stroke="var(--cyan-dim)" strokeWidth="1.4" strokeDasharray="5 3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity="0.9" />
        <polyline points={polyline(ltvPts)} fill="none" stroke="var(--amber-dim)" strokeWidth="1.4" strokeDasharray="5 3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity="0.9" />

        {/* score area + line (the hero series) */}
        <polygon points={area} fill={col} opacity="0.09" />
        <polyline
          points={polyline(scorePts)}
          fill="none"
          stroke={dead ? "var(--muted)" : col}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={dead ? "4 4" : undefined}
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={vX(n - 1, n)} cy={vY(last)} r="2.6" fill={col} />

        {/* x-axis time ticks */}
        {ticks.map((i) => (
          <text key={i} x={vX(i, n)} y={H - 7} fontSize="9" fontFamily="var(--font-mono)" fill="var(--muted-deep)" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
            {hhmm(h[i].ts)}
          </text>
        ))}

        {/* hover guide + markers */}
        {hi != null && (
          <g>
            <line x1={vX(hi, n)} y1={MT} x2={vX(hi, n)} y2={MT + PH} stroke="var(--ink-dim)" strokeWidth="1" strokeDasharray="2 3" opacity="0.5" vectorEffect="non-scaling-stroke" />
            <circle cx={vX(hi, n)} cy={vY(score[hi])} r="3.2" fill={bandColor(score[hi])} stroke="var(--ground-2)" strokeWidth="1.2" />
            <circle cx={vX(hi, n)} cy={vY(ltv[hi])} r="2.6" fill="var(--amber-dim)" stroke="var(--ground-2)" strokeWidth="1" />
            <circle cx={vX(hi, n)} cy={vY(cap[hi])} r="2.6" fill="var(--cyan-dim)" stroke="var(--ground-2)" strokeWidth="1" />
          </g>
        )}
      </svg>

      {/* HTML tooltip (positioned by % of the fixed-aspect frame → exact alignment) */}
      {hi != null && (
        <div className={`rc-tip ${flip ? "rc-tip--left" : ""}`} style={{ left: `${tipLeftPct}%` }}>
          <div className="rc-tip-time">{hhmmss(h[hi].ts)}</div>
          <div className="rc-tip-row">
            <span className="rc-sw" style={{ background: bandColor(score[hi]) }} />
            risk score<b>{score[hi].toFixed(0)}</b>
          </div>
          <div className="rc-tip-row">
            <span className="rc-sw" style={{ background: "var(--amber-dim)" }} />
            max LTV<b>{ltv[hi].toFixed(0)}%</b>
          </div>
          <div className="rc-tip-row">
            <span className="rc-sw" style={{ background: "var(--cyan-dim)" }} />
            borrow cap<b>{cap[hi].toFixed(0)}%</b>
          </div>
        </div>
      )}
    </div>
  );
}

// ── compact mainnet score-only trace (no params — it enforces nothing) ───────
function MainnetMini({ history }: { history: AgentTickDTO[] }) {
  const series = history.filter((t) => t.observatory?.ok).map((t) => t.observatory!.score);
  const n = series.length;
  const w = 320;
  const ht = 60;
  const px = 6;
  const yOf = (s: number): number => 6 + (1 - clamp(s, 0, 100) / 100) * (ht - 12);
  const xOf = (i: number): number => px + (n <= 1 ? 0 : (i / (n - 1)) * (w - 2 * px));
  const line = series.map((s, i) => `${xOf(i).toFixed(1)},${yOf(s).toFixed(2)}`).join(" ");
  const last = series[n - 1] ?? 0;
  const col = bandColor(last);

  return (
    <div className="rc-mainnet">
      <div className="rc-mainnet-head">
        <span className="rc-mainnet-lbl">MAINNET</span>
        <span className="tag tag-readonly">READ-ONLY · OBSERVING</span>
      </div>
      <svg viewBox={`0 0 ${w} ${ht}`} preserveAspectRatio="none" role="img" aria-label="Mainnet observatory risk score over time">
        <line x1="0" y1={yOf(BANDS.lo)} x2={w} y2={yOf(BANDS.lo)} stroke="var(--amber-line)" strokeWidth="1" strokeDasharray="3 5" opacity="0.5" vectorEffect="non-scaling-stroke" />
        {n >= 2 ? (
          <polyline points={line} fill="none" stroke={col} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ) : (
          <text x={w / 2} y={ht / 2} fontSize="10" fontFamily="var(--font-mono)" fill="var(--muted)" textAnchor="middle" dominantBaseline="middle">
            warming up…
          </text>
        )}
        {n >= 2 && <circle cx={xOf(n - 1)} cy={yOf(last)} r="2.4" fill={col} />}
      </svg>
      <div className="rc-mainnet-note">live mainnet market · score only — the observatory enforces nothing, so it has no params to show</div>
    </div>
  );
}

export function Sparkline({ history }: { history: AgentTickDTO[] }) {
  const h = history.slice(-120);

  return (
    <section className="card riskchart">
      <div className="rc-head">
        <span className="rc-title">Risk history</span>
        <div className="rc-legend">
          <span className="rc-leg">
            <span className="rc-leg-line rc-leg-score" /> risk score
          </span>
          <span className="rc-leg">
            <span className="rc-leg-line rc-leg-ltv" /> max LTV
          </span>
          <span className="rc-leg">
            <span className="rc-leg-line rc-leg-cap" /> borrow cap
          </span>
        </div>
      </div>
      <p className="rc-sub">
        Enforced testnet · last {h.length} ticks. As the score climbs, the contract ratchets both lending knobs toward their floor — only ever safer, never looser. Hover to read any minute.
      </p>
      <TestnetChart history={h} />
      <MainnetMini history={h} />
    </section>
  );
}
