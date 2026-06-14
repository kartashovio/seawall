import type { GuardianEventRow, GuardianEventKind } from "../abi";
import { summarize, txUrl } from "../abi";

// Map a guardian event kind → (badge css class, short label). The clamp/reject
// rows are the trust-min money shot, so they also get an accent left-border.
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

// Accent the rows that prove "the agent's number is never trusted": clamped
// (amber) and rejected (red) get a thick left border that makes them pop.
function accent(kind: GuardianEventKind): React.CSSProperties {
  if (kind === "RequestClamped") return { borderLeft: "3px solid var(--amber)" };
  if (kind === "RequestRejected") return { borderLeft: "3px solid var(--red)" };
  return {};
}

export function ActionLog({ events }: { events: GuardianEventRow[] }) {
  return (
    <section className="card">
      <h2>
        On-chain action log <span className="tag tag-contract">queryEvents · must-have #3</span>
      </h2>
      {events.length === 0 ? (
        <div className="muted">no guardian events yet — start the agent + keeper.</div>
      ) : (
        <div className="log">
          {events.map((e, i) => {
            const b = badge(e.kind);
            return (
              <div className="logrow" key={e.digest + i} style={accent(e.kind)}>
                <span className={"k " + b.cls}>{b.label}</span>
                <span>{summarize(e)}</span>
                <a
                  className="digest mono"
                  href={txUrl(e.digest)}
                  target="_blank"
                  rel="noreferrer"
                >
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
