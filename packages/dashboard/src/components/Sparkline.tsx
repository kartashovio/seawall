// Risk history — TWO interactive instruments built from the SAME component, so
// both seas read the same way:
//   • TESTNET (enforced): the 0-100 risk score OVERLAID with the two live lending
//     params the contract ratchets (max LTV + borrow cap) — score up ⇄ knobs down.
//   • MAINNET (read-only observatory): score only (it enforces nothing → no params)
//     — but now fully interactive too, so you can read its history on hover.
// Both: a labelled header, hover tooltip (time + values), score y-axis (0/60/95/
// 100) with the 60/95 bands ANNOTATED (caution onset / fully tightened), a time
// x-axis, and a shaded "calibrating" region while the model is still warming up.
// History is seeded from GET /history (up to ~12h) so it isn't limited to the
// minutes since the page opened.
//
// STATUS, NOT CONTROL: pure SVG + a hover read-out, no handlers that mutate
// anything. Keeps the single `{history}` prop so the static-markup tests render
// the clean empty state with history:[].
import { useState } from "react";
import type { AgentTickDTO } from "@seawall/shared";
import { BANDS, CORRIDOR, pct } from "../config";

// ── geometry (viewBox units; the frame is responsive at a fixed aspect ratio so
// an HTML tooltip can be positioned by percentage and line up exactly) ──────────
const W = 760;
const H = 244;
const ML = 34; // left gutter (score axis)
const MR = 64; // right gutter (band annotations live here)
const MT = 14; // top
const MB = 24; // bottom (time axis)
const PW = W - ML - MR;
const PH = H - MT - MB;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
// Score (0-100) and params (LTV 55-75%, cap 40-100%) share ONE 0-100 vertical
// scale — that shared axis is what makes the inverse move (score up ⇄ knobs down)
// read at a glance.
const vY = (v: number): number => MT + (1 - clamp(v, 0, 100) / 100) * PH;
const vX = (i: number, n: number): number => ML + (n <= 1 ? 0 : (i / (n - 1)) * PW);
const bandColor = (s: number): string => (s < BANDS.lo ? "var(--teal)" : s < BANDS.hi ? "var(--amber)" : "var(--red)");

const LTV_FLOOR = pct(CORRIDOR.maxLtv.floor); // 55
const CAP_FLOOR = pct(CORRIDOR.borrowCap.floor); // 40

