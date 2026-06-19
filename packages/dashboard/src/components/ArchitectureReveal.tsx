// The full architecture schematic, default-collapsed. Lifted out of WiringReveal so
// it can stand as its own bare disclosure band between "how it works" and "what Sui
// makes possible" — the deep-dive of the how-it-works overview, one click away.
// The <summary> carries the only copy it needs (title + sub-line); no band header.
import { ArchitectureDiagram } from "./ArchitectureDiagram";

export function ArchitectureReveal() {
  return (
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
  );
}
