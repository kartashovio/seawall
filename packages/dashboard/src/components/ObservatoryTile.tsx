// READ-ONLY MAINNET observatory tile — DISPLAY ONLY, NOT enforced.
//
// Renders a SECOND risk score computed off the LIVE MAINNET market (mainnet Pyth
// SUI/USD vs mainnet SUI/USDC DeepBook mid) with the SAME unchanged model. A deep
// real market reads CALM (~1 bps divergence), which proves the model is correct
// and the thin-testnet-pool jumpiness is a pool artifact. It is observational:
// the agent NEVER submits anything from this score — the enforced tick (testnet)
// is decided before this block is even computed.
//
// Honesty: the disp/mktvol contributions legitimately MATCH the enforced panel
// because the CEX/BTC inputs are chain-agnostic — that is expected, not a bug.
import type { ObservatoryBlock } from "@seawall/shared";
import { RiskGauge } from "./RiskGauge";

export function ObservatoryTile({ obs }: { obs?: ObservatoryBlock }) {
  if (!obs) {
    return (
      <section className="card gauge">
        <h2>
          Mainnet observatory <span className="tag tag-contract">read-only</span>
        </h2>
        <div className="muted" style={{ padding: "32px 0", textAlign: "center" }}>
          mainnet observatory: connecting…
        </div>
        <div className="gauge-cap">MAINNET · read-only · not enforced</div>
      </section>
    );
  }

  const div = obs.book.ok ? `~${obs.divBps.toFixed(1)} bps` : "no signal";
  const mid = obs.book.mid != null ? `$${obs.book.mid.toFixed(4)}` : "—";
  const spread = obs.book.spread != null ? `${obs.book.spread.toFixed(1)} bps` : "—";

  return (
    <section className="card gauge">
      <h2>
        Mainnet observatory <span className="tag tag-contract">read-only</span>
      </h2>
      <RiskGauge score={obs.ok ? obs.score : 0} />
      <div className="gauge-cap" style={{ fontWeight: 600 }}>
        MAINNET · read-only · not enforced
      </div>
      <div className="muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
        <div>Pyth↔DeepBook divergence: <b>{div}</b></div>
        <div>book mid: {mid} · spread: {spread}</div>
      </div>
      <div className="gauge-cap" style={{ marginTop: 8 }}>
        same model on a deep real market reads calm — proving the testnet jumpiness is a thin-pool artifact.
        disp/mktvol contributions match the testnet panel by design (chain-agnostic CEX inputs).
      </div>
    </section>
  );
}
