// The 3-layer enforcement panel — the trust-minimization story made visible as a
// breakwater: three relay rows strung on one escalation rail (cyan→amber→coral).
// Pure presentational: each lamp lights straight from props so a judge can read
// who is allowed to pull which rung. The CAUTION rung (L2, amber) is the agent's
// domain — but its light only proves the *applied* param ratcheted below baseline
// (i.e. the contract accepted a clamped request). The FROZEN rung (L3, coral) is
// CONTRACT-ONLY: it lights purely from `paused` and carries NO agent attribution,
// because the freeze fires on the contract's own re-derived Pyth↔DeepBook
// divergence (≥ T) or a not-ok book — never on the agent's word. Keeping amber
// (agent) and coral (contract) visually distinct is load-bearing.
import type { AgentTickDTO } from "@seawall/shared";
import type { GuardianEventRow } from "../abi";

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
  // to the corridor). The advisory score is never consulted here.
  const agentTightened = !!tick && tick.applied.maxLtv < tick.baseline.maxLtv;

  // Time since the last on-chain action (events are newest-first).
  const last = events[0];
  const ago = last && last.tsMs > 0 ? `${Math.round((Date.now() - last.tsMs) / 1000)}s ago` : "—";

  return (
    <section className="card layers">
      <h2>
        3-layer enforcement <span className="tag tag-contract">trust-minimized</span>
      </h2>

      <div className="lamps">
        {/* L1 — the always-on inline floor. No agent, no toggle: it is the seatbelt
            every borrow/liquidate self-checks, and it works even if the agent is dead. */}
        <div className="lamp on l1">
          <span className="led" />
          <div>
            <div className="lt">Inline floor</div>
            <div className="ls">always-on · agent-independent · per-borrow</div>
          </div>
          <span className="rung">L1</span>
        </div>

        {/* L2 — CAUTION params. Agent-ORIGINATED, but the light tracks the on-chain
            applied value, which the contract clamped to [floor, baseline]. Amber = agent. */}
        <div className={`lamp l2${agentTightened ? " on" : ""}`}>
          <span className="led" />
          <div>
            <div className="lt">CAUTION params</div>
            <div className="ls">agent-originated · clamped to corridor</div>
          </div>
          <span className="rung">L2</span>
        </div>

        {/* L3 — FROZEN hard stop. CONTRACT-ONLY: lights purely from `paused`, fires on
            the contract's own divergence ≥ T or a not-ok book. Coral = contract. The agent
            has no role in the freeze — deliberately NO agent attribution on this row. */}
        <div className={`lamp l3${paused ? " on" : ""}`}>
          <span className="led" />
          <div>
            <div className="lt">FROZEN (hard stop)</div>
            <div className="ls">contract-only · div≥T or book-not-ok · DAO-unfreeze</div>
          </div>
          <span className="rung">L3</span>
        </div>
      </div>

      <div className="timer">
        <div className="speed">
          manual freeze: hours · DAO vote: days · Seawall: <b>seconds</b>
        </div>
        <div className="ago">last on-chain action: {ago}</div>
      </div>
    </section>
  );
}
