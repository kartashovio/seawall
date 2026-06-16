import { useEffect } from "react";
import { ConnectButton } from "@mysten/dapp-kit";
import { useAgentStream } from "./useAgentStream";
import { useGuardianEvents, usePolicy } from "./useGuardian";
import { CFG, CORRIDOR } from "./config";
import { ScoreCard } from "./components/ScoreCard";
import { Sparkline } from "./components/Sparkline";
import { WarmupStatus } from "./components/WarmupStatus";
import { PostureBanner } from "./components/PostureBanner";
import { ArchitectureDiagram } from "./components/ArchitectureDiagram";
import { ModelInternals } from "./components/ModelInternals";
import { ActionLog } from "./components/ActionLog";
import { GovernancePanel } from "./components/GovernancePanel";
import { AttackPanel } from "./components/AttackPanel";
import { LayerStatus } from "./components/LayerStatus";
import { FooterLedger } from "./components/FooterLedger";
import { KeeperStatus, GuardianHealth } from "./components/KeeperStatus";
import { ConstraintPanel } from "./components/ConstraintPanel";

export function App() {
  const { latest, history, connected } = useAgentStream();
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

  // Which environment the agent ENFORCES on — a STATUS MIRROR read off the SSE tick
  // (never a dashboard hardcode). Defaults to "testnet" before the first frame. The
  // two cards + the header pill light purely from (env === enforcedEnv); there is NO
  // control that re-routes enforcement.
  const enforcedEnv = latest?.enforcedEnv ?? "testnet";
  const obs = latest?.observatory;

  // Two on-chain liveness signals (both chain-read, can't be faked):
  //  • keeperPokeMs — the REAL keeper signal: freshness of the last permissionless
  //    poke = the newest RiskEvaluated with had_request=false (an agent submit is
  //    had_request=true, so it can't masquerade as the keeper).
  //  • lastCheckMs — the guardian "healthy" heartbeat: last_check_ms, stamped by the
  //    keeper poke OR the agent submit (kept separate, per its looser meaning).
  const keeperPokeMs = events.find(
    (e) => e.kind === "RiskEvaluated" && (e.json as { had_request?: boolean }).had_request === false,
  )?.tsMs;
  const lastCheckMs = policy?.lastCheckMs;

  // Model warming up → the early score isn't trusted yet (shown on both score cards).
  const calibrating = latest?.warmup ? !latest.warmup.ready : false;

  // Time since the last on-chain action (events newest-first) — posture + the wall.
  const lastTs = events[0]?.tsMs ?? 0;
  const ago = lastTs > 0 ? `${Math.round((Date.now() - lastTs) / 1000)}s ago` : "—";

  // PRESENTATIONAL only: tint the frame on a freeze (no atmosphere layers). Runs in
  // an effect (never during render) so the static-markup tests stay DOM-free, and it
  // never touches the data/decision path — a cosmetic mirror of `paused`.
  useEffect(() => {
    document.body.classList.toggle("frozen", paused);
    return () => document.body.classList.remove("frozen");
  }, [paused]);

  return (
    <div className="app">
      {/* A — masthead */}
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
        <div className="status-cluster">
          <span className="muted stat-item">
            <span className={`dot ${connected ? "dot-ok" : "dot-bad"}`} />
            {connected ? "radar live" : "radar offline"}
          </span>
          <KeeperStatus keeperPokeMs={keeperPokeMs} />
          <GuardianHealth lastCheckMs={lastCheckMs} />
        </div>
        <ConnectButton />
      </header>

      {/* A — posture verdict */}
      <PostureBanner paused={paused} applied={applied} baseline={baseline} ago={ago} />

      {/* B — thesis strip: the claim once, then the three roles as a color legend */}
      <section className="thesis">
        <p className="thesis-lede">
          <span className="tname">Seawall</span> is a circuit breaker that no one has to trust.{" "}
          <span className="tagline">The agent's number is never trusted — the contract re-checks every breach on its own data.</span>
        </p>
        <div className="roles">
          <div className="role role--agent">
            <span className="role-tag">Radar · the agent</span>
            <span className="role-desc">Untrusted. Watches the oracle and the order book off-chain, and can only ever ask to tighten.</span>
          </div>
          <div className="role role--contract">
            <span className="role-tag">The contract</span>
            <span className="role-desc">Re-derives every breach on-chain from raw Pyth + DeepBook. Only ever pushes safer. Final say.</span>
          </div>
          <div className="role role--dao">
            <span className="role-tag">The DAO</span>
            <span className="role-desc">Holds the one key that can loosen the limits or unfreeze the market.</span>
          </div>
        </div>
      </section>

      {/* NEW — architecture: the thesis drawn, before the live data reads as it in motion */}
      <section className="band band--arch">
        <div className="band-head">
          <span className="kicker">Architecture</span>
          <span className="lede">how an untrusted radar, the contract, and the DAO actually wire together</span>
        </div>
        <div className="arch-frame">
          <ArchitectureDiagram />
        </div>
      </section>

      {/* C — the two seas */}
      <section className="band">
        <div className="band-head">
          <span className="kicker">The two seas</span>
          <span className="lede">
            one unchanged model, two markets — the enforced testnet score + a read-only mainnet reference
          </span>
          <WarmupStatus warmup={latest?.warmup} variant="chip" />
        </div>
        <div className="seas">
          <ScoreCard
            env="testnet"
            enforced={enforcedEnv === "testnet"}
            score={latest?.scoreOverall ?? 0}
            divBps={latest?.divBps}
            book={latest?.book}
            available={!!latest}
            calibrating={calibrating}
          />
          <ScoreCard
            env="mainnet"
            enforced={enforcedEnv === "mainnet"}
            score={obs?.ok ? obs.score : 0}
            divBps={obs?.divBps}
            book={obs?.book}
            available={!!obs}
            calibrating={calibrating}
          />
        </div>
        <Sparkline history={history} />

        {/* Honest cold-start status — live warm-up progress (~45 min, measured). */}
        <WarmupStatus warmup={latest?.warmup} variant="strip" />
      </section>

      {/* D — the wall */}
      <section className="band">
        <div className="band-head">
          <span className="kicker">The wall</span>
          <span className="lede">three rungs of one ladder — trust decides who can pull which</span>
        </div>
        <LayerStatus tick={latest} paused={paused} events={events} />
      </section>

      {/* E — the instruments */}
      <section className="band">
        <div className="band-head">
          <span className="kicker">The instruments</span>
          <span className="lede">glass-box — exactly what the radar measured, and the cage it cannot widen</span>
        </div>
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
      </section>

      {/* E2 — why these limits (agent ⟂ contract transparency) */}
      <section className="band">
        <div className="band-head">
          <span className="kicker">Why these limits</span>
          <span className="lede">what the agent asked, what the contract demanded on its own data, and what's actually applied</span>
        </div>
        <ConstraintPanel tick={latest} />
      </section>

      {/* F — on-chain proof */}
      <section className="band">
        <div className="band-head">
          <span className="kicker">On-chain proof</span>
          <span className="lede">every action re-derived + enforced on testnet — the receipts, explorer-linked</span>
        </div>
        <div className="proof">
          <ActionLog events={events} />
          <GovernancePanel paused={paused} />
        </div>
      </section>

      {/* G — the drill */}
      <section className="band">
        <div className="band-head">
          <span className="kicker">The drill</span>
          <span className="lede">run the 4-scene demo — then try to break it</span>
        </div>
        <AttackPanel agentUrl={CFG.agentUrl} />
      </section>

      {/* H — footer ledger */}
      <FooterLedger />
    </div>
  );
}
