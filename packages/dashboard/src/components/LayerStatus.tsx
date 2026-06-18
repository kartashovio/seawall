// The 3-layer enforcement ladder — promoted to the HERO of the merged "How it
// works" band. Three self-documenting RUNGS, each carrying its own actor (who may
// pull it), trigger (on what), and a why-safe line — so the old prose steps + the
// separate "guards" block fold INTO the live artifact, authored exactly once.
//
// Three LIVE states per rung, never just on/off — so a calm steady-state still
// reads "armed and watching", never "optional/dead" (the framing must-have #3
// forbids):
//   L1  always ENFORCING        (the contract · agent-independent · per-borrow)
//   L2  ARMED · standing by  →  TIGHTENING · enforced   (the agent, contract-clamped)
//   L3  ARMED · contract-watching  →  FROZEN            (the contract ALONE)
//
// FREEZE-ATTRIBUTION INVARIANT: L3 lights purely from `paused` (the contract's own
// re-derived Pyth↔DeepBook divergence ≥ T, or a not-ok book). There is NO
// connector/arrow/gradient bridging L2→L3; the L3 actor chip is the contract; a
// scoped coral tab restates "freeze: contract-only". The advisory score is never
// consulted here — keeping amber (agent) and coral (contract) distinct is load-bearing.
import type { AgentTickDTO } from "@seawall/shared";
import type { GuardianEventRow } from "../abi";
import { DIV } from "../config";

// Bound to the contract constant the gauge bands also bind to (T_FREEZE).
const FREEZE_PCT = DIV.freezeBps / 100; // 500 bps → 5%

const pct = (bps: number) => `${Math.round(bps / 100)}%`;

export function LayerStatus({
  tick,
  paused,
  events,
}: {
  tick: AgentTickDTO | null;
  paused: boolean;
  events: GuardianEventRow[];
}) {
  // L2 lights only when the agent-originated request has actually ratcheted the
  // applied max-LTV below the DAO-set baseline (the contract accepted it, clamped
  // to the corridor). The advisory score is never consulted.
  const agentTightened = !!tick && tick.applied.maxLtv < tick.baseline.maxLtv;

  // Live corridor headroom — glass-box: what's applied now vs the DAO baseline.
  const headroom = tick ? `maxLTV ${pct(tick.applied.maxLtv)} / ${pct(tick.baseline.maxLtv)}` : null;

  // Time since the last on-chain action (events are newest-first).
  const last = events[0];
  const ago = last && last.tsMs > 0 ? `${Math.round((Date.now() - last.tsMs) / 1000)}s ago` : "—";

  return (
    <section className="card layers">
      <div className="lamps">
        {/* L1 — the always-on inline floor. The contract, agent-independent: it is
            the seatbelt every borrow/withdraw self-checks, working even if the agent
            is dead. Always ENFORCING. */}
        <div className="lamp on l1">
          <span className="led" />
          <span className="rung-label">L1</span>
          <div className="rung-body">
            <div className="rung-row1">
              <span className="lt">Inline floor</span>
              <span className="rung-state st-on-cyan">enforcing</span>
              <span className="tag tag-contract rung-chip">the contract</span>
            </div>
            <div className="rung-trigger">every borrow &amp; withdraw re-runs the guardian</div>
            <div className="why-safe">works even if the agent is dead</div>
          </div>
        </div>

        {/* L2 — CAUTION limits. Agent-ORIGINATED, but the light tracks the on-chain
            applied value, which the contract clamped to [floor, baseline]. Amber = agent.
            Calm = ARMED (taut), not dim — it is load-bearing, not optional. */}
        <div className={`lamp l2 ${agentTightened ? "on" : "armed"}`}>
          <span className="led" />
          <span className="rung-label">L2</span>
          <div className="rung-body">
            <div className="rung-row1">
              <span className="lt">CAUTION limits</span>
              <span className={`rung-state ${agentTightened ? "st-on-amber" : "st-armed-amber"}`}>
                {agentTightened ? "tightening · enforced" : "armed · standing by"}
              </span>
              <span className="advisory-pill">score · advisory only</span>
              <span className="tag tag-agent rung-chip">the agent</span>
            </div>
            <div className="rung-trigger">the agent originates a tighten as risk rises</div>
            <div className="why-safe">
              contract clamps it to DAO bounds — a one-way ratchet, only safer
              {headroom && <span className="rung-headroom">{headroom}</span>}
            </div>
          </div>
        </div>

        {/* L3 — FROZEN hard stop. CONTRACT-ONLY: lights purely from `paused`, on the
            contract's own divergence ≥ T or a not-ok book. Coral = contract. The agent
            has NO role in the freeze — deliberately no agent attribution on this rung. */}
        <div className={`lamp l3 ${paused ? "on" : "armed"}`}>
          <span className="led" />
          <span className="rung-label">L3</span>
          <div className="rung-body">
            <div className="rung-row1">
              <span className="lt">FROZEN</span>
              <span className={`rung-state ${paused ? "st-on-coral" : "st-armed-coral"}`}>
                {paused ? "frozen" : "armed · contract-watching"}
              </span>
              <span className="freeze-tab">freeze: contract-only</span>
              <span className="tag tag-contract rung-chip">the contract</span>
            </div>
            <div className="rung-trigger">its own divergence ≥ {FREEZE_PCT}% or the book unusable</div>
            <div className="why-safe">only the DAO unfreezes</div>
          </div>
        </div>
      </div>

      <div className="timer">
        <div className="speed">
          manual freeze: hours · DAO vote: days · Seawall: <b>one block</b>
        </div>
        <div className="ago">last on-chain action: {ago}</div>
      </div>
    </section>
  );
}
