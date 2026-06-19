// "Connect your protocol" — the guardian-as-a-service ADOPTION band (Real-World 50%).
// Lives near the END of the page (after the proof + the drill): it's integration
// guidance, not primary product presentation. It does NOT re-teach the L1/L2/L3
// ladder; it is a COMPLETE, ordered self-deploy checklist a protocol owner ticks
// off to run their OWN guardian — no Seawall involvement.
//
// IA (judge-panel design): the seas-intro claim → the drop-in DIFF hero (Step 2's
// artifact) → SEAM → a PUSH/PULL mode picker → a vertical 6-step ladder (deploy →
// gate → fund → agent → keeper → govern), each one infostyle line with the real
// command/ABI behind a per-step disclosure → live RECEIPT → trust PAYOFF.
//
// TRUST RAILS held verbatim: the agent is the only UNTRUSTED step (amber, tagged,
// one-way-ratchet clamp); FREEZE is contract-only; UNFREEZE/widen-corridor/rotate
// are GovernanceCap-only; the 0–100 score is event-only; the keeper uses its OWN
// throwaway key. All ABI/commands are real, verified against packages/guardian +
// agent + keeper source. Only the mode toggle is interactive (one useState).
import { useState } from "react";
import { CFG } from "../config";

const short = (id?: string) => (id && id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id || "—");

// The hero artifact: the literal change a vault makes to each risk-increasing path.
// The SAME five `+` lines (the policy-id binding, poke, the freeze-check, and the two
// live-cap asserts) go in both borrow() and withdraw_collateral(). The price read is a
// context line that consumes `d`. is_paused carries the lone coral hairline (frozen →
// abort). This is Step 2.
const DIFF: { t: string; add?: boolean; freeze?: boolean; comment?: boolean }[] = [
  { t: "// in borrow() and withdraw_collateral() — same PTB as a fresh Pyth update", comment: true },
  { t: "assert!(object::id(policy) == vault.policy_id, EPolicyMismatch);", add: true },
  { t: "let d = guardian::poke(&mut policy, &pio, &pool, &clock);", add: true },
  { t: "assert!(!guardian::is_paused(&policy), EFrozen);", add: true, freeze: true },
  { t: "let coll = coll_value(divergence::pyth_px_1e9(&d));" },
  { t: "assert!(debt * BPS <= guardian::max_ltv_current_bps(&policy) * coll, ELtvExceeded);", add: true },
  { t: "assert!(debt * BPS <= guardian::borrow_cap_current_bps(&policy) * coll, EBorrowCapExceeded);", add: true },
];

function DiffCard() {
  return (
    <div className="card diff-card">
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
      <div className="diff-cap">This is the gate (Step 2). It re-derives the breach on-chain.</div>
    </div>
  );
}

// ── the 6-step ladder ─────────────────────────────────────────────────────────
// mode: "both" = PUSH and PULL; "push" = active enforcement only (dims in PULL).
// mod drives the colour: dao (blue) = you/DAO, contract (cyan) = on-chain, agent
// (amber) = the untrusted off-chain model.
type Mod = "dao" | "contract" | "agent";
interface Step {
  n: string;
  mod: Mod;
  title: string;
  sub: string;
  mode: "both" | "push";
  untrusted?: boolean;
  reveal: string; // summary on the disclosure
  code: string;
  note: string;
  prod?: string; // demo → prod caveat
}

