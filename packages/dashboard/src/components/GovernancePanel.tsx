// Must-have #4: human override — and the full DAO surface the &GovernanceCap
// gates. Every control here calls a `governance_*` fn that takes the OWNED
// &GovernanceCap as its 2nd arg, so each is disabled unless the connected wallet
// actually holds that cap. This proves the authority to unfreeze / re-anchor the
// corridor / rotate the agent lives in the owned object, never in the shared
// policy (and never in the agent).
//
//   • Unfreeze        governance_unfreeze       — the only way out of a hard stop
//   • Re-anchor       governance_set_corridor   — move the [floor, baseline] bounds
//   • Rotate agent    governance_rotate_agent   — swap the registered submitter
//
// The corridor is the ONLY place a limit can move looser instantly — by the cap
// owner, never the agent (the agent is a one-way ratchet toward safer).
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
    <section className="card governance">
      <h2>
        DAO controls <span className="tag tag-dao">&amp;GovernanceCap · owned</span>
      </h2>
      <p className="muted">
        The road toward <i>riskier</i> — the only authority that can unfreeze, loosen the limits, or rotate the
        agent. It lives in the owned cap: the agent can't reach it, and a shared-object call can't bypass it.
      </p>
      <div className="gov-connect">
        <ConnectButton />
      </div>

      {/* 1 — unfreeze (the must-have #4 override) */}
      <div className="gov-act">
        <div className="gov-act-head">
          <span className="gov-act-name">Unfreeze the market</span>
          <span className="mono gov-fn">governance_unfreeze</span>
        </div>
        <div className="gov-row">
          <button className="btn btn-danger" onClick={unfreeze} disabled={gate || !paused}>
            {isPending ? "…" : "Unfreeze (DAO)"}
          </button>
          <span className="muted">
            {!account
              ? "connect the cap-holder wallet"
              : !ownsCap
                ? "wallet does not hold the GovernanceCap"
                : !paused
                  ? "policy is not frozen"
                  : "ready"}
          </span>
        </div>
      </div>

      {/* 2 — re-anchor the corridor (the one place a limit can move looser) */}
      <div className="gov-act">
        <div className="gov-act-head">
          <span className="gov-act-name">Re-anchor the corridor</span>
          <span className="mono gov-fn">governance_set_corridor</span>
        </div>
        <p className="gov-act-note">
          The bounds each limit lives in, in %. <b>Floor</b> = tightest (safety), <b>baseline</b> = loosest. The
          agent moves <i>current</i> only within these; only the DAO moves the bounds.
        </p>
        <div className="gov-corridor">
          <span className="gov-cor-lbl">Max LTV</span>
          <label className="gov-field">
            <span>floor</span>
            <input className="gov-input" inputMode="decimal" value={ltvFloor} onChange={(e) => setLtvFloor(e.target.value)} />
          </label>
          <label className="gov-field">
            <span>baseline</span>
            <input className="gov-input" inputMode="decimal" value={ltvBase} onChange={(e) => setLtvBase(e.target.value)} />
          </label>
          <span className="gov-cor-lbl">Borrow cap</span>
          <label className="gov-field">
            <span>floor</span>
            <input className="gov-input" inputMode="decimal" value={capFloor} onChange={(e) => setCapFloor(e.target.value)} />
          </label>
          <label className="gov-field">
            <span>baseline</span>
            <input className="gov-input" inputMode="decimal" value={capBase} onChange={(e) => setCapBase(e.target.value)} />
          </label>
        </div>
        <div className="gov-row">
          <button className="btn" onClick={setCorridor} disabled={gate || !corridorValid}>
            {isPending ? "…" : "Set corridor (DAO)"}
          </button>
          <span className="muted">
            {!ownsCap ? "cap-holder only" : !corridorValid ? "need 0 ≤ floor ≤ baseline ≤ 100" : "current clamps into the new bounds"}
          </span>
        </div>
      </div>

      {/* 3 — rotate the registered agent */}
      <div className="gov-act">
        <div className="gov-act-head">
          <span className="gov-act-name">Rotate the agent</span>
          <span className="mono gov-fn">governance_rotate_agent</span>
        </div>
        <p className="gov-act-note">
          The address allowed to submit ParamRequests. The clamp still bounds any agent — this only changes <i>who</i> may ask.
        </p>
        <div className="gov-row">
          <input
            className="gov-input gov-input--addr mono"
            placeholder="0x… new agent address"
            value={agentAddr}
            onChange={(e) => setAgentAddr(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="gov-row">
          <button className="btn" onClick={rotateAgent} disabled={gate || !agentValid}>
            {isPending ? "…" : "Rotate agent (DAO)"}
          </button>
          <span className="muted">
            {!ownsCap ? "cap-holder only" : !isAddr(agentAddr) ? "enter a valid address" : !agentValid ? "same as current" : "ready"}
          </span>
        </div>
      </div>

      {msg && <div className="gov-msg mono">{msg}</div>}

      <div className="gov-meta">
        <div className="row">
          <span className="lbl">policy state</span>
          <span className={paused ? "st st-frozen" : "st st-live"}>{paused ? "FROZEN" : "LIVE · unfrozen"}</span>
        </div>
        <div className="row">
          <span className="lbl">GovernanceCap</span>
          <a className="mono" href={`${CFG.explorerObj}/${capId ?? ""}`} target="_blank" rel="noreferrer">
            {shortId(capId)}
          </a>
        </div>
        <div className="row">
          <span className="lbl">cap holder</span>
          <span className="mono">{ownsCap ? "you ✓" : shortId(capOwner)}</span>
        </div>
        <div className="row">
          <span className="lbl">registered agent</span>
          <span className="mono">{shortId(policy?.registeredAgent)}</span>
        </div>
      </div>
      <p className="muted gov-foot">
        The freeze fires on the contract's own re-derived divergence; the keeper + inline floor keep enforcing even if
        the agent is dead. Only this owned cap moves the system back toward riskier.
      </p>
    </section>
  );
}
