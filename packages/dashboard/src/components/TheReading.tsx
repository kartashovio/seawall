// "The reading" — the merged deep-dive glass box. Folds the former "instruments"
// (ModelInternals) and "why these limits" (ConstraintPanel) bands into ONE causal
// artifact: the MEASUREMENT (d² vs the χ² trip line + the per-feature contributions)
// → a SEAM (the two scores map to two limit requests) → the agent⟂contract
// NEGOTIATION drawn on the DAO corridor. The corridor geometry now lives here ONCE
// (the LayerStatus L2 ratchet stays the upstream, high-level teaser — this is the
// deep-dive it pays off, progressive disclosure, not a duplicate).
//
// TRUST INVARIANTS carried as renderable state (do not regress):
//   • The advisory 0–100 score is NEVER on the logic path — it is an event field.
//     Every row derives from explainParam(applied, agentTarget, contractTarget),
//     never from the score; the footer states this. No FREEZE lives here — the
//     market freeze is contract-only and lives upstream in LayerStatus.
//   • applied = tighter_of(agent's request, the contract's own divergence reading).
//     The agent can only push SAFER (one-way ratchet) — the held note + the
//     ratchet bound-label carry it. The relax strip attributes every move to the
//     contract, never to an agent loosening.
//   • Colour semantics, never borrowed for decoration: amber = the untrusted agent
//     (the ask tick), cyan = the contract (the corridor band), coral = the floor
//     wall, ink = the committed applied value. The contribution spectrum stays a
//     NON-semantic cyan/teal ramp.
//   • Every param renders via pct(bps) as a PERCENT — never dollars.
import type { AgentTickDTO } from "@seawall/shared";
import { SCORE_LO, SCORE_HI } from "@seawall/shared";
import { agentTarget, contractTarget, explainParam, type BoundBy } from "../constraints";
import { pct, DIV } from "../config";

// χ²₀.₉₅ critical values for the feature-count k we actually run (4 / 5 / 6).
const CHI2_95: Record<number, number> = { 4: 9.49, 5: 11.07, 6: 12.59 };

// Tonal cyan/teal ramp for the contribution spectrum — distinguishable segments
// that read as ONE calm instrument. Deliberately NOT the semantic accents (amber =
// agent, coral = breach, dao = governance); the glass-box chart never borrows them.
const PAL = ["var(--cyan)", "var(--cyan-glow)", "var(--cyan-dim)", "#3aa6c0", "#5fded0", "#2a7d8f"];

// Who is the binding constraint on a knob (scope word kept: "divergence reading").
const BOUND_LABEL: Record<BoundBy, string> = {
  agent: "agent is binding",
  contract: "contract is binding — its own divergence reading",
  "agent + contract": "agent and contract agree",
  ratchet: "ratchet holds it below both — only the contract eases it back",
};

