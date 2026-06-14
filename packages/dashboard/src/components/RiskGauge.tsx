// Must-have #2: the visible AI risk score. A semicircular calibrated-anomaly
// gauge, restyled as a tide reading. The colored bands bind to BANDS (= the
// on-chain SCORE_LO/HI), so the dial reads the same thresholds the contract
// clamps to. The score is ADVISORY: 99 is the measurement marker, not the gate
// (FREEZE is contract-only) — the caption says so out loud.
//
// PURE DIAL: this returns ONLY the dial fragment (svg + value + caption) — NO
// outer <section>/<h2>. The card chrome + env-named title come from <ScoreCard>,
// which renders this twice (testnet + mainnet) as visual twins. The geometry,
// BANDS coloring, alert marker, and "99 = marker not gate" caption are unchanged;
// only the cosmetics (recessed track, glowing needle, engraved Fraunces value,
// the small 99 label) are new.
import { BANDS } from "../config";

// --- arc geometry ---------------------------------------------------------
// The .gauge svg viewBox is 220x130. Draw a 180° dial: score 0 → 180° (far left),
// score 100 → 0° (far right). SVG y grows downward, so subtract the sine term.
const CX = 110;
const CY = 116;
const R = 92;
const STROKE = 16;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

// score (0..100) → angle in degrees, measured CCW from the +x axis.
const scoreToAngle = (s: number): number => 180 - (clamp(s, 0, 100) / 100) * 180;

// polar (angle in degrees) → cartesian on the gauge radius.
const polar = (angleDeg: number, radius: number): { x: number; y: number } => {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(a), y: CY - radius * Math.sin(a) };
};

// SVG arc path between two SCORES along the dial radius (always sweeping the
// upper semicircle from the higher-angle start to the lower-angle end).
const arcPath = (fromScore: number, toScore: number, radius: number): string => {
  const start = polar(scoreToAngle(fromScore), radius);
  const end = polar(scoreToAngle(toScore), radius);
  const largeArc = 0; // each band is < 180°
  const sweep = 1; // clockwise in screen space (left → right)
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
};

const bandColor = (s: number): string => {
  if (s < BANDS.lo) return "var(--teal)";
  if (s < BANDS.hi) return "var(--amber)";
  return "var(--red)";
};

export function RiskGauge({ score }: { score: number }) {
  const v = clamp(score, 0, 100);
  const color = bandColor(v);
  // a short value pointer that sits ON the arc (no long needle crossing the
  // center readout) — spans from just inside the band to just past its outer edge.
  const tickInner = polar(scoreToAngle(v), R - STROKE - 2);
  const tickOuter = polar(scoreToAngle(v), R + 5);
  const alertTick = polar(scoreToAngle(BANDS.alert), R);
  const alertTickInner = polar(scoreToAngle(BANDS.alert), R - STROKE - 3);
  const alertLabel = polar(scoreToAngle(BANDS.alert), R - STROKE - 14);

  return (
    <>
      <svg viewBox="0 0 220 130" role="img" aria-label={`risk score ${Math.round(v)} of 100`}>
        <defs>
          {/* soft plate behind the readout so the needle disappears under the
              number instead of impaling it (fades to transparent at the rim). */}
          <radialGradient id="gauge-bowl" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0e1828" stopOpacity="0.96" />
            <stop offset="55%" stopColor="#0e1828" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0e1828" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* recessed track so the colored bands sit proud */}
        <path d={arcPath(0, 100, R)} fill="none" stroke="var(--inset)" strokeWidth={STROKE} strokeLinecap="round" />
        {/* colored bands */}
        <path d={arcPath(0, BANDS.lo, R)} fill="none" stroke="var(--teal)" strokeWidth={STROKE} strokeLinecap="round" />
        <path d={arcPath(BANDS.lo, BANDS.hi, R)} fill="none" stroke="var(--amber)" strokeWidth={STROKE} />
        <path d={arcPath(BANDS.hi, 100, R)} fill="none" stroke="var(--red)" strokeWidth={STROKE} strokeLinecap="round" />
        {/* alert marker (99) — measurement reference, not the gate */}
        <line
          x1={alertTick.x}
          y1={alertTick.y}
          x2={alertTickInner.x}
          y2={alertTickInner.y}
          stroke="var(--ink)"
          strokeWidth={1.5}
          opacity={0.85}
        />
        <text
          x={alertLabel.x}
          y={alertLabel.y}
          fontSize="9"
          fontFamily="var(--font-mono)"
          fill="var(--muted)"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {BANDS.alert}
        </text>
        {/* value pointer — a short glowing tick on the arc */}
        <line
          x1={tickInner.x}
          y1={tickInner.y}
          x2={tickOuter.x}
          y2={tickOuter.y}
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${color})` }}
        />
        {/* the engraved tide reading — sits IN the bowl on a soft plate, drawn last
            so the needle passes cleanly behind the digits. */}
        <ellipse cx={CX} cy={100} rx={46} ry={25} fill="url(#gauge-bowl)" />
        <text x={CX} y={101} className="gauge-num" textAnchor="middle" dominantBaseline="middle" fill={color}>
          {Math.round(v)}
        </text>
      </svg>
      <div className="gauge-cap">calibrated anomaly score · 99 = measurement marker, not the gate</div>
    </>
  );
}
