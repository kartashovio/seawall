// "Human override" — the standalone DAO console band (ST1 must-have #4). Same
// owner-endorsed sequential IA as "How it works" / "Connect your protocol":
// CLAIM → the authority-axis FRAME → SEAM → the LIVE console (hero) → PAYOFF →
// the cap mechanics + governance ABI behind a collapsed disclosure.
//
// THE FRAME is the one-way ratchet as a picture: the inline floor, the keeper and
// the agent can each only push the system SAFER; only the owned DAO cap can widen
// the corridor or unfreeze. Neutral connectors (FlowStrip discipline) so no arrow reads
// as the agent reaching the cap. Trust rails: agent can't reach the owned cap, a
// shared-object call can't bypass it, FREEZE is contract-only / UNFREEZE is DAO-only,
// and the single-key demo concession is stated in the always-visible scan.
import { GovernancePanel } from "./GovernancePanel";

// The SAFER-side actors (all can only push toward safer). inline floor + keeper are
// the contract trust-root (cyan); the agent is untrusted (amber).
const SAFER = [
  { t: "inline floor", mod: "contract" },
  { t: "keeper", mod: "contract" },
  { t: "agent", mod: "agent" },
] as const;

function AuthAxis() {
  return (
    <div
      className="auth-axis"
      role="img"
      aria-label="The inline floor, the keeper, and the agent can each only push the system safer. Only the owned DAO cap can widen the corridor or unfreeze the market."
    >
      <span className="auth-pole auth-pole--safe">SAFER</span>
      {SAFER.map((c) => (
        <span key={c.t} className={`auth-chip auth-chip--${c.mod}`}>
          {c.t}
        </span>
      ))}
      <span className="auth-rule" aria-hidden="true" />
      <span className="auth-arrow" aria-hidden="true">→</span>
      <span className="auth-chip auth-chip--dao">DAO cap · widens the corridor or unfreezes</span>
      <span className="auth-pole auth-pole--risk">RISKIER</span>
    </div>
  );
}

function AbiReveal() {
  return (
    <details className="wiring-reveal connect-abi">
      <summary>Show the cap mechanics and the three governance calls</summary>
      <div className="abi-body">
        <div className="abi-block">
          <span className="tag tag-dao abi-tag">Why the cap is owned, not embedded</span>
          <div className="abi-note">
            The GuardianPolicy is a shared object — anyone can call its public functions. A capability stored inside it
            would be an authority bypass: any caller could unfreeze, loosen, or rotate. So the human-override cap is a
            separate owned object (key, store) with a policy_id link, passed by reference as the 2nd argument of every
            governance call — only its holder can act. The scoped PauseCap and ParamCap live inside the shared policy
            safely; only this cap is external. Move fields are module-private, so this is about call-reachability, not
            exposed bytes.
          </div>
        </div>
        <div className="abi-block">
          <span className="tag tag-dao abi-tag">Three governance calls · &amp;GovernanceCap</span>
          <code className="abi-code abi-wrap">{`governance_unfreeze(policy, &GovernanceCap, clock)
governance_set_corridor(policy, &GovernanceCap, ltv_floor_bps, ltv_baseline_bps, cap_floor_bps, cap_baseline_bps, clock)
governance_rotate_agent(policy, &GovernanceCap, new_agent, clock)`}</code>
        </div>
      </div>
    </details>
  );
}

export function DaoConsoleBand({ paused }: { paused: boolean }) {
  return (
    <section className="band dao-console">
      <div className="band-head">
        <span className="kicker">Human override</span>
        <span className="lede">one owned cap · three governance calls · live on testnet</span>
      </div>

      <div className="hero-claim">
        <h2 className="hero-claim-line">A human can override the guardian.</h2>
        <p className="hero-claim-body">
          The freeze is <span className="c-contract">contract-only</span>, and the <span className="c-agent">agent</span>{" "}
          can only tighten. The one road back — unfreeze, wider bounds, a new agent — runs through a single{" "}
          <span className="c-dao">owned cap in your wallet</span>. The agent can’t reach it.
        </p>
        <div className="hero-legend">
          <span className="tag tag-agent">untrusted agent</span>
          <span className="tag tag-contract">the contract</span>
          <span className="tag tag-dao">the DAO</span>
        </div>
      </div>

      <AuthAxis />

      <div className="story-seam">That cap, live in your wallet right now:</div>

      <GovernancePanel paused={paused} />

      <div className="connect-payoff">
        The cap is one owned object. The agent can’t reach it, and a shared-object call can’t bypass it. Only this key
        can widen the corridor or unfreeze the market — everything else only pushes safer. A single key in this demo;
        production runs a DAO multisig.
      </div>

      <AbiReveal />
    </section>
  );
}
