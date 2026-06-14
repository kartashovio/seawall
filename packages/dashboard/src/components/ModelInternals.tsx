// Glass-box view of the off-chain risk model. Pure presentational: every number
// is rendered straight from props (the agent tick) so a judge can see the
// EWMA-adaptive Mahalanobis detector's internals — d² vs the χ² threshold, the
// closed-form per-feature contributions, and where the agent has pushed the
// live params within the DAO-set corridor. The advisory score is NEVER on the
// logic path; this card only explains the math behind the CAUTION request.
import { pct } from "../config";

// χ²₀.₉₅ critical values for the feature-count k we actually run (4 / 5 / 6).
const CHI2_95: Record<number, number> = { 4: 9.49, 5: 11.07, 6: 12.59 };

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
  const d2Width = Math.min(100, (d2 / thr) * 50);

  const entries = Object.entries(contributions);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;

  const corridorParams = [
    { label: "max LTV", a: applied.maxLtv, f: floor.maxLtv, b: baseline.maxLtv },
    { label: "borrow cap", a: applied.borrowCap, f: floor.borrowCap, b: baseline.borrowCap },
  ];

  return (
    <section className="card model">
      <h2>
        Model internals <span className="tag tag-agent">EWMA·Mahalanobis (glass-box)</span>
      </h2>

      {/* (1) Mahalanobis distance vs the χ²(k) decision threshold. */}
      <div style={{ marginBottom: 18 }}>
        <div className="barrow" style={{ gridTemplateColumns: "78px 1fr 56px" }}>
          <span className="barlabel">d² / χ²</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${d2Width}%`, background: tripped ? "var(--red)" : "var(--teal)" }}
            />
          </div>
          <span className="barval mono" style={{ color: tripped ? "var(--red)" : "var(--ink)" }}>
            {tripped ? "TRIP" : "ok"}
          </span>
        </div>
        <div className="mono" style={{ fontSize: 12, marginTop: 2 }}>
          d² = {d2.toFixed(1)} · χ²₀.₉₅({k}) = {thr}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          joint-anomaly: every feature can be sub-threshold yet d² trips (Scene 2)
        </div>
      </div>

      {/* (2) Closed-form per-feature contribution to d² — the transparency leg. */}
      <div style={{ marginBottom: 18 }}>
        <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
          per-feature contribution to d²
        </div>
        {entries.length === 0 ? (
          <div className="muted" style={{ fontSize: 12 }}>warming up…</div>
        ) : (
          entries.map(([name, val]) => {
            const share = (val / total) * 100;
            return (
              <div className="barrow" key={name}>
                <span className="barlabel">{name}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${share}%`, background: "var(--teal)" }} />
                </div>
                <span className="barval mono">{share.toFixed(0)}%</span>
              </div>
            );
          })
        )}
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          solvency {solvency.toFixed(1)} · liquidity {liquidity.toFixed(1)}
        </div>
      </div>

      {/* (3) Where the agent has pushed each live param within the DAO corridor. */}
      <div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
          live params within DAO corridor
        </div>
        {corridorParams.map((p) => {
          const span = p.b || 1;
          const bandLeft = (p.f / span) * 100;
          const curLeft = (p.a / span) * 100;
          return (
            <div key={p.label} style={{ marginBottom: 12 }}>
              <div className="barrow" style={{ gridTemplateColumns: "78px 1fr", marginBottom: 4 }}>
                <span className="barlabel">{p.label}</span>
                <span className="mono" style={{ fontSize: 12 }}>
                  {pct(p.a)}% (floor {pct(p.f)} · base {pct(p.b)})
                </span>
              </div>
              <div className="corr">
                <div className="band" style={{ left: `${bandLeft}%`, right: 0 }} />
                <div className="cur" style={{ left: `${curLeft}%` }} />
              </div>
            </div>
          );
        })}
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          ◆ marker = agent's current ratchet · band = floor→baseline (DAO-set, agent can't widen)
        </div>
      </div>
    </section>
  );
}
