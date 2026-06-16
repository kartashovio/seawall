// Must-have #4: human override. The DAO unfreezes via the OWNED &GovernanceCap —
// the button is disabled unless the connected wallet actually holds that cap, so
// the demo proves the override authority lives in the owned object, not the
// shared policy.
import { useState } from "react";
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClientQuery } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { CFG } from "../config";

const shortId = (id?: string): string => (id ? `${id.slice(0, 8)}…${id.slice(-4)}` : "—");

export function GovernancePanel({ paused }: { paused: boolean }) {
  const account = useCurrentAccount();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [msg, setMsg] = useState<string>("");

  const capId = CFG.governanceCapId;
  const { data: cap } = useSuiClientQuery(
    "getObject",
    { id: capId ?? "0x0", options: { showOwner: true } },
    { enabled: !!capId },
  );
  const capOwner = (cap?.data?.owner as any)?.AddressOwner as string | undefined;
  const ownsCap = !!account && !!capOwner && capOwner === account.address;

  const unfreeze = () => {
    if (!capId) return;
    const tx = new Transaction();
    tx.moveCall({
      target: `${CFG.packageId}::guardian::governance_unfreeze`,
      arguments: [tx.object(CFG.policyId), tx.object(capId), tx.object("0x6")],
    });
    setMsg("signing…");
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (r) => setMsg(`unfrozen ✓ ${r.digest.slice(0, 10)}`),
        onError: (e) => setMsg(`error: ${e.message.slice(0, 80)}`),
      },
    );
  };

  return (
    <section className="card governance">
      <h2>DAO override <span className="tag tag-dao">&amp;GovernanceCap · owned</span></h2>
      <p className="muted">
        The only way to unfreeze a hard stop. Authority is the owned cap — the agent
        can't reach it; a shared-object call can't bypass it.
      </p>
      <div className="gov-connect">
        <ConnectButton />
      </div>
      <div className="gov-row">
        <button className="btn btn-danger" onClick={unfreeze} disabled={!ownsCap || !paused || isPending}>
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
      </div>
      <p className="muted gov-foot">
        The freeze fires on the contract's own re-derived divergence; the keeper + inline floor keep enforcing even if
        the agent is dead. Only this owned cap re-opens the market.
      </p>
    </section>
  );
}
