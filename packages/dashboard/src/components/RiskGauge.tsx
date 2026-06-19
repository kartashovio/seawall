// Must-have #2: the visible AI risk score, as an open-bottom radial RING (no
// needle, no tick rail). The sweep length is the value; the hue is the band. The
// colored bands BIND to BANDS (= on-chain SCORE_LO/HI/ALERT) via --teal/--amber/
// --red, so the dial reads the same thresholds the contract clamps to. The score
// is ADVISORY: 99 is the measurement marker, not the gate — the caption says so.
//
// PURE FRAGMENT: returns only the dial (svg + caption) — NO <section>/<h2>, no
// handlers, no cursor:pointer. <ScoreCard> renders it twice (testnet + mainnet)
// as visual twins; the non-interactivity test must pass.
import { BANDS } from "../config";

// --- ring geometry: a 270° open-bottom arc (gap centered at the bottom) -------
const CX = 100;
const CY = 100;
const R = 82;
const SW = 12;
const C = 2 * Math.PI * R; // full circumference
const ARC = C * 0.75; // 270° visible

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const lenOf = (s: number): number => (clamp(s, 0, 100) / 100) * ARC;

const bandColor = (s: number): string => (s < BANDS.lo ? "var(--teal)" : s < BANDS.hi ? "var(--amber)" : "var(--red)");

// dash props for one arc segment from→to (the <circle> is wrapped in rotate(135)).
const seg = (from: number, to: number): { strokeDasharray: string; strokeDashoffset: string } => ({
  strokeDasharray: `${(lenOf(to) - lenOf(from)).toFixed(2)} ${C.toFixed(2)}`,
  strokeDashoffset: (-lenOf(from)).toFixed(2),
});

// absolute polar point for a value `at` (θ = 135° + at/100·270°, clockwise, y-down).
const markPt = (at: number, rad: number): { x: number; y: number } => {
  const th = ((135 + (clamp(at, 0, 100) / 100) * 270) * Math.PI) / 180;
  return { x: CX + rad * Math.cos(th), y: CY + rad * Math.sin(th) };
};

export function RiskGauge({ score }: { score: number }) {
  const v = clamp(score, 0, 100);
  const color = bandColor(v);
  const markers = [BANDS.lo, BANDS.hi, BANDS.alert]; // 55 / 80 / 99

  return (
    <>
      {/* viewBox padded to -12..212 (not 0..200): the rim labels sit at radius 102,
          so "80" lands at x≈201 and "55" at y≈1 — both would clip against a 0..200
          box (and .scorecard's overflow:hidden). The padding keeps the dial centered. */}
      <svg viewBox="-12 -12 224 224" role="img" aria-label={`risk score ${Math.round(v)} of 100`}>
        <g transform="rotate(135 100 100)">
          {/* track */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--g-track)" strokeWidth={SW} strokeLinecap="round" {...seg(0, 100)} />
          {/* faint band tints so the 55/80 zones read even at a low score */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--teal)" strokeWidth={SW} opacity={0.16} {...seg(0, BANDS.lo)} />
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--amber)" strokeWidth={SW} opacity={0.16} {...seg(BANDS.lo, BANDS.hi)} />
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--red)" strokeWidth={SW} opacity={0.16} {...seg(BANDS.hi, 100)} />
          {/* the live value arc */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth={SW}
            strokeLinecap="round"
            {...seg(0, v)}
            className="gauge-arc"
          />
        </g>
        {/* threshold markers + labels (outside the rotated group) */}
        {markers.map((m) => {
          const a = markPt(m, R + SW / 2 + 1);
          const b = markPt(m, R + SW / 2 + 5);
          const l = markPt(m, R + SW / 2 + 14);
          return (
            <g key={m}>
              <line x1={a.x.toFixed(1)} y1={a.y.toFixed(1)} x2={b.x.toFixed(1)} y2={b.y.toFixed(1)} stroke="var(--muted-deep)" strokeWidth={1.2} />
              {/* 55 + 80 numbered; 99 keeps only its tick (caption names it) to avoid crowding */}
              {m !== BANDS.alert && (
                <text x={l.x.toFixed(1)} y={l.y.toFixed(1)} fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-dim)" textAnchor="middle" dominantBaseline="middle">
                  {m}
                </text>
              )}
            </g>
          );
        })}
        {/* centered readout */}
        <text x={CX} y={CY - 2} className="gauge-num" fill="var(--ink)" textAnchor="middle" dominantBaseline="middle">
          {Math.round(v)}
        </text>
        <text x={CX} y={CY + 24} fontSize="11" fontFamily="var(--font-mono)" fill="var(--muted)" textAnchor="middle" dominantBaseline="middle">
          / 100
        </text>
      </svg>
      <div className="gauge-cap">AI risk score · advisory, not the gate — see what drives it below</div>
    </>
  );
}