const STEPS: Step[] = [
  {
    n: "1",
    mod: "dao",
    title: "Deploy your policy",
    mode: "both",
    sub: "create_policy against the already-published package returns a shared GuardianPolicy + an owned GovernanceCap you transfer to your DAO. You set every bound; the cap is yours, never ours.",
    reveal: "create_policy — the 16 args + the cap transfer",
    code: `const tx = new Transaction();
const cap = tx.moveCall({
  target: \`\${PKG}::guardian::create_policy\`,
  arguments: [
    tx.pure.address(AGENT_ADDR),      // registered_agent — who may submit (rotatable)
    tx.pure.vector("u8", feedId32),   // Pyth SUI/USD feed id — 32 raw bytes
    tx.pure.id(POOL_ID),              // expected_pool_id — asserted on every read
    tx.pure.u16(5500), tx.pure.u16(7500),    // max_ltv  floor / baseline (bps)
    tx.pure.u16(4000), tx.pure.u16(10000),   // borrow_cap floor / baseline (bps)
    tx.pure.u128(50_000_000),   // threshold_t  — FREEZE at 5% divergence
    tx.pure.u128(10_000_000),   // d_caution    — CAUTION onset at 1%
    tx.pure.u128(10_000_000),   // conf_frac_max
    tx.pure.u64(60),            // max_age_secs — Pyth staleness, seconds
    tx.pure.u8(9), tx.pure.u8(6),            // base / quote decimals (SUI / DBUSDC)
    tx.pure.u64(600_000), tx.pure.u64(600_000),  // all_clear_window / relax_cooldown (ms)
    tx.pure.u16(1000),          // relax_step_frac_bps — 10% of span per step
    tx.object("0x6"),           // Clock
  ],
});
tx.transferObjects([cap], tx.pure.address(DAO_ADDR)); // the cap leaves the deployer`,
    note: "16 positional args + the Clock; the call SHARES the policy and RETURNS the GovernanceCap, so the PTB must transfer it. expected_pool_id and feed_id are asserted on every read — no caller can swap in a fake-calm pool or a different feed. Bounds shown are our testnet corridor (max_ltv 55–75%, borrow_cap 40–100%, FREEZE 5%, CAUTION 1%).",
    prod: "single key in this demo → a DAO multisig holds the cap in production.",
  },
  {
    n: "2",
    mod: "contract",
    title: "Add the gate",
    mode: "both",
    sub: "The five lines above, in every borrow() and withdraw_collateral() — every path that raises risk. The policy-id binding ties the call to your vault, poke re-derives the breach on-chain, the freeze check fails CLOSED, the two asserts read the live caps. It holds even if the agent is dead.",
    reveal: "the full gate + the type-arg-order trap",
    code: `// in borrow() and withdraw_collateral() — same PTB as a fresh Pyth update
assert!(object::id(policy) == vault.policy_id, EPolicyMismatch);
let d = guardian::poke(&mut policy, &pio, &pool, &clock);   // re-derives + writes state
assert!(!guardian::is_paused(&policy), EFrozen);            // fail-CLOSED on freeze
let coll = coll_value(divergence::pyth_px_1e9(&d));         // one price read, no TOCTOU
assert!(debt * BPS <= guardian::max_ltv_current_bps(&policy)    * coll, ELtvExceeded);
assert!(debt * BPS <= guardian::borrow_cap_current_bps(&policy) * coll, EBorrowCapExceeded);`,
    note: "deposit and repay are toward-safe and stay ungated. ⚠️ Type-arg order differs by family: guardian::poke<Base,Quote> = [SUI, DBUSDC], but a DemoVault<Quote,Base> = [DBUSDC, SUI]. Never copy type args between the two — transposing gives a bare Move type-mismatch with no hint it's the order.",
  },
  {
    n: "3",
    mod: "dao",
    title: "Get the source & fund gas",
    mode: "both",
    sub: "Install the CLI, clone the open-source repo, fund the address that deploys (and, in PUSH, runs). Calm markets cost ≈0 — the agent sends only when risk warrants.",
    reveal: "install · clone · faucet",
    code: `# install the Sui CLI at the testnet pin (suiup / brew / prebuilt release tarball)
sui --version                             # confirm the pin matches the Move framework rev
sui client faucet                         # testnet gas (mainnet = real SUI, no faucet)
git clone https://github.com/kartashovio/seawall.git
cd seawall && pnpm install                # your deployed ids are written to config/testnet.json`,
    note: "Adoption reuses the single published package — no republish needed. For full upgrade-authority sovereignty you may fork, re-pin Move.toml to mainnet revs, publish your own copy, and point create_policy at it; the ABI is identical.",
  },
  {
    n: "4",
    mod: "agent",
    title: "Run your agent",
    mode: "push",
    untrusted: true,
    sub: "The ML detector scores the market every ~60s and posts ONE PTB — a fresh Pyth update plus a tighter-only request — only when it would tighten or on a 5-min heartbeat. Its score is an event field, never on the decision path. The agent is replaceable; the contract clamps any model.",
    reveal: "run command · the submit PTB · the clamp",
    code: `# loads the registered_agent key at RUNTIME from the CLI keystore
# (sui keytool export …) — never hardcoded, never an env var. Only env: AGENT_PORT.
pnpm --filter @seawall/agent exec tsx src/index.ts

// the submit PTB — sender must equal policy.registered_agent
const data  = await conn.getPriceFeedsUpdateData([feedId]);      // hermes-beta
const [pio] = await pythClient.updatePriceFeeds(tx, data, [feedId]);
const req   = tx.moveCall({ target: \`\${PKG}::guardian::new_param_request\`,
              arguments: [tx.pure.u16(maxLtvTarget), tx.pure.u16(borrowCapTarget)] });
tx.moveCall({ target: \`\${PKG}::guardian::submit\`, typeArguments: [SUI, DBUSDC],
  arguments: [tx.object(policy), tx.object(pio), tx.object(pool), tx.object(clock), req, tx.pure.u8(advisoryScore)] });`,
    note: "Sends IFF (A) the request tightens max_ltv or borrow_cap below the on-chain current AND the 1-min resubmit cooldown has passed, OR (B) a 5-min heartbeat elapsed (calm = 0 tx). The contract takes min(clamp(ask,[floor,baseline]), its own target); a looser ask is refused on-chain (RequestRejected, no tx failure) — the one-way ratchet.",
    prod: "CLI-keystore key in this demo → a secret manager / KMS in production.",
  },
  {
    n: "5",
    mod: "contract",
    title: "Run your keeper",
    mode: "push",
    sub: "A permissionless, params-less poke() every 5 min from its OWN throwaway key — not the agent's. It keeps the contract re-deriving (so the contract-only FREEZE fires and the gated RELAX can resume) even if the agent dies. A missed poke is safe — fail-CLOSED.",
    reveal: "run command · key precedence · gas",
    code: `pnpm --filter @seawall/keeper dev
# key: KEEPER_KEY (bech32 env) → gitignored packages/keeper/.keeper.key (0600)
#      → auto-generated + saved on first run. One-time 0.2 SUI top-up from the deployer.

const [pio] = await pythClient.updatePriceFeeds(tx, data, [feedId]);
tx.moveCall({ target: \`\${PKG}::guardian::poke\`, typeArguments: [SUI, DBUSDC],
  arguments: [tx.object(policy), tx.object(pio), tx.object(pool), tx.object(clock)] }); // return discarded`,
    note: "It refuses to start if its key equals registered_agent — the proof that poke is permissionless (it chooses only WHEN to poke a deterministic function, never the outcome). A broke or dead keeper is safe: the inline floor still protects; only the liveness heartbeat + gated RELAX pause.",
    prod: "testnet faucet in this demo → a pre-funded ops wallet on mainnet (no faucet).",
  },
  {
    n: "6",
    mod: "dao",
    title: "Govern & monitor",
    mode: "both",
    sub: "Your DAO holds the GovernanceCap — the only way to unfreeze, widen the corridor, or rotate the agent. The agent and the permissionless paths touch none of it. Monitor everything with permissionless queryEvents — no cap needed (this is the whole PULL loop).",
    reveal: "the 3 governance calls · the events to watch",
    code: `// &GovernanceCap is the 2nd arg every time — an owned object, never in the policy
governance_unfreeze(policy, cap, clock);             // absolute; re-freezes if breach persists
governance_set_corridor(policy, cap, …, clock);      // the only instant-loosen (re-clamps current)
governance_rotate_agent(policy, cap, newAgent, clock); // swap the off-chain model

// monitor — permissionless, no cap (this IS the PULL operating loop)
queryEvents({ query: \`\${PKG}::guardian::RiskEvaluated\` }); // advisory_score, div_own, applied caps
is_paused(policy) · max_ltv_current_bps(policy) · borrow_cap_current_bps(policy)`,
    note: "Also emitted: Frozen (contract-only, cause 0 = div≥T / 1 = book-not-ok), RequestClamped, RequestRejected, Unfrozen, CorridorChanged, AgentRotated. PULL correctness: read is_paused + the two *_current_bps in the SAME PTB as the price and enforce them yourself — never cache them across txs; the corridor moves and a stale read is a stale gate.",
  },
];

