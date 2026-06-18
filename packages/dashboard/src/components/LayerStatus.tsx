// The 3-layer enforcement ladder — the HERO of the merged "How it works" band.
// Redesigned as a true ESCALATION LADDER on one signal (Pyth↔DeepBook divergence):
//
//   • A number-tile per rung carries the ACTOR identity at all times (cyan = the
//     contract · amber = the untrusted agent · coral = frozen). Top→bottom the tiles
//     read contract · agent · contract — the agent is SANDWICHED, never atop the ladder.
//   • A 2px ascent spine connects L1→L2 behind the rail and DIES at L2's base. L3 has
//     NO spine; a full-width "AGENT STOPS HERE" gate-band severs it. The freeze is the
//     contract's alone — nothing visual connects the agent's rung to it.
//   • Three LIVE states per rung, never on/off — a calm market still reads "armed &
//     watching", never "optional/dead" (framing must-have #3):
//       L1  always ENFORCING            (the contract · agent-independent · per-borrow)
//       L2  ARMED  →  TIGHTENING        (the agent originates, the contract clamps)
//       L3  WATCHING  →  FROZEN         (the contract ALONE)
//   • L2 promotes the live RATCHET (maxLTV + borrowCap, baseline→current, with a
//     corridor mini-track) — the glass-box proof the one-way clamp actually moved.
//
// FREEZE-ATTRIBUTION INVARIANT: L3 lights purely from `paused` (the contract's own
// re-derived Pyth↔DeepBook divergence ≥ T, or a not-ok book). There is NO connector
// bridging L2→L3; the advisory score is never consulted here — keeping amber (agent)
// and coral (contract) distinct is load-bearing. The advisory 0–100 score never
// appears as a value; the only reference is the "score · advisory only" caption.
import type { AgentTickDTO } from "@seawall/shared";
import { lastKeeperPokeMs, type GuardianEventRow } from "../abi";
import { agoText, state, dotFor } from "./KeeperStatus";
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

  // The live ratchet rows — what's applied now vs the DAO baseline, per param, with
  // the share of the [floor, baseline] corridor the ratchet has removed (0 at
  // baseline → 1 at floor). Both params are bps; pct() renders them as percentages.
  const ratchet = tick
    ? (["maxLtv", "borrowCap"] as const).map((p) => {
        const base = tick.baseline[p];
        const fl = tick.floor[p];
        const app = tick.applied[p];
        return {
          p,
          label: p === "maxLtv" ? "maxLTV" : "borrowCap",
          base,
          app,
          tightened: app < base,
          fill: base > fl ? Math.min(1, Math.max(0, (base - app) / (base - fl))) : 0,
        };
      })
    : null;

  // Time since the last on-chain action (events are newest-first).
  const last = events[0];
  const ago = last && last.tsMs > 0 ? `${Math.round((Date.now() - last.tsMs) / 1000)}s ago` : "—";

  // L3 keeper heartbeat — the ONLY live invoker element. Reads ONLY the keeper-style
  // poke ts (newest RiskEvaluated with had_request=false) via the SAME 6/12-min cadence
  // the header KeeperStatus uses (single-sourced), so the two dots can never drift. The
  // keeper POKES evaluate() so the contract keeps re-deriving; it never decides the
  // freeze (that stays `paused` = the contract's OWN divergence).
  const keeperPokeMs = lastKeeperPokeMs(events);
  const keeperAge = keeperPokeMs !== undefined ? Date.now() - keeperPokeMs : undefined;
  const keeperS: "idle" | "ok" | "warn" | "down" = keeperAge !== undefined ? state(keeperAge) : "idle";
  // down → grey (dot-idle), NEVER coral: coral stays the freeze actor on this rung.
  // (keeperS === "idle" iff keeperAge === undefined — narrowing on keeperS lets dotFor
  // see only "ok"|"warn", the same runtime behaviour as the keeperAge check.)
  const keeperDot = keeperS === "idle" || keeperS === "down" ? "dot-idle" : dotFor(keeperS);
  const keeperFresh =
    keeperAge === undefined
      ? "—"
      : keeperS === "down"
        ? `no poke ${agoText(keeperAge)}`
        : `poke ${agoText(keeperAge)}`;

  return (
    <section className="card layers">
      <div className="rung-axis-cap">divergence</div>
      <div className="lamps">
        {/* L1 — the always-on inline floor. The contract, agent-independent: the
            seatbelt every borrow/withdraw self-checks, working even if the agent is
            dead. Always ENFORCING. */}
        <div className="lamp on l1">
          <div className="rung-tile">
            <span className="led" />
            <span className="rung-num">L1</span>
          </div>
          <div className="rung-body">
            <div className="rung-head">
              <span className="lt">Inline floor</span>
              <span className="rung-state st-on-cyan">enforcing</span>
            </div>
            <div className="rung-trigger">the contract self-checks staleness, confidence and divergence</div>
            <div className="rung-poke">
              <span className="poke-k">poked by</span>
              <span className="poke-who poke-contract">every borrow &amp; withdraw</span>
            </div>
            <div className="why-safe">holds even if the agent goes offline</div>
          </div>
        </div>

        {/* L2 — CAUTION limits. Agent-ORIGINATED, but the light tracks the on-chain
            applied value, which the contract clamped to [floor, baseline]. Amber = agent.
            Calm = ARMED (taut), not dim — it is load-bearing, not optional. */}
        <div className={`lamp l2 ${agentTightened ? "on" : "armed"}`}>
          <div className="rung-tile">
            <span className="led" />
            <span className="rung-num">L2</span>
          </div>
          <div className="rung-body">
            <div className="rung-head">
              <span className="lt">Caution limits</span>
              <span className={`rung-state ${agentTightened ? "st-on-amber" : "st-armed-amber"}`}>
                {agentTightened ? "tightening" : "armed"}
              </span>
            </div>
            {ratchet && (
              <div className="ratchet">
                {ratchet.map((r) => (
                  <div className="ratchet-row" key={r.p}>
                    <span className="ratchet-k">{r.label}</span>
                    <span className="ratchet-val">
                      {r.tightened ? (
                        <>
                          <span className="base">{pct(r.base)}</span>
                          <span className="arr">→</span>
                          <span className="now">{pct(r.app)}</span>
                        </>
                      ) : (
                        <span className="now-calm">{pct(r.app)}</span>
                      )}
                    </span>
                    <div className="ratchet-track">
                      <div className="ratchet-fill" style={{ width: `${r.fill * 100}%` }} />
                    </div>
                  </div>
                ))}
                {!agentTightened && <div className="ratchet-calm">at baseline, not tightening</div>}
              </div>
            )}
            <div className="advisory-cap">
              <span className="advisory-pill">score · advisory only</span>
            </div>
            <div className="rung-trigger">
              the agent requests a tighter limit as risk rises; the contract applies it
            </div>
            <div className="rung-poke">
              <span className="poke-k">poked by</span>
              <span className="poke-who poke-agent">the agent</span>
            </div>
            <div className="why-safe">the contract clamps it inside DAO bounds — one-way, only safer</div>
          </div>
        </div>

        {/* gate-band — the severance made spatial: the agent's rung ends HERE; the
            freeze below is the contract's alone. A dashed divider, never a connector. */}
        <div className="rung-gate">contract-only · agent stops here</div>

        {/* L3 — the market freeze. CONTRACT-ONLY: lights purely from `paused`, on the
            contract's own divergence ≥ T or a not-ok book. Coral = contract. The agent
            has NO role in the freeze — deliberately no agent attribution on this rung. */}
        <div className={`lamp l3 ${paused ? "on" : "armed"}`}>
          <div className="rung-tile">
            <span className="led" />
            <span className="rung-num">L3</span>
          </div>
          <div className="rung-body">
            <div className="rung-head">
              <span className="lt">Market freeze</span>
              <span className={`rung-state ${paused ? "st-on-coral" : "st-armed-coral"}`}>
                {paused ? "frozen" : "watching"}
              </span>
            </div>
            <div className="rung-trigger">
              the contract&apos;s own divergence hits {FREEZE_PCT}%, or the book goes unusable
            </div>
            {/* The keeper — a permissionless, model-free heartbeat that POKES evaluate()
                so the contract keeps re-deriving even if the agent is dead. It INVOKES
                the check; it never decides the freeze (that's `paused` = the contract's
                OWN divergence). Label tinted CYAN (contract-side poker), NOT coral — do
                NOT change to coral: that would imply keeper→freeze and break poke≠decide.
                The live dot reuses the header keeper-liveness palette; down → grey, never
                coral, so coral stays the freeze actor on this rung. */}
            <div className="rung-poke rung-poke--keeper">
              <span className="poke-k">poked by</span>
              <span className="poke-who poke-keeper">a permissionless keeper</span>
              <span className={`dot ${keeperDot}`} />
              <span className="poke-fresh">{keeperFresh}</span>
            </div>
            <div className="poke-note">keeps the contract checking even if the agent stops</div>
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