const pad2 = (x: number): string => String(x).padStart(2, "0");
const hhmm = (ts: number): string => {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const stamp = (ts: number): string => {
  const d = new Date(ts);
  const mon = d.toLocaleString("en-US", { month: "short" });
  return `${mon} ${d.getDate()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};
const polyline = (pts: Array<[number, number]>): string => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(2)}`).join(" ");

type Kind = "testnet" | "mainnet";

function HistoryChart({ history, kind }: { history: AgentTickDTO[]; kind: Kind }) {
  const [hover, setHover] = useState<number | null>(null);
  const isTest = kind === "testnet";

  // testnet uses every tick; mainnet only the ticks with a usable observatory read.
  const ticks = isTest ? history : history.filter((t) => t.observatory?.ok);
  const n = ticks.length;
  const mode = history[history.length - 1]?.mode ?? "calm";
  const dead = isTest && mode === "dead";

  const label = isTest ? "TESTNET" : "MAINNET";
  const badge = isTest ? "ENFORCED · IN USE" : "READ-ONLY · OBSERVING";
  const badgeCls = isTest ? "tag-agent" : "tag-readonly";

  const head = (
    <>
      <div className="rc-chart-head">
        <span className="rc-chart-lbl">{label}</span>
        <span className={"tag " + badgeCls}>{badge}</span>
      </div>
      {!isTest && (
        <p className="rc-chart-note">
          In the current phase the project is deployed on testnet; the mainnet AI risk score is reference-only.
        </p>
      )}
    </>
  );

  if (n < 2) {
    return (
      <div className="rc-chart">
        {head}
        <div className="rc-frame rc-frame--empty">
          <span className="rc-empty">warming up — collecting the first readings…</span>
        </div>
      </div>
    );
  }

  const score = ticks.map((t) => (isTest ? t.scoreOverall ?? 0 : t.observatory!.score));
  const ltv = isTest ? ticks.map((t) => pct(t.applied?.maxLtv ?? CORRIDOR.maxLtv.baseline)) : [];
  const cap = isTest ? ticks.map((t) => pct(t.applied?.borrowCap ?? CORRIDOR.borrowCap.baseline)) : [];

  const scorePts = score.map((s, i): [number, number] => [vX(i, n), vY(s)]);
  const area = `${ML},${MT + PH} ${polyline(scorePts)} ${ML + PW},${MT + PH}`;
  const last = score[n - 1] ?? 0;
  const col = bandColor(last);

  // Leading "calibrating" region (model not yet warm → reading not trusted).
  let warmEnd = -1;
  for (let i = 0; i < n; i++) {
    if (ticks[i].warmup && ticks[i].warmup.ready === false) warmEnd = i;
    else break;
  }
  const warmX = warmEnd >= 1 ? vX(warmEnd, n) : ML;

  // ~6 time ticks across the (up to 12h) window.
  const nt = Math.min(6, n);
  const xticks = Array.from({ length: nt }, (_, j) => Math.round((j / (nt - 1)) * (n - 1)));

  const hi = hover != null && hover >= 0 && hover < n ? hover : null;

  const onMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    const dataFrac = (frac * W - ML) / PW;
    setHover(Math.round(clamp(dataFrac, 0, 1) * (n - 1)));
  };

  const tipLeftPct = hi != null ? (vX(hi, n) / W) * 100 : 0;
  const flip = tipLeftPct > 58;

  return (
    <div className="rc-chart">
      {head}
      <div className="rc-frame" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} risk score over time`}>
          <defs>
            <pattern id={`rc-warm-${kind}`} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="var(--inset)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-lit)" strokeWidth="1" />
            </pattern>
          </defs>

          {/* faint gridlines */}
          {[20, 40, 80].map((g) => (
            <line key={g} x1={ML} y1={vY(g)} x2={ML + PW} y2={vY(g)} stroke="var(--line-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {/* score band lines (60 caution / 95 fully-tightened) — bound to BANDS */}
          <line x1={ML} y1={vY(BANDS.lo)} x2={ML + PW} y2={vY(BANDS.lo)} stroke="var(--amber-line)" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          <line x1={ML} y1={vY(BANDS.hi)} x2={ML + PW} y2={vY(BANDS.hi)} stroke="var(--coral-line)" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          {/* band annotations (right gutter) — what the static thresholds mean */}
          <text x={ML + PW + 5} y={vY(BANDS.lo)} fontSize="8.5" fontFamily="var(--font-mono)" fill="var(--amber-dim)" dominantBaseline="middle">
            {BANDS.lo} caution
          </text>
          <text x={ML + PW + 5} y={vY(BANDS.hi)} fontSize="8.5" fontFamily="var(--font-mono)" fill="var(--coral-dim)" dominantBaseline="middle">
            {BANDS.hi} max
          </text>

          {/* param floors (testnet only) — the cage the knobs can't drop below */}
          {isTest && (
            <>
              <line x1={ML} y1={vY(LTV_FLOOR)} x2={ML + PW} y2={vY(LTV_FLOOR)} stroke="var(--amber-line)" strokeWidth="1" strokeDasharray="1 4" opacity="0.7" vectorEffect="non-scaling-stroke" />
              <line x1={ML} y1={vY(CAP_FLOOR)} x2={ML + PW} y2={vY(CAP_FLOOR)} stroke="var(--cyan-line)" strokeWidth="1" strokeDasharray="1 4" opacity="0.7" vectorEffect="non-scaling-stroke" />
            </>
          )}

          {/* y-axis labels (score 0-100) */}
          {[0, BANDS.lo, BANDS.hi, 100].map((g) => (
            <text key={g} x={ML - 5} y={vY(g)} fontSize="9" fontFamily="var(--font-mono)" fill="var(--muted-deep)" textAnchor="end" dominantBaseline="middle">
              {g}
            </text>
          ))}

          {/* calibrating shade */}
          {warmEnd >= 1 && (
            <>
              <rect x={ML} y={MT} width={Math.max(0, warmX - ML)} height={PH} fill={`url(#rc-warm-${kind})`} opacity="0.85" />
              <text x={(ML + warmX) / 2} y={MT + 11} fontSize="9" fontFamily="var(--font-mono)" fill="var(--muted-deep)" textAnchor="middle">
                calibrating
              </text>
            </>
          )}

          {/* param overlays (testnet only) — drawn under the score */}
          {isTest && (
            <>
              <polyline points={polyline(cap.map((v, i): [number, number] => [vX(i, n), vY(v)]))} fill="none" stroke="var(--cyan-dim)" strokeWidth="1.4" strokeDasharray="5 3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity="0.9" />
              <polyline points={polyline(ltv.map((v, i): [number, number] => [vX(i, n), vY(v)]))} fill="none" stroke="var(--amber-dim)" strokeWidth="1.4" strokeDasharray="5 3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity="0.9" />
            </>
          )}

          {/* score area + line (hero series) */}
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
          {xticks.map((i) => (
            <text key={i} x={vX(i, n)} y={H - 7} fontSize="9" fontFamily="var(--font-mono)" fill="var(--muted-deep)" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
              {hhmm(ticks[i].ts)}
            </text>
          ))}

          {/* hover guide + markers */}
          {hi != null && (
            <g>
              <line x1={vX(hi, n)} y1={MT} x2={vX(hi, n)} y2={MT + PH} stroke="var(--ink-dim)" strokeWidth="1" strokeDasharray="2 3" opacity="0.5" vectorEffect="non-scaling-stroke" />
              <circle cx={vX(hi, n)} cy={vY(score[hi])} r="3.2" fill={bandColor(score[hi])} stroke="var(--ground-2)" strokeWidth="1.2" />
              {isTest && <circle cx={vX(hi, n)} cy={vY(ltv[hi])} r="2.6" fill="var(--amber-dim)" stroke="var(--ground-2)" strokeWidth="1" />}
              {isTest && <circle cx={vX(hi, n)} cy={vY(cap[hi])} r="2.6" fill="var(--cyan-dim)" stroke="var(--ground-2)" strokeWidth="1" />}
            </g>
          )}
        </svg>

        {hi != null && (
          <div className={`rc-tip ${flip ? "rc-tip--left" : ""}`} style={{ left: `${tipLeftPct}%` }}>
            <div className="rc-tip-time">{stamp(ticks[hi].ts)}</div>
            <div className="rc-tip-row">
              <span className="rc-sw" style={{ background: bandColor(score[hi]) }} />
              risk score<b>{score[hi].toFixed(0)}</b>
            </div>
            {isTest && (
              <>
                <div className="rc-tip-row">
                  <span className="rc-sw" style={{ background: "var(--amber-dim)" }} />
                  max LTV<b>{ltv[hi].toFixed(0)}%</b>
                </div>
                <div className="rc-tip-row">
                  <span className="rc-sw" style={{ background: "var(--cyan-dim)" }} />
                  borrow cap<b>{cap[hi].toFixed(0)}%</b>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Sparkline({ history }: { history: AgentTickDTO[] }) {
  const h = history.slice(-760);
  const hours = h.length >= 2 ? Math.max(0, (h[h.length - 1].ts - h[0].ts) / 3_600_000) : 0;
  const span = hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(hours * 60)} min`;

  return (
    <section className="card riskchart">
      <div className="rc-head">
        <span className="rc-title">Risk history</span>
        <div className="rc-legend">
          <span className="rc-leg">
            <span className="rc-leg-line rc-leg-score" /> risk score (0–100)
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
        Showing the last <b>{span}</b> (up to 12h). Limits tighten as the score climbs <b>60 → 95</b> — and the two params react
        differently.
      </p>
      <HistoryChart history={h} kind="testnet" />
      <HistoryChart history={h} kind="mainnet" />
    </section>
  );
}
