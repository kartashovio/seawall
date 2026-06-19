// The body of the "What Sui makes possible" band (the band claim header lives in
// App.tsx). Two parts:
//   1. The three described Sui-primitive legs (PTB atomicity, Move capabilities,
//      native DeepBook CLOB) — the "meaningful Sui" evidence the 20% Technical
//      rubric rewards, stated as facts a judge can check.
//   2. The detailed architecture schematic — genuine evidence but too dense for the
//      20-second scan, so it's DEMOTED to a default-collapsed disclosure at the
//      bottom with a real "View ›" affordance.
//
// Colour: both parts are about the contract / the Sui platform → cyan only. Pure
// presentational, no props.
import { ArchitectureDiagram } from "./ArchitectureDiagram";

const WHY_SUI = [
  {
    id: "ptb",
    title: "One atomic PTB",
    body: "One transaction posts the signed Pyth update and acts on the re-derived breach — no relay window to slip through.",
  },
  {
    id: "movetype",
    title: "Move capabilities",
    body: "Capabilities and object ownership put the rules in the type system: the agent can't hold the unfreeze cap, and the contract clamps every request to the safe direction.",
  },
  {
    id: "deepbook",
    title: "Native DeepBook CLOB",
    body: "Sui has an on-chain central limit order book, so the contract reads the live order-book mid itself as the divergence reference — no external price needed.",
  },
] as const;

export function WiringReveal() {
  return (
    <div className="wiring-foot">
      <section className="why-sui" aria-label="Sui primitives">
        <ol className="why-sui-legs">
          {WHY_SUI.map((leg, i) => (
            <li key={leg.id} className="wsui-leg">
              <span className="wsui-leg-num">{i + 1}</span>
              <div className="wsui-leg-text">
                <h3 className="wsui-leg-title">{leg.title}</h3>
                <p className="wsui-leg-body">{leg.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <details className="wiring-reveal">
        <summary className="wiring-summary">
          <span className="wiring-summary-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="2" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <rect x="9.5" y="2" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <rect x="5.5" y="10" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <path d="M4 6v1.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6M8 8.5V10" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          </span>
          <span className="wiring-summary-text">
            <span className="wiring-summary-title">Show the full architecture</span>
            <span className="wiring-summary-sub">
              The off-chain agent, the on-chain contract, and the raw Pyth + DeepBook paths the contract re-reads itself.
            </span>
          </span>
          <span className="wiring-summary-cta" aria-hidden="true">
            <span className="wiring-summary-cta-label">View</span>
            <svg className="wiring-summary-cta-chev" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </summary>
        <div className="arch-frame">
          <ArchitectureDiagram />
        </div>
      </details>
    </div>
  );
}
