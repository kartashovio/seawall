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
import { CFG } from "../config";

const short = (id?: string): string => (id ? `${id.slice(0, 8)}…${id.slice(-4)}` : "—");

// Recorded governance calls — real, verifiable testnet transactions proving the two
// bounds/agent calls actually execute. Run against a SEPARATE test policy (same
// package) so the live demo policy stays untouched; every call is &GovernanceCap-gated.
const GOV_EXAMPLES = [
  {
    fn: "governance_set_corridor",
    what: "re-anchored the corridor — max-LTV 75→70%, borrow-cap 100→90%",
    digest: "CbWHFYUZYahUFmCgDHwC2av6sQ4EsV8wjcMEw6BNb911",
  },
  {
    fn: "governance_rotate_agent",
    what: "swapped the address allowed to submit requests",
    digest: "5nGj3nFgd4E5wZjrVvDTa416FyF7tUnXqQ5cDhspBHiZ",
  },
] as const;

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
      <div className="hero-claim">
        <h2 className="hero-claim-line seas-claim-line">A human can override the guardian.</h2>
        <p className="hero-claim-body">
          Inside the corridor the system loosens itself: the <span className="c-agent">agent</span> only ever tightens,
          and the <span className="c-contract">contract eases the limits back</span> toward baseline on its own after the
          market stays calm. Two moves it will never make for you — <span className="c-dao">lifting a freeze</span> or{" "}
          <span className="c-dao">widening the corridor</span> — run through a single{" "}
          <span className="c-dao">owned cap in your wallet</span>, the same cap that rotates which agent may submit. The{" "}
          <span className="c-agent">agent</span> can’t reach it.
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
        widens the corridor or unfreezes the market — the agent only ever pushes safer, and the contract only eases back
        within your bounds. A single key in this demo; production runs a DAO multisig.
      </div>

      <div className="live-receipt dao-cap-receipt">
        <span className="lr-dot" aria-hidden="true" />
        Live on testnet · the cap{" "}
        <a className="lr-id" href={`${CFG.explorerObj}/${CFG.governanceCapId}`} target="_blank" rel="noreferrer">
          {short(CFG.governanceCapId)}
        </a>{" "}
        · the policy it governs{" "}
        <a className="lr-id" href={`${CFG.explorerObj}/${CFG.policyId}`} target="_blank" rel="noreferrer">
          {short(CFG.policyId)}
        </a>
      </div>

      {/* Recorded proof that the two cap-gated bounds/agent calls actually run on
          testnet — the live console above lets you press them; these are the same
          calls already executed, each verifiable on the explorer. */}
      <div className="dao-gov-proven">
        <div className="dao-gov-proven-head">
          <span className="dao-gov-proven-lbl">Both bounds &amp; agent calls, already run on-chain</span>
          <span className="tag tag-dao">&amp;GovernanceCap-gated</span>
        </div>
        <ul className="dao-gov-list">
          {GOV_EXAMPLES.map((e) => (
            <li className="dao-gov-row" key={e.fn}>
              <span className="mono gov-fn dao-gov-fn">{e.fn}</span>
              <span className="dao-gov-what">{e.what}</span>
              <a className="digest mono" href={`${CFG.explorerTx}/${e.digest}`} target="_blank" rel="noreferrer">
                {e.digest.slice(0, 8)}…
              </a>
            </li>
          ))}
        </ul>
        <span className="dao-gov-foot">
          Executed on a separate test policy (same package) so the live demo stays put — unfreeze is the third call,
          recorded in the freeze cycle above.
        </span>
      </div>

      <AbiReveal />
    </section>
  );
}
