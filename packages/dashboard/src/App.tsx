import { ConnectButton } from "@mysten/dapp-kit";
import { useAgentStream } from "./useAgentStream";
import { useGuardianEvents, usePolicy } from "./useGuardian";
import { CFG, CORRIDOR } from "./config";
import { ScoreCard } from "./components/ScoreCard";
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

  // Which environment the agent ENFORCES on — a STATUS MIRROR read straight off
  // the SSE tick (never a dashboard hardcode). Defaults to "testnet" before the
  // first frame so a stale/early SSE frame can't blank the indicator. The two
  // score cards + the header pill light purely from (env === enforcedEnv); there
  // is NO control that re-routes enforcement.
  const enforcedEnv = latest?.enforcedEnv ?? "testnet";
  const obs = latest?.observatory;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <img src="/logo.svg" alt="Seawall" />
          <div>
            <h1>Seawall</h1>
            <div className="sub">
              Autonomous Risk Guardian
              <span className={`env-pill env-${enforcedEnv}`}>ENFORCING ▸ {enforcedEnv.toUpperCase()}</span>
            </div>
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

      <div className="grid grid-2">
        <ScoreCard
          env="testnet"
          enforced={enforcedEnv === "testnet"}
          score={latest?.scoreOverall ?? 0}
          divBps={latest?.divBps}
          book={latest?.book}
          available={!!latest}
        />
        <ScoreCard
          env="mainnet"
          enforced={enforcedEnv === "mainnet"}
          score={obs?.ok ? obs.score : 0}
          divBps={obs?.divBps}
          book={obs?.book}
          available={!!obs}
        />
      </div>

      {/* Honest cold-start caveat: the EWMA-Mahalanobis baseline + the velocity
          window (~30 ticks) re-warm from scratch on every (re)start, so for the
          first ~30 min a score can read elevated before it settles. Stated up
          front so an early-load viewer reads a high needle as warm-up, not alarm. */}
      <div className="muted warmup-note">
        ℹ️ Cold-start caveat: for ~30 min after a (re)start the model is still warming up its rolling
        baseline and may over-react — scores settle once the velocity window fills.
      </div>

      <div className="grid grid-2">
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
