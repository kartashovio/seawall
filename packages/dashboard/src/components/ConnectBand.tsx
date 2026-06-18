// "Connect your protocol" — the guardian-as-a-service ADOPTION band (Real-World 50%).
// Sits between "How it works" (what the system does) and "The two seas" (it running
// live). It does NOT re-teach the L1/L2/L3 ladder; it shows where a consumer protocol
// TOUCHES each layer and exactly what calls flow.
//
// Same owner-endorsed sequential IA as "How it works": CLAIM → artifact (the drop-in
// diff) → SEAM → adoption FLOW (deploy → gate → agent) → mode line → live RECEIPT →
// PAYOFF → the dense ABI behind a default-collapsed disclosure.
//
// TRUST RAILS held verbatim: the agent is the LAST adoption step and tagged untrusted
// (one-way ratchet — "the contract clamps it"); FREEZE shows as a contract gate the
// vault obeys (the coral is_paused line); the DAO keeps the corridor + the owned
// GovernanceCap; the 0–100 score appears ONLY in the disclosure, marked event-only.
// All ABI names are real (verified against packages/guardian/sources). Static, no props.
import { CFG } from "../config";

const short = (id?: string) => (id && id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id || "—");

// The hero artifact: the literal change a vault makes to borrow(). Exactly FOUR `+`
// lines (poke + freeze-check + the two live-cap asserts); the price read is a context
// line that consumes `d`, so the "four lines" claim matches the rail count with no
// dangling binding. is_paused carries the lone coral hairline (frozen → abort).
const DIFF: { t: string; add?: boolean; freeze?: boolean; comment?: boolean }[] = [
  { t: "// your vault's borrow() — same PTB as a fresh Pyth update", comment: true },
  { t: "let d = guardian::poke(&mut policy, &pio, &pool, &clock);", add: true },
  { t: "assert!(!guardian::is_paused(&policy), EFrozen);", add: true, freeze: true },
  { t: "let coll = coll_value(divergence::pyth_px_1e9(&d));" },
  { t: "assert!(debt * BPS <= guardian::max_ltv_current_bps(&policy) * coll, ELtv);", add: true },
  { t: "assert!(debt * BPS <= guardian::borrow_cap_current_bps(&policy) * coll, ECap);", add: true },
];

function DiffCard() {
  return (
    <div className="card diff-card">
      {/* Real readable Move source — NOT role="img" (that would hide the ABI names
          from screen readers); the gutter glyphs are aria-hidden, the caption below
          describes it. */}
      <div className="diff-body">
        {DIFF.map((l, i) => (
          <div
            key={i}
            className={`diff-line${l.add ? " diff-add" : ""}${l.freeze ? " diff-freeze" : ""}${l.comment ? " diff-comment" : ""}`}
          >
            <span className="diff-gutter" aria-hidden="true">{l.add ? "+" : " "}</span>
            <span className="diff-code">{l.t}</span>
          </div>
        ))}
      </div>
      <div className="diff-cap">This is the gate. It re-derives the breach on-chain.</div>
    </div>
  );
}

const STEPS: { n: string; mod: "dao" | "contract" | "agent"; label: string; sub: string; untrusted?: boolean }[] = [
  { n: "1", mod: "dao", label: "Deploy once", sub: "create_policy → shared GuardianPolicy, owned GovernanceCap to your DAO" },
  { n: "2", mod: "contract", label: "Add the gate", sub: "four lines in borrow() and withdraw()" },
  { n: "3", mod: "agent", label: "Run the agent", sub: "posts a fresh Pyth update and a tighter-only request — the contract clamps it", untrusted: true },
];

function StepStrip() {
  return (
    <div className="connect-steps" role="list">
      {STEPS.map((s, i) => (
        <div key={s.n} className="cstep-wrap" role="listitem">
          <div className={`cstep cstep--${s.mod}`}>
            <div className="cstep-top">
              <span className="cstep-chip">{s.n}</span>
              <span className="cstep-label">{s.label}</span>
              {s.untrusted && <span className="tag tag-agent cstep-untrusted">untrusted</span>}
            </div>
            <div className="cstep-sub">{s.sub}</div>
          </div>
          {i < STEPS.length - 1 && <span className="flow-arrow cstep-arrow" aria-hidden="true">→</span>}
        </div>
      ))}
    </div>
  );
}

