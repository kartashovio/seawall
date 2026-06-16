// One stress-test chart: two x-aligned panels over a shared time axis.
//   • TOP — the guardian's response on a 0-100 scale: the AI risk score (hero,
//     band-colored), and the two lending knobs it ratchets (max LTV, borrow cap),
//     with the 60 caution / 95 floor reference lines.
//   • BOTTOM — the market: the asset price (left axis) and the contract-measured
//     divergence (right axis) with the 1% caution / 5% FREEZE lines.
// REAL news catalysts are drawn as numbered flags (mapped to a list in the case
// block); the model's first flag (validated detection) and the −5% drop are marked;
// freeze ranges shade both panels. Pure SVG + an HTML hover read-out, no library.
import { useState } from "react";

export interface BtPoint {
  ts: number;
  price: number | null;
  divBps: number | null;
  score: number;
  maxLtv: number;
  borrowCap: number;
  frozen: boolean;
}
export interface BtNews {
  ts: number;
  label: string;
  kind: "trigger" | "escalation" | "reversal";
  confidence: "high" | "medium" | "low";
}
export interface BtCase {
  key: string;
  freezeBps: number;
  cautionBps: number;
  firstAlertTs: number | null;
  visibleDropTs: number | null;
  enforceTs?: number | null;
  freezeTs?: number | null;
  leadMinutes: number | null;
  priceLabel: string;
  points: BtPoint[];
  newsEvents?: BtNews[];
  freezeRanges?: Array<[number, number]>;
}

const W = 720;
const ML = 42;
const MR = 48;
const PW = W - ML - MR;
const AT = 34; // panel A top (room for the news-flag rail)
const AH = 146;
const BT = 210;
const BH = 104;
const H = BT + BH + 24;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const poly = (pts: Array<[number, number]>) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(2)}`).join(" ");
const pad2 = (x: number) => String(x).padStart(2, "0");
const hhmm = (ts: number) => {
  const d = new Date(ts);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};
const dayhhmm = (ts: number) => {
  const d = new Date(ts);
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${mon} ${d.getUTCDate()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`;
};
const NEWS_COLOR: Record<BtNews["kind"], string> = {
  trigger: "var(--coral-dim)",
  escalation: "var(--amber-dim)",
  reversal: "var(--cyan-dim)",
};

