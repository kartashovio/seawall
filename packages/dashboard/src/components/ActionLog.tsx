import type { GuardianEventRow, GuardianEventKind } from "../abi";
import { summarize, txUrl } from "../abi";
import { agoText } from "./KeeperStatus";

// Map a guardian event kind → (badge css class, short label). The clamp/reject
// rows are the trust-min money shot, so they also get a loud accent treatment.
function badge(kind: GuardianEventKind): { cls: string; label: string } {
  switch (kind) {
    case "RiskEvaluated":
      return { cls: "k-risk", label: "RISK" };
    case "RequestClamped":
      return { cls: "k-clamp", label: "CLAMP" };
    case "RequestRejected":
      return { cls: "k-reject", label: "REJECT" };
    case "Frozen":
      return { cls: "k-frozen", label: "FROZEN" };
    case "Unfrozen":
      return { cls: "k-dao", label: "DAO" };
    case "CorridorChanged":
      return { cls: "k-dao", label: "CORR" };
    case "AgentRotated":
      return { cls: "k-dao", label: "ROTATE" };
    case "PolicyCreated":
      return { cls: "k-dao", label: "INIT" };
    default:
      return { cls: "k-dao", label: "EVENT" };
  }
}

// The rows that prove "the agent's number is never trusted": clamped (amber) and
// rejected (coral) get a loud left border + wash + a one-shot strike flash. Frozen
// gets a coral edge too.
function rowClass(kind: GuardianEventKind): string {
  if (kind === "RequestClamped") return " clamp";
  if (kind === "RequestRejected") return " reject";
  if (kind === "Frozen") return " frozen";
  return "";
}

// Compact on-chain action log — now the final sub-panel of the "Risk history" card
// (the chart plots WHEN score+params moved; this is the on-chain receipt for each
// move). Capped at the 8 newest rows (no internal scroll); the header tally
// front-loads the clamp/reject money-shot. Events arrive newest-first.
const CAP = 8;

export function ActionLog({ events }: { events: GuardianEventRow[] }) {
  const clampCount = events.filter((e) => e.kind === "RequestClamped").length;
  const rejectCount = events.filter((e) => e.kind === "RequestRejected").length;
  const shown = events.slice(0, CAP);
  const hiddenCount = Math.max(0, events.length - CAP);

  return (
    <div className="rc-actionlog">
      {/* sub-header — replaces the lost band's "every action is a real on-chain
          event" h2 at card altitude (caption + tally + the queryEvents proof tag) */}
      <div className="rc-substrip-head">
        <span className="rc-substrip-lbl">↳ testnet · on-chain action log</span>
        <span className="al-count">
          {events.length} events
          {clampCount > 0 ? ` · ${clampCount} clamped` : ""}
          {rejectCount > 0 ? ` · ${rejectCount} rejected` : ""}
        </span>
        <span className="tag tag-contract">queryEvents · explorer-linked</span>
      </div>

      {/* the distrust money-shot pin — c-breach is sanctioned ONLY inside .log-pin */}
      <div className="log-pin">
        Watch for <span className="c-agent">CLAMP</span> and <span className="c-breach">REJECT</span>: the contract
        refusing the agent's number. Distrust, on-chain.
      </div>

      {events.length === 0 ? (
        <div className="muted al-empty">
          No guardian events in this window. Each agent submit or keeper poke lands here as a transaction.
        </div>
      ) : (
        <div className="log">
          {shown.map((e, i) => {
            const b = badge(e.kind);
            return (
              <div className={"logrow" + rowClass(e.kind)} key={e.digest + i}>
                <span className={"k " + b.cls}>{b.label}</span>
                <span className="al-sum">{summarize(e)}</span>
                <span className="al-meta">
                  <span className="al-ago">{agoText(Date.now() - e.tsMs)}</span>
                  <a className="digest mono" href={txUrl(e.digest)} target="_blank" rel="noreferrer">
                    {e.digest.slice(0, 8)}…
                  </a>
                </span>
              </div>
            );
          })}
          {hiddenCount > 0 && <div className="al-more muted">+{hiddenCount} earlier events</div>}
        </div>
      )}
    </div>
  );
}