function StepRow({ s, dim }: { s: Step; dim: boolean }) {
  return (
    <div className={`cstep cstep--${s.mod} lstep`} aria-disabled={dim || undefined}>
      <div className="cstep-top">
        <span className="cstep-chip">{s.n}</span>
        <span className="cstep-label">{s.title}</span>
        {s.mode === "push" && <span className="lstep-mode">PUSH only</span>}
        {s.untrusted && <span className="tag tag-agent cstep-untrusted">untrusted</span>}
      </div>
      <div className="cstep-sub">{s.sub}</div>
      <details className="wiring-reveal cstep-reveal">
        <summary>{s.reveal}</summary>
        <div className="abi-body">
          <code className="abi-code abi-wrap">{s.code}</code>
          <div className="abi-note">{s.note}</div>
          {s.prod && (
            <div className="abi-note cstep-prod">
              <b>demo → prod:</b> {s.prod}
            </div>
          )}
        </div>
      </details>
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

export function ConnectBand() {
  const [mode, setMode] = useState<"push" | "pull">("push");

  return (
    <section className={`band connect${mode === "pull" ? " is-pull" : ""}`}>
      <div className="seas-intro">
        <h2 className="hero-claim-line seas-claim-line">Add the guardian to any Sui lending protocol.</h2>
        <p className="hero-claim-body">
          One package, already published and immutable. You deploy your own policy against it, add a five-line gate to
          every borrow path, then pick how far you go: read its signal and enforce it yourself, or grant a scoped cap
          and let the guardian enforce <span className="c-contract">in-block</span>. Your{" "}
          <span className="c-dao">DAO keeps the corridor and the only unfreeze cap</span>. The{" "}
          <span className="c-agent">agent is never trusted</span> — the contract clamps it to the safe direction and
          re-derives the breach itself.
        </p>
      </div>

      <DiffCard />

      <div className="connect-seam">
        Runs in your vault, in the same PTB as a fresh Pyth update — and holds even if the agent is dead.
      </div>

      {/* PUSH / PULL mode picker — the one interactive control. */}
      <div className="connect-mode-pick" role="tablist" aria-label="Adoption mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "push"}
          className={`cmp-tab${mode === "push" ? " is-on" : ""}`}
          onClick={() => setMode("push")}
        >
          Active enforcement <span className="cmp-sub">PUSH</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "pull"}
          className={`cmp-tab${mode === "pull" ? " is-on" : ""}`}
          onClick={() => setMode("pull")}
        >
          Read-only signal <span className="cmp-sub">PULL</span>
        </button>
      </div>
      <p className="connect-mode">
        {mode === "push" ? (
          <>
            Do <b className="cm-push">all six</b> steps. The guardian tightens your params in-block; the contract clamps
            the agent to safer-only.
          </>
        ) : (
          <>
            Do steps <b className="cm-pull">1–3 and 6</b>. Read <code className="connect-claim-code">is_paused</code> and{" "}
            <code className="connect-claim-code">*_current_bps</code> in your own vault code and enforce them yourself —
            no agent, no ML to run. A keeper (or any caller) still pokes to keep state fresh.
          </>
        )}
      </p>

      <div className="connect-ladder">
        {STEPS.map((s) => (
          <StepRow key={s.n} s={s} dim={mode === "pull" && s.mode === "push"} />
        ))}
      </div>

      <LiveReceipt />

      <div className="connect-payoff">
        Your DAO keeps the corridor and the unfreeze cap. The agent holds nothing it must be trusted with.
      </div>
    </section>
  );
}
