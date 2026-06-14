import { ConnectButton } from "@mysten/dapp-kit";
import { useAgentStream } from "./useAgentStream";
import { useGuardianEvents, usePolicy } from "./useGuardian";
import { CFG, CORRIDOR } from "./config";
import { RiskGauge } from "./components/RiskGauge";
import { ModelInternals } from "./components/ModelInternals";
import { ActionLog } from "./components/ActionLog";
import { GovernancePanel } from "./components/GovernancePanel";
import { AttackPanel } from "./components/AttackPanel";
import { LayerStatus } from "./components/LayerStatus";

export function App() {
  const { latest, connected } = useAgentStream();
  const events = useGuardianEvents();
  const policy = usePolicy();

  const paused = policy?.paused ?? latest?.paused ?? false;
  const applied =
    latest?.applied ??
    (policy
      ? { maxLtv: policy.maxLtvCurrentBps, borrowCap: policy.borrowCapCurrentBps }
      : { maxLtv: CORRIDOR.maxLtv.baseline, borrowCap: CORRIDOR.borrowCap.baseline });
  const floor = latest?.floor ?? { maxLtv: CORRIDOR.maxLtv.floor, borrowCap: CORRIDOR.borrowCap.floor };
  const baseline = latest?.baseline ?? { maxLtv: CORRIDOR.maxLtv.baseline, borrowCap: CORRIDOR.borrowCap.baseline };

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <img src="/logo.svg" alt="Seawall" />
          <div>
            <h1>Seawall</h1>
            <div className="sub">Autonomous Risk Guardian · Sui testnet</div>
          </div>
        </div>
        <div className="spacer" />
        <span className="muted" style={{ marginRight: 14 }}>
          <span className={`dot ${connected ? "dot-ok" : "dot-bad"}`} />
          {connected ? "agent live" : "agent offline"}
        </span>
        <ConnectButton />
      </header>

      {paused && (
        <div className="frozen-banner">🧊 MARKET FROZEN — contract-only hard stop. Only the DAO can unfreeze.</div>
      )}

      <div className="grid grid-3">
        <RiskGauge score={latest?.scoreOverall ?? 0} />
        <LayerStatus tick={latest} paused={paused} events={events} />
        <GovernancePanel paused={paused} />
      </div>

      <div className="grid grid-2">
        <ModelInternals
          d2={latest?.d2 ?? 0}
          k={latest?.k ?? 5}
          contributions={latest?.contributions ?? {}}
          solvency={latest?.solvency ?? 0}
          liquidity={latest?.liquidity ?? 0}
          applied={applied}
          floor={floor}
          baseline={baseline}
        />
        <ActionLog events={events} />
      </div>

      <div className="grid">
        <AttackPanel agentUrl={CFG.agentUrl} />
      </div>
    </div>
  );
}
