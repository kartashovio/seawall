// The LIVE human-override console — ST1 must-have #4. The hero of the "Human
// override" band. Every control calls a `governance_*` fn that takes the OWNED
// &GovernanceCap as its 2nd arg, so each is disabled unless the connected wallet
// holds that cap. The authority to unfreeze / re-anchor the corridor / rotate the
// agent lives in the owned object — the agent can't reach it, and a shared-object
// call can't bypass it.
//
// IA: the UNFREEZE marquee leads (the must-have #4 override); re-anchor + rotate
// are the quieter cap-holder-only powers below it. `armed = ownsCap` flips the
// whole console locked→armed as one unit. Wallet logic is unchanged from the prior
// version — only the JSX structure + copy were restructured. The narrative claim,
// the authority axis, and the trust payoff live in the band wrapper (DaoConsoleBand).
import { useEffect, useState } from "react";
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClientQuery } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { CFG, pct } from "../config";
import { usePolicy } from "../useGuardian";

const shortId = (id?: string): string => (id ? `${id.slice(0, 8)}…${id.slice(-4)}` : "—");
const CLOCK = "0x6";

// percent (display) ↔ bps (on-chain). 55(%) ⇄ 5500. Clamped to [0, 10000].
const toBps = (p: string): number => Math.max(0, Math.min(10000, Math.round(parseFloat(p) * 100)));
const numOk = (p: string): boolean => p.trim() !== "" && Number.isFinite(parseFloat(p)) && parseFloat(p) >= 0 && parseFloat(p) <= 100;
const isAddr = (s: string): boolean => /^0x[0-9a-fA-F]{1,64}$/.test(s.trim());