export function BacktestChart({ c }: { c: BtCase }) {
  const [hi, setHi] = useState<number | null>(null);
  const P = c.points;
  const n = P.length;
  const t0 = P[0]?.ts ?? 0;
  const t1 = P[n - 1]?.ts ?? 1;
  const span = Math.max(1, t1 - t0);

  const x = (ts: number) => ML + ((ts - t0) / span) * PW;
  const yA = (v: number) => AT + (1 - clamp(v, 0, 100) / 100) * AH;
  const prices = P.map((p) => p.price).filter((v): v is number => v != null);
  const pMin = prices.length ? Math.min(...prices) : 0;
  const pMax = prices.length ? Math.max(...prices) : 1;
  const pPad = (pMax - pMin) * 0.06 || pMax * 0.02 || 1;
  const yP = (v: number) => BT + (1 - clamp((v - (pMin - pPad)) / (pMax + pPad - (pMin - pPad)), 0, 1)) * BH;
  const maxDiv = Math.max(c.freezeBps * 1.2, ...P.map((p) => p.divBps ?? 0));
  const yD = (v: number) => BT + (1 - clamp(v / maxDiv, 0, 1)) * BH;

  const freezes = c.freezeRanges ?? [];
  const news = (c.newsEvents ?? []).filter((nv) => nv.ts >= t0 && nv.ts <= t1);

  const scorePts = P.map((p): [number, number] => [x(p.ts), yA(p.score)]);
  const ltvPts = P.map((p): [number, number] => [x(p.ts), yA(p.maxLtv)]);
  const capPts = P.map((p): [number, number] => [x(p.ts), yA(p.borrowCap)]);
  const pricePts = P.filter((p) => p.price != null).map((p): [number, number] => [x(p.ts), yP(p.price as number)]);
  const divPts = P.filter((p) => p.divBps != null).map((p): [number, number] => [x(p.ts), yD(p.divBps as number)]);
  const scoreArea = `${ML},${AT + AH} ${poly(scorePts)} ${ML + PW},${AT + AH}`;
  const divArea = divPts.length ? `${divPts[0][0]},${BT + BH} ${poly(divPts)} ${divPts[divPts.length - 1][0]},${BT + BH}` : "";

  const alertX = c.firstAlertTs != null && c.firstAlertTs >= t0 && c.firstAlertTs <= t1 ? x(c.firstAlertTs) : null;
  const dropX = c.visibleDropTs != null && c.visibleDropTs >= t0 && c.visibleDropTs <= t1 ? x(c.visibleDropTs) : null;

  const nt = Math.min(6, n);
  const xticks = Array.from({ length: nt }, (_, j) => Math.round((j / Math.max(1, nt - 1)) * (n - 1)));

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    setHi(Math.round(clamp((frac * W - ML) / PW, 0, 1) * (n - 1)));
  };
  const cur = hi != null && hi >= 0 && hi < n ? P[hi] : null;
  const tipLeft = cur ? (x(cur.ts) / W) * 100 : 0;
  const flip = tipLeft > 60;
  const gid = `bt-score-${c.key}`;

  return (
    <div className="bt-frame" onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${c.key} stress test`}>
        <defs>
          <linearGradient id={gid} x1="0" y1={yA(100)} x2="0" y2={yA(0)} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--coral)" />
            <stop offset="5%" stopColor="var(--coral)" />
            <stop offset="40%" stopColor="var(--amber)" />
            <stop offset="100%" stopColor="var(--cyan)" />
          </linearGradient>
        </defs>

        {/* freeze shading across both panels */}
        {freezes.map(([s, e], i) => (
          <rect key={i} x={x(s)} y={AT} width={Math.max(1.5, x(e) - x(s))} height={BT + BH - AT} fill="var(--coral-wash)" />
        ))}

        {/* real-news flags: a vertical line through both panels + a numbered chip */}
        {news.map((nv, i) => {
          const nx = x(nv.ts);
          return (
            <g key={i}>
              <line x1={nx} y1={20} x2={nx} y2={BT + BH} stroke={NEWS_COLOR[nv.kind]} strokeWidth="1" strokeDasharray="1 3" opacity="0.7" vectorEffect="non-scaling-stroke" />
              <circle cx={nx} cy={12} r="7" fill={NEWS_COLOR[nv.kind]} />
              <text x={nx} y={12} fontSize="8.5" fontWeight="700" fontFamily="var(--font-mono)" fill="#fff" textAnchor="middle" dominantBaseline="central">
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* ── panel A: guardian response (0-100) ── */}
        {[20, 40, 80].map((g) => (
          <line key={g} x1={ML} y1={yA(g)} x2={ML + PW} y2={yA(g)} stroke="var(--line-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={ML} y1={yA(60)} x2={ML + PW} y2={yA(60)} stroke="var(--amber-line)" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        <line x1={ML} y1={yA(95)} x2={ML + PW} y2={yA(95)} stroke="var(--coral-line)" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        {[0, 60, 95, 100].map((g) => (
          <text key={g} x={ML - 5} y={yA(g)} fontSize="8.5" fontFamily="var(--font-mono)" fill="var(--muted-deep)" textAnchor="end" dominantBaseline="middle">
            {g}
          </text>
        ))}
        <polyline points={poly(capPts)} fill="none" stroke="var(--cyan-dim)" strokeWidth="1.4" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" opacity="0.9" />
        <polyline points={poly(ltvPts)} fill="none" stroke="var(--amber-dim)" strokeWidth="1.4" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" opacity="0.9" />
        <polygon points={scoreArea} fill="var(--coral)" opacity="0.06" />
        <polyline points={poly(scorePts)} fill="none" stroke={`url(#${gid})`} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <text x={ML} y={AT - 7} fontSize="9" fontFamily="var(--font-mono)" fill="var(--muted-deep)">
          guardian · risk score 0–100, max LTV, borrow cap (%)
        </text>

        {/* ── panel B: market + divergence ── */}
        <line x1={ML} y1={yD(c.cautionBps)} x2={ML + PW} y2={yD(c.cautionBps)} stroke="var(--amber-line)" strokeWidth="1" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        <line x1={ML} y1={yD(c.freezeBps)} x2={ML + PW} y2={yD(c.freezeBps)} stroke="var(--coral-line)" strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <text x={ML + PW + 4} y={yD(c.freezeBps)} fontSize="8" fontFamily="var(--font-mono)" fill="var(--coral-dim)" dominantBaseline="middle">
          {c.freezeBps} freeze
        </text>
        <text x={ML + PW + 4} y={yD(c.cautionBps)} fontSize="8" fontFamily="var(--font-mono)" fill="var(--amber-dim)" dominantBaseline="middle">
          {c.cautionBps}
        </text>
        {divArea && <polygon points={divArea} fill="var(--coral)" opacity="0.07" />}
        <polyline points={poly(divPts)} fill="none" stroke="var(--coral)" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <polyline points={poly(pricePts)} fill="none" stroke="var(--ink-dim)" strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {[pMax, (pMax + pMin) / 2, pMin].map((g, i) => (
          <text key={i} x={ML - 5} y={yP(g)} fontSize="8" fontFamily="var(--font-mono)" fill="var(--ink-dim)" textAnchor="end" dominantBaseline="middle">
            {g >= 100 ? g.toFixed(0) : g.toFixed(g < 2 ? 3 : 2)}
          </text>
        ))}
        <text x={ML} y={BT - 8} fontSize="9" fontFamily="var(--font-mono)" fill="var(--muted-deep)">
          market · {c.priceLabel} (dark) · divergence bps (red, right)
        </text>

        {/* model's first flag (validated detection) + the −5% drop */}
        {alertX != null && (
          <>
            <line x1={alertX} y1={AT} x2={alertX} y2={BT + BH} stroke="var(--amber)" strokeWidth="1" strokeDasharray="2 3" opacity="0.85" vectorEffect="non-scaling-stroke" />
            <text x={alertX} y={AT - 0.5} fontSize="8" fontFamily="var(--font-mono)" fill="var(--amber-dim)" textAnchor="middle">
              model flags
            </text>
          </>
        )}
        {dropX != null && (
          <>
            <line x1={dropX} y1={AT} x2={dropX} y2={BT + BH} stroke="var(--coral-dim)" strokeWidth="1" strokeDasharray="2 3" opacity="0.75" vectorEffect="non-scaling-stroke" />
            <text x={dropX} y={BT + BH + 9} fontSize="8" fontFamily="var(--font-mono)" fill="var(--coral-dim)" textAnchor="middle">
              −5% drop
            </text>
          </>
        )}

        {/* x-axis time (UTC) */}
        {xticks.map((i) => (
          <text key={i} x={x(P[i].ts)} y={H - 6} fontSize="8.5" fontFamily="var(--font-mono)" fill="var(--muted-deep)" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
            {hhmm(P[i].ts)}
          </text>
        ))}

        {cur && (
          <g>
            <line x1={x(cur.ts)} y1={AT} x2={x(cur.ts)} y2={BT + BH} stroke="var(--ink-dim)" strokeWidth="1" strokeDasharray="2 3" opacity="0.45" vectorEffect="non-scaling-stroke" />
            <circle cx={x(cur.ts)} cy={yA(cur.score)} r="3" fill="var(--coral)" stroke="var(--ground-2)" strokeWidth="1.2" />
            {cur.price != null && <circle cx={x(cur.ts)} cy={yP(cur.price)} r="2.6" fill="var(--ink-dim)" stroke="var(--ground-2)" strokeWidth="1" />}
            {cur.divBps != null && <circle cx={x(cur.ts)} cy={yD(cur.divBps)} r="2.6" fill="var(--coral)" stroke="var(--ground-2)" strokeWidth="1" />}
          </g>
        )}
      </svg>

      {cur && (
        <div className={`bt-tip ${flip ? "bt-tip--left" : ""}`} style={{ left: `${tipLeft}%` }}>
          <div className="bt-tip-time">{dayhhmm(cur.ts)}</div>
          <div className="bt-tip-row"><span className="bt-sw" style={{ background: "var(--coral)" }} />score<b>{cur.score.toFixed(0)}</b></div>
          <div className="bt-tip-row"><span className="bt-sw" style={{ background: "var(--amber-dim)" }} />max LTV<b>{cur.maxLtv.toFixed(0)}%</b></div>
          <div className="bt-tip-row"><span className="bt-sw" style={{ background: "var(--cyan-dim)" }} />borrow cap<b>{cur.borrowCap.toFixed(0)}%</b></div>
          <div className="bt-tip-row"><span className="bt-sw" style={{ background: "var(--ink-dim)" }} />price<b>{cur.price != null ? cur.price.toFixed(cur.price < 2 ? 4 : 2) : "—"}</b></div>
          <div className="bt-tip-row"><span className="bt-sw" style={{ background: "var(--coral)" }} />divergence<b>{cur.divBps != null ? `${cur.divBps.toFixed(0)} bps` : "—"}</b>{cur.frozen && <span className="bt-frz">FROZEN</span>}</div>
        </div>
      )}
    </div>
  );
}
