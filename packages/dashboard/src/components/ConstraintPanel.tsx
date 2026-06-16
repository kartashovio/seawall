// "Why these limits" — makes the agent⟂contract negotiation transparent: for each
// lending knob it shows what the AGENT's score asks, what the CONTRACT's own
// divergence reading demands, and what's APPLIED (the tighter of the two), plus who
// is binding and whether the agent is being held from loosening. Pure display: it
// reproduces (via constraints.ts mirrors, unit-tested) the same math the agent + the
// Move contract run — it drives nothing.
import type { AgentTickDTO } from "@seawall/shared";
import { agentTarget, contractTarget, explainParam, type BoundBy } from "../constraints";
import { DIV, pct } from "../config";
import { SCORE_LO } from "@seawall/shared";

const BOUND_LABEL: Record<BoundBy, string> = {
  agent: "set by the agent",
  contract: "held by the contract’s own divergence reading",
  "agent + contract": "agent and contract agree",
  ratchet: "ratchet-held tighter than both (relax gated)",
};

export function ConstraintPanel({ tick }: { tick: AgentTickDTO | null }) {
  if (!tick) return null;
  const solvency = tick.solvency ?? 0;
  const liquidity = tick.liquidity ?? 0;
  const applied = tick.applied;
  const div = typeof tick.divBps === "number" ? tick.divBps : 0;

  const at = agentTarget(solvency, liquidity);
  const ct = contractTarget(div);
  const rows = [
    { key: "max LTV", e: explainParam(applied.maxLtv, at.maxLtv, ct.maxLtv), driver: "solvency", score: solvency },
    { key: "borrow cap", e: explainParam(applied.borrowCap, at.borrowCap, ct.borrowCap), driver: "liquidity", score: liquidity },
  ];
  const relaxBlocked = div >= DIV.cautionBps;
  const liqLow = liquidity < SCORE_LO;

  return (
    <section className="card constraint">
      <h2>
        Why these limits <span className="tag tag-contract">agent ⟂ contract</span>
      </h2>
      <p className="cns-lede">
        Each knob is the <b>tighter</b> of what the agent's score asks and what the contract's own on-chain divergence reading
        demands — and the one-way ratchet never lets it loosen except on a sustained calm.
      </p>

      <div className="cns-rows">
        {rows.map((r) => (
          <div className="cns-row" key={r.key}>
            <div className="cns-name">
              {r.key}
              <span className="cns-driver">
                ← {r.driver} {r.score.toFixed(0)}
              </span>
            </div>
            <div className="cns-flow">
              <span className="cns-num">
                <i>agent wants</i>
                {pct(r.e.agentWants)}%
              </span>
              <span className="cns-op">vs</span>
              <span className="cns-num">
                <i>contract floor</i>
                {pct(r.e.contractFloor)}%
              </span>
              <span className="cns-op">→</span>
              <span className="cns-num cns-applied">
                <i>applied</i>
                {pct(r.e.applied)}%
              </span>
            </div>
            <div className={`cns-bound is-${r.e.boundBy === "contract" ? "contract" : r.e.boundBy === "agent" ? "agent" : "neutral"}`}>
              {BOUND_LABEL[r.e.boundBy]}
              {r.e.agentWantsLooser && <span className="cns-held"> · agent would loosen to {pct(r.e.agentWants)}% but can't</span>}
            </div>
          </div>
        ))}
      </div>

      <div className={`cns-relax ${relaxBlocked ? "is-blocked" : "is-open"}`}>
        {relaxBlocked ? (
          <>
            <b>Relax blocked.</b> Divergence {div.toFixed(0)} bps is above the {DIV.cautionBps} bps calm line, so the contract holds
            the params — they ease back toward baseline only after a sustained 10-min calm (the keeper's drip).
          </>
        ) : (
          <>
            <b>Relax available.</b> Divergence is calm; the contract drips the params back toward baseline one step at a time.
          </>
        )}
      </div>

      {liqLow && (
        <div className="cns-liq">
          <b>liquidity {liquidity.toFixed(0)} is not a bug.</b> The liquidity features (cross-venue dispersion, volatility velocity,
          BTC vol) are genuinely calm — there's no fragmentation or violent move, only an oracle↔order-book divergence (a solvency
          signal). So the divergence floors <i>max&nbsp;LTV</i>, while <i>borrow&nbsp;cap</i> isn't agent-driven here.
        </div>
      )}
    </section>
  );
}
