// Model warm-up indicator (display only). After a (re)start the agent spends ~31
// min filling the live FeatureBuilder's velocity window (score reads 0), then the
// EWMA covariance re-centers on the live Pyth↔DeepBook domain — ~45 min total
// (WARMUP_READY_MS), MEASURED on the prod journal. Until `ready`, an early reading
// may over-read (esp. the thin testnet pool) and the agent withholds autonomous
// tightening. Two variants: a compact header chip + the full strip below the cards.
type Warmup = { elapsedMs: number; readyMs: number; ready: boolean };

function fmtDur(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function WarmupStatus({ warmup, variant }: { warmup?: Warmup; variant: "chip" | "strip" }) {
  if (!warmup) return null;
  const { elapsedMs, readyMs, ready } = warmup;
  const pct = Math.min(100, Math.max(0, (elapsedMs / Math.max(1, readyMs)) * 100));

  if (variant === "chip") {
    return (
      <span className={`warm-chip ${ready ? "warm-chip--ready" : "warm-chip--cal"}`}>
        <span className="warm-dot" />
        {ready ? "model calibrated" : `calibrating · ${fmtDur(elapsedMs)} / ${fmtDur(readyMs)}`}
      </span>
    );
  }

  if (ready) {
    return (
      <div className="warm-strip warm-strip--ready">
        <span className="warm-dot" />
        <span className="warm-strip-text">
          <b>Model calibrated</b> — {fmtDur(elapsedMs)} of continuous live operation. The mainnet calm reading
          is reliable. (A restart re-warms in ~{fmtDur(readyMs)}.)
        </span>
      </div>
    );
  }

  return (
    <div className="warm-strip warm-strip--cal">
      <div className="warm-strip-row">
        <span className="warm-dot" />
        <span className="warm-strip-label">Model calibrating</span>
        <span className="warm-strip-pct">
          {fmtDur(elapsedMs)} <span className="warm-strip-of">/ {fmtDur(readyMs)}</span>
        </span>
      </div>
      <div className="warm-bar">
        <div className="warm-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="warm-strip-note">
        After a (re)start the model fills its velocity window (~31 min, the score reads 0) then re-centers its
        EWMA baseline on the live feed. The mainnet score settles to its true calm reading once warm; an early
        reading may over-read until then. Autonomous parameter tightening is withheld while calibrating.
      </div>
    </div>
  );
}