export function TheReading({
  tick,
  applied,
  floor,
  baseline,
}: {
  tick: AgentTickDTO | null;
  applied: { maxLtv: number; borrowCap: number };
  floor: { maxLtv: number; borrowCap: number };
  baseline: { maxLtv: number; borrowCap: number };
}) {
  // ── stage 1: the measurement (defaults so the band renders before frame 1) ──
  const d2 = tick?.d2 ?? 0;
  const k = tick?.k ?? 5;
  const contributions = tick?.contributions ?? {};
  const solvency = tick?.solvency ?? 0;
  const liquidity = tick?.liquidity ?? 0;

  const thr = CHI2_95[k] ?? 11.07;
  const tripped = d2 >= thr;
  const d2Width = Math.min(100, (d2 / thr) * 50); // χ² sits at the 50% post

  // Magnitude share of d² per feature (|cᵢ| / Σ|c|) → clean 0–100% bars summing to
  // 100% (raw signed marginals can be negative / exceed 100% — real, but read broken).
  const entries = Object.entries(contributions);
  const total = entries.reduce((s, [, v]) => s + Math.abs(v), 0) || 1;
  const liqLow = liquidity < SCORE_LO;

  // ── stage 2: the negotiation (agent ⟂ contract) on the corridor ─────────────
  const div = typeof tick?.divBps === "number" ? tick.divBps : 0;
  const at = agentTarget(solvency, liquidity);
  const ct = contractTarget(div);
  const rows = [
    {
      key: "max LTV", driver: "solvency", score: solvency,
      fl: floor.maxLtv, app: applied.maxLtv, base: baseline.maxLtv,
      e: explainParam(applied.maxLtv, at.maxLtv, ct.maxLtv),
    },
    {
      key: "borrow cap", driver: "liquidity", score: liquidity,
      fl: floor.borrowCap, app: applied.borrowCap, base: baseline.borrowCap,
      e: explainParam(applied.borrowCap, at.borrowCap, ct.borrowCap),
    },
  ];
  const relaxBlocked = div >= DIV.cautionBps;

  return (
    <section className="card reading">
      <h2>
        From measurement to limit{" "}
        <span className="tag tag-agent">EWMA · Mahalanobis · score off the logic path</span>
      </h2>

      {/* STAGE 1 — the measurement: one calm cyan instrument, no amber here. */}
      <div className="model-blocks model-blocks--2">
        {/* (1) Mahalanobis distance vs the χ²(k) trip line. */}
        <div className="blk">
          <div className="blk-title">Distance vs trip line</div>
          <div className="threshold-track">
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${d2Width}%`, background: tripped ? "var(--red)" : "var(--teal)" }} />
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
            Each feature can sit below its own line, and the combined distance still trips.
          </div>
        </div>

        {/* (2) Closed-form per-feature contribution to d² — the decomposition. */}
        <div className="blk">
          <div className="blk-title">What's driving the distance</div>
          <div className="spectrum" aria-hidden="true">
            {entries.map(([name, val], i) => (
              <span key={name} style={{ width: `${(Math.abs(val) / total) * 100}%`, background: PAL[i % PAL.length] }} title={name} />
            ))}
          </div>
          {entries.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>calibrating…</div>
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
          {liqLow && (
            <div className="cns-liq">
              <b>Low liquidity score here is expected.</b> The liquidity features — cross-venue dispersion,
              volatility velocity, BTC vol — are calm: no fragmentation, no violent move. The only signal is an
              oracle↔order-book divergence, which is a solvency signal. So the divergence sets <i>max&nbsp;LTV</i>;
              the agent isn't driving <i>borrow&nbsp;cap</i> right now.
            </div>
          )}
        </div>
      </div>

      {/* SEAM — the one wire: two scores → two requested limits → the clamp. */}
      <p className="reading-seam">
        Solvency {solvency.toFixed(0)} and liquidity {liquidity.toFixed(0)} are the agent's read of the two
        risks. Each maps to one limit the agent requests, and the contract applies the tighter of that request
        and its own on-chain divergence reading — it never takes the agent's number on trust.
      </p>

      {/* STAGE 2 — the negotiation, drawn on the DAO corridor (amber ⟂ cyan live here only). */}
      <div className="cns-rows">
        {rows.map((r) => {
          // Absolute 0–100% axis: a mark's position EQUALS its % label (pct(bps) =
          // bps/100). The DAO corridor [floor, baseline] is the shaded band; the
          // applied diamond + the agent's ask sit within it. applied can ratchet
          // toward floor but never past the baseline wall (the coral endcap).
          const bandLeft = pct(r.fl);
          const bandW = pct(r.base) - pct(r.fl);
          const curLeft = pct(r.app);
          const ghostLeft = pct(r.e.agentWants);
          return (
            <div className="cns-row reading-row" key={r.key}>
              <div className="cns-name">
                {r.key}
                <span className="cns-driver">← {r.driver} {r.score.toFixed(0)}</span>
                <span className="cns-driver cns-thresh">tightens at {r.driver} ≥ {SCORE_LO} · bottoms out at {SCORE_HI}</span>
              </div>

              <div className="cns-flow">
                <span className="cns-num"><i>agent asks</i>{pct(r.e.agentWants)}%</span>
                <span className="cns-op">vs</span>
                <span className="cns-num"><i>contract target (divergence)</i>{pct(r.e.contractFloor)}%</span>
                <span className="cns-op">→</span>
                <span className="cns-num cns-applied"><i>applied</i>{pct(r.e.applied)}%</span>
              </div>

              {/* The corridor track, absorbed from the old block-3: the [floor,baseline]
                  band (cyan floor wall ↔ coral baseline wall), ◆ applied (ink, the
                  committed on-chain value), and the agent's ask as an amber tick. Drawn
                  ONCE — no longer triplicated. */}
              <div className="reading-track">
                <div className="reading-corridor" style={{ left: `${bandLeft}%`, width: `${bandW}%` }} />
                <div className="reading-ghost" style={{ left: `${ghostLeft}%` }} />
                <div className="reading-cur" style={{ left: `${curLeft}%` }} />
              </div>

              <div className={`cns-bound is-${r.e.boundBy === "contract" ? "contract" : r.e.boundBy === "agent" ? "agent" : "neutral"}`}>
                {BOUND_LABEL[r.e.boundBy]}
                {r.e.agentWantsLooser && (
                  <span className="cns-held"> · the agent would loosen this to {pct(r.e.agentWants)}%, but the ratchet holds</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="muted reading-legend">
        On each track: ◆ applied (on-chain) · the amber tick is the agent's ask · the shaded band is the DAO
        corridor, floor → baseline.
      </div>

      {/* Relax gate — every move attributed to the contract, never an agent loosening. */}
      <div className={`cns-relax ${relaxBlocked ? "is-blocked" : "is-open"}`}>
        {relaxBlocked ? (
          <>
            <b>Held tight.</b> Divergence {div.toFixed(0)} bps is above the {DIV.cautionBps} bps caution line. The
            contract holds the limits and eases them back toward baseline only after 10 minutes of sustained calm.
          </>
        ) : (
          <>
            <b>Easing back.</b> Divergence is calm, so the contract steps the limits back toward baseline, one
            step at a time.
          </>
        )}
      </div>

      {/* ONE merged honesty footer (replaces both former footers). */}
      <div className="cns-foot reading-foot">
        The score is an event field, never on the logic path. The contract acts only on what it re-derives
        on-chain from raw Pyth + DeepBook. The column above shows the contract's divergence reading only — it
        also tightens on a stale or low-confidence oracle, or an unusable order book, and wins on every path, so
        the real limit can be tighter than shown. The <b>applied</b> value is always the real on-chain number.
      </div>
    </section>
  );
}