function LiveReceipt() {
  const pkg = CFG.packageId;
  const pol = CFG.policyId;
  return (
    <div className="live-receipt">
      <span className="lr-dot" aria-hidden="true" />
      Live on testnet · package{" "}
      {pkg ? (
        <a className="lr-id" href={`${CFG.explorerObj}/${pkg}`} target="_blank" rel="noreferrer">{short(pkg)}</a>
      ) : (
        <span className="lr-id">—</span>
      )}{" "}
      · policy{" "}
      {pol ? (
        <a className="lr-id" href={`${CFG.explorerObj}/${pol}`} target="_blank" rel="noreferrer">{short(pol)}</a>
      ) : (
        <span className="lr-id">—</span>
      )}
    </div>
  );
}

function AbiReveal() {
  return (
    <details className="wiring-reveal connect-abi">
      <summary>Show deploy, agent submit, and governance calls</summary>
      <div className="abi-body">
        <div className="abi-block">
          <span className="tag tag-dao abi-tag">1 · Deploy once (DAO)</span>
          <code className="abi-code abi-wrap">
            create_policy(registered_agent, feed_id, expected_pool_id, max_ltv_floor_bps, max_ltv_baseline_bps,
            borrow_cap_floor_bps, borrow_cap_baseline_bps, threshold_t, d_caution, conf_frac_max, max_age_secs,
            base_decimals, quote_decimals, all_clear_window_ms, relax_cooldown_ms, relax_step_frac_bps, clock, ctx) :
            GovernanceCap
          </code>
          <div className="abi-note">Shares a GuardianPolicy. Returns the owned GovernanceCap. Every bound is a caller argument — our testnet policy: max_ltv 55–75%, borrow_cap 40–100%, FREEZE T=5%, CAUTION onset=1%.</div>
        </div>

        <div className="abi-block">
          <span className="tag tag-agent abi-tag">2 · Agent submit · one PTB, only when risk warrants</span>
          <code className="abi-code">{`const data = await conn.getPriceFeedsUpdateData([feedId]);
const pio  = await pythClient.updatePriceFeeds(tx, data, [feedId]);
const req  = tx.moveCall({ target: 'guardian::new_param_request', arguments: [maxLtvTarget, borrowCapTarget] });
tx.moveCall({ target: 'guardian::submit', typeArguments: [SUI, DBUSDC],
  arguments: [policy, pio, pool, clock, req, advisoryScore] });`}</code>
          <div className="abi-note">submit is sender-gated to registered_agent; req is clamped to [floor, baseline] and to the contract's own measured target. The 0–100 score is event-only — never on the decision path.</div>
        </div>

        <div className="abi-block">
          <span className="tag tag-dao abi-tag">3 · Govern · owned GovernanceCap</span>
          <code className="abi-code abi-wrap">governance_set_corridor(&amp;cap, …) · governance_unfreeze(&amp;cap, …) · governance_rotate_agent(&amp;cap, …)</code>
          <div className="abi-note">Read-only signal: skip the agent. Add the gate, read is_paused and *_current_bps in your own code, enforce it yourself.</div>
        </div>
      </div>
    </details>
  );
}

export function ConnectBand() {
  return (
    <section className="band connect">
      <div className="band-head">
        <span className="kicker">Connect your protocol</span>
        <span className="lede">deploy once → add the gate → run the agent — you keep the corridor and the cap</span>
      </div>

      <h2 className="connect-claim">
        Add four lines to your <code className="connect-claim-code">borrow()</code>. Seawall watches and enforces.
      </h2>

      <DiffCard />

      <div className="connect-seam">
        Runs in your vault, in the same PTB as a fresh Pyth update — and holds even if the agent is dead.
      </div>

      <StepStrip />

      <div className="connect-mode">
        <b className="cm-push">Active enforcement:</b> do all three. <b className="cm-pull">Read-only signal:</b> add the gate, read *_current_bps yourself, run no agent.
      </div>

      <LiveReceipt />

      <div className="connect-payoff">
        Your DAO keeps the corridor and the unfreeze cap. The agent holds nothing it must be trusted with.
      </div>

      <AbiReveal />
    </section>
  );
}
