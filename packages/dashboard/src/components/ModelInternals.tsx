// Glass-box view of the off-chain risk model. Pure presentational: every number
// is rendered straight from props (the agent tick) so a judge can see the
// EWMA-adaptive Mahalanobis detector's internals — d² vs the χ² threshold, the
// closed-form per-feature contributions, and where the agent has pushed the
// live params within the DAO-set corridor. The advisory score is NEVER on the
// logic path; this card only explains the math behind the CAUTION request.
import { pct } from "../config";

// χ²₀.₉₅ critical values for the feature-count k we actually run (4 / 5 / 6).
const CHI2_95: Record<number, number> = { 4: 9.49, 5: 11.07, 6: 12.59 };

// Tonal cyan/teal ramp for the stacked spectrum — distinguishable segments that
// read as ONE calm instrument. Deliberately NOT the semantic accents: amber stays
// the agent, coral stays breach, dao stays governance — the glass-box chart never
// borrows those meanings.
const PAL = ["var(--cyan)", "var(--cyan-glow)", "var(--cyan-dim)", "#3aa6c0", "#5fded0", "#2a7d8f"];

export function ModelInternals(props: {
  d2: number;
  k: number;
  contributions: Record<string, number>;
  solvency: number;
  liquidity: number;
  applied: { maxLtv: number; borrowCap: number };
  floor: { maxLtv: number; borrowCap: number };
  baseline: { maxLtv: number; borrowCap: number };
}) {
  const { d2, k, contributions, solvency, liquidity, applied, floor, baseline } = props;

  const thr = CHI2_95[k] ?? 11.07;
  const tripped = d2 >= thr;
  const d2Width = Math.min(100, (d2 / thr) * 50); // χ² sits at the 50% post

  // Display each feature's MAGNITUDE share of d² (|cᵢ| / Σ|c|) → clean 0–100% bars
  // that sum to 100%. (Raw signed marginal contributions can be negative or exceed
  // 100% from covariance cross-terms — mathematically real but reads as broken.)
  const entries = Object.entries(contributions);
  const total = entries.reduce((s, [, v]) => s + Math.abs(v), 0) || 1;

  const corridorParams = [
    { label: "max LTV", a: applied.maxLtv, f: floor.maxLtv, b: baseline.maxLtv },
    { label: "borrow cap", a: applied.borrowCap, f: floor.borrowCap, b: baseline.borrowCap },
  ];

  return (
    <section className="card model">
      <h2>
        Model internals <span className="tag tag-agent">EWMA·Mahalanobis (glass-box)</span>
      </h2>

      <div className="model-blocks">
        {/* (1) Mahalanobis distance vs the χ²(k) decision threshold. */}
        <div className="blk">
          <div className="blk-title">Distance vs threshold</div>
          <div className="threshold-track">
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${d2Width}%`, background: tripped ? "var(--red)" : "var(--teal)" }}
              />
            </div>
            <div className="threshold-post" />
          </div>
          <div className="threshold-cap">
            d² = {d2.toFixed(1)} · χ²₀.₉₅({k}) = {thr} ·{" "}
            <span className={tripped ? "trip-word" : "mono"} style={{ color: tripped ? "var(--red)" : "var(--cyan)" }}>
              {tripped ? "TRIP" : "ok"}
            </span>
          </div>
          <div className="jointline">
            joint-anomaly: every feature can be sub-threshold yet d² trips (Scene 2)
          </div>
        </div>

        {/* (2) Closed-form per-feature contribution to d² — the transparency leg. */}
        <div className="blk">
          <div className="blk-title">Per-feature contribution to d²</div>
          <div className="spectrum">
            {entries.map(([name, val], i) => (
              <span key={name} style={{ width: `${(Math.abs(val) / total) * 100}%`, background: PAL[i % PAL.length] }} title={name} />
            ))}
          </div>
          {entries.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>
              warming up…
            </div>
          ) : (
            entries.map(([name, val], i) => {
              const share = (Math.abs(val) / total) * 100;
              return (
                <div className="barrow" key={name}>
                  <span className="barlabel">{name}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${share}%`, background: PAL[i % PAL.length] }} />
                  </div>
                  <span className="barval">{share.toFixed(0)}%</span>
                </div>
              );
            })
          )}
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            solvency {solvency.toFixed(1)} · liquidity {liquidity.toFixed(1)}
          </div>
        </div>

        {/* (3) Where the agent has pushed each live param within the DAO corridor. */}
        <div className="blk">
          <div className="blk-title">Live params · DAO corridor</div>
          {corridorParams.map((p) => {
            const span = p.b || 1;
            const bandLeft = (p.f / span) * 100;
            const curLeft = (p.a / span) * 100;
            return (
              <div key={p.label} style={{ marginBottom: 14 }}>
                <div className="barrow" style={{ gridTemplateColumns: "78px 1fr", marginBottom: 5 }}>
                  <span className="barlabel">{p.label}</span>
                  <span className="mono" style={{ fontSize: 12 }}>
                    {pct(p.a)}% (floor {pct(p.f)} · base {pct(p.b)})
                  </span>
                </div>
                <div className="corr">
                  <div className="band" style={{ left: `${bandLeft}%`, right: 0 }} />
                  <div className="endcap" />
                  <div className="cur" style={{ left: `${curLeft}%` }} />
                </div>
              </div>
            );
          })}
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
            ◆ marker = agent's current ratchet · band = floor→baseline (DAO-set, agent can't widen)
          </div>
        </div>
      </div>

      <div className="jointline" style={{ marginTop: 16, borderTop: "1px solid var(--line-soft)", paddingTop: 14 }}>
        The score is an event field — never on this logic path. Everything the contract acts on is re-derived on-chain
        from raw Pyth + DeepBook.
      </div>
    </section>
  );
}