export function GovernancePanel({ paused }: { paused: boolean }) {
  const account = useCurrentAccount();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [msg, setMsg] = useState<string>("");
  const policy = usePolicy();

  const capId = CFG.governanceCapId;
  const { data: cap } = useSuiClientQuery(
    "getObject",
    { id: capId ?? "0x0", options: { showOwner: true } },
    { enabled: !!capId },
  );
  const capOwner = (cap?.data?.owner as any)?.AddressOwner as string | undefined;
  const ownsCap = !!account && !!capOwner && capOwner === account.address;
  // One derived flag flips the whole console locked→armed as a unit.
  const armed = ownsCap;

  // Corridor + agent form, seeded once from the live on-chain policy.
  const [ltvFloor, setLtvFloor] = useState("");
  const [ltvBase, setLtvBase] = useState("");
  const [capFloor, setCapFloor] = useState("");
  const [capBase, setCapBase] = useState("");
  const [agentAddr, setAgentAddr] = useState("");
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (policy && !seeded) {
      setLtvFloor(String(pct(policy.maxLtvFloorBps)));
      setLtvBase(String(pct(policy.maxLtvBaselineBps)));
      setCapFloor(String(pct(policy.borrowCapFloorBps)));
      setCapBase(String(pct(policy.borrowCapBaselineBps)));
      setAgentAddr(policy.registeredAgent);
      setSeeded(true);
    }
  }, [policy, seeded]);

  const run = (label: string, build: (tx: Transaction) => void): void => {
    if (!capId) return;
    const tx = new Transaction();
    build(tx);
    setMsg(`${label}: signing…`);
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (r) => setMsg(`${label} ✓ ${r.digest.slice(0, 10)}`),
        onError: (e) => setMsg(`${label} error: ${e.message.slice(0, 90)}`),
      },
    );
  };

  const unfreeze = (): void =>
    run("unfreeze", (tx) =>
      tx.moveCall({
        target: `${CFG.packageId}::guardian::governance_unfreeze`,
        arguments: [tx.object(CFG.policyId), tx.object(capId!), tx.object(CLOCK)],
      }),
    );

  // floor <= baseline <= 100 for both params (mirrors the contract's assert).
  const corridorValid =
    [ltvFloor, ltvBase, capFloor, capBase].every(numOk) &&
    toBps(ltvFloor) <= toBps(ltvBase) &&
    toBps(capFloor) <= toBps(capBase);
  const setCorridor = (): void =>
    run("corridor", (tx) =>
      tx.moveCall({
        target: `${CFG.packageId}::guardian::governance_set_corridor`,
        arguments: [
          tx.object(CFG.policyId),
          tx.object(capId!),
          tx.pure.u16(toBps(ltvFloor)),
          tx.pure.u16(toBps(ltvBase)),
          tx.pure.u16(toBps(capFloor)),
          tx.pure.u16(toBps(capBase)),
          tx.object(CLOCK),
        ],
      }),
    );

  // Compare canonically: the chain returns registered_agent 0x-padded to 64 lower
  // hex, while a paste may be short/upper/zero-stripped — normalize both sides so
  // a logically-identical address is correctly seen as "same as current".
  const agentValid =
    isAddr(agentAddr) && normalizeSuiAddress(agentAddr.trim()) !== normalizeSuiAddress(policy?.registeredAgent ?? "0x0");
  const rotateAgent = (): void =>
    run("rotate", (tx) =>
      tx.moveCall({
        target: `${CFG.packageId}::guardian::governance_rotate_agent`,
        arguments: [tx.object(CFG.policyId), tx.object(capId!), tx.pure.address(normalizeSuiAddress(agentAddr.trim())), tx.object(CLOCK)],
      }),
    );

  const gate = !ownsCap || isPending;

  return (
    <section className={`card governance${armed ? " gov-armed" : ""}`}>
      <div className="gov-connect">
        <ConnectButton />
      </div>

      {/* live readout — the "armed frame" that makes locked controls read live, not
          broken. Folds the old top/foot duplication into one block. */}
      <div className="gov-status">
        <div className="gov-status-row">
          <span className="gov-status-lbl">policy state</span>
          <span className={paused ? "st st-frozen" : "st st-live"}>{paused ? "FROZEN" : "LIVE · unfrozen"}</span>
        </div>
        <div className="gov-status-row">
          <span className="gov-status-lbl">cap holder</span>
          <span className={`mono gov-status-val${ownsCap ? " gov-you" : ""}`}>
            {ownsCap ? "you ✓ · single key (demo)" : shortId(capOwner)}
          </span>
        </div>
        <div className="gov-status-row">
          <span className="gov-status-lbl">registered agent</span>
          <span className="mono gov-status-val">{shortId(policy?.registeredAgent)}</span>
        </div>
        <div className="gov-status-row">
          <span className="gov-status-lbl">GovernanceCap</span>
          <a className="mono gov-status-val" href={`${CFG.explorerObj}/${capId ?? ""}`} target="_blank" rel="noreferrer">
            {shortId(capId)}
          </a>
        </div>
      </div>

      {/* MARQUEE — the human override (must-have #4). Coral-framed only while frozen. */}
      <div className={`override-marquee${paused ? " is-frozen" : ""}`}>
        <div className="gov-act-head">
          <span className="gov-act-name marquee-name">Unfreeze the market</span>
          <span className="mono gov-fn">governance_unfreeze</span>
        </div>
        <p className="gov-act-note">
          The contract freezes on its own re-derived divergence. Only this owned cap unfreezes it.
        </p>
        <div className="gov-row">
          <button className="btn btn-danger marquee-btn" onClick={unfreeze} disabled={gate || !paused}>
            {isPending ? "Unfreezing…" : "Unfreeze (DAO)"}
          </button>
          <span className="muted">
            {!account
              ? "Connect the cap-holder wallet"
              : !ownsCap
                ? "This wallet doesn’t hold the GovernanceCap"
                : !paused
                  ? "Policy is live — nothing to unfreeze"
                  : "Ready — unfreezes the market"}
          </span>
        </div>
      </div>

      <div className="gov-secondary-head">Bounds &amp; agent — cap-holder only</div>

      {/* re-anchor the corridor (the one place a limit can move looser) */}
      <div className="gov-act">
        <div className="gov-act-head">
          <span className="gov-act-name">Re-anchor the corridor</span>
          <span className="mono gov-fn">governance_set_corridor</span>
        </div>
        <p className="gov-act-note">
          The bounds each limit lives in, in %. <b>Floor</b> = tightest (safety). <b>Baseline</b> = loosest. The agent
          moves <i>current</i> inside these; only you move the bounds.
        </p>
        <div className="gov-corridor">
          <span className="gov-cor-lbl">Max LTV</span>
          <label className="gov-field">
            <span>floor</span>
            <input className="gov-input" inputMode="decimal" aria-label="Max LTV floor, percent" value={ltvFloor} onChange={(e) => setLtvFloor(e.target.value)} />
          </label>
          <label className="gov-field">
            <span>baseline</span>
            <input className="gov-input" inputMode="decimal" aria-label="Max LTV baseline, percent" value={ltvBase} onChange={(e) => setLtvBase(e.target.value)} />
          </label>
          <span className="gov-cor-lbl">Borrow cap</span>
          <label className="gov-field">
            <span>floor</span>
            <input className="gov-input" inputMode="decimal" aria-label="Borrow cap floor, percent" value={capFloor} onChange={(e) => setCapFloor(e.target.value)} />
          </label>
          <label className="gov-field">
            <span>baseline</span>
            <input className="gov-input" inputMode="decimal" aria-label="Borrow cap baseline, percent" value={capBase} onChange={(e) => setCapBase(e.target.value)} />
          </label>
        </div>
        <div className="gov-row">
          <button className="btn" onClick={setCorridor} disabled={gate || !corridorValid}>
            {isPending ? "Setting…" : "Set corridor (DAO)"}
          </button>
          <span className="muted">
            {!account
              ? "Connect the cap-holder wallet"
              : !ownsCap
                ? "This wallet doesn’t hold the GovernanceCap"
                : !corridorValid
                  ? "need 0 ≤ floor ≤ baseline ≤ 100"
                  : "Ready — current re-clamps into the new bounds"}
          </span>
        </div>
      </div>

      {/* rotate the registered agent */}
      <div className="gov-act">
        <div className="gov-act-head">
          <span className="gov-act-name">Rotate the agent</span>
          <span className="mono gov-fn">governance_rotate_agent</span>
        </div>
        <p className="gov-act-note">
          The address allowed to submit ParamRequests. The contract clamps any agent — this changes <i>who</i> may ask,
          not what they can do.
        </p>
        <div className="gov-row">
          <input
            className="gov-input gov-input--addr mono"
            placeholder="0x… new agent address"
            aria-label="New agent address"
            value={agentAddr}
            onChange={(e) => setAgentAddr(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="gov-row">
          <button className="btn" onClick={rotateAgent} disabled={gate || !agentValid}>
            {isPending ? "Rotating…" : "Rotate agent (DAO)"}
          </button>
          <span className="muted">
            {!account
              ? "Connect the cap-holder wallet"
              : !ownsCap
                ? "This wallet doesn’t hold the GovernanceCap"
                : !isAddr(agentAddr)
                  ? "enter a valid address"
                  : !agentValid
                    ? "same as the current agent"
                    : "Ready — rotates to the new address"}
          </span>
        </div>
      </div>

      {msg && <div className="gov-msg mono">{msg}</div>}
    </section>
  );
}
