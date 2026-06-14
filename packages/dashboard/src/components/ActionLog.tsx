import type { GuardianEventRow, GuardianEventKind } from "../abi";
import { summarize, txUrl } from "../abi";

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

export function ActionLog({ events }: { events: GuardianEventRow[] }) {
  return (
    <section className="card">
      <h2>
        On-chain action log <span className="tag tag-contract">queryEvents · must-have #3</span>
      </h2>
      <div className="log-pin">
        Watch for <span className="c-agent">CLAMP (amber)</span> and <span className="c-contract">REJECT (coral)</span>:
        the contract refusing the agent. That's distrust, on-chain.
      </div>
      {events.length === 0 ? (
        <div className="muted">no guardian events yet — start the agent + keeper.</div>
      ) : (
        <div className="log">
          {events.map((e, i) => {
            const b = badge(e.kind);
            return (
              <div className={"logrow" + rowClass(e.kind)} key={e.digest + i}>
                <span className={"k " + b.cls}>{b.label}</span>
                <span>{summarize(e)}</span>
                <a className="digest mono" href={txUrl(e.digest)} target="_blank" rel="noreferrer">
                  {e.digest.slice(0, 8)}…
                </a>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
