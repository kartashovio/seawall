import { useEffect } from "react";
import { useAgentStream } from "./useAgentStream";
import { useGuardianEvents, usePolicy } from "./useGuardian";
import { lastKeeperPokeMs } from "./abi";
import { CFG, CORRIDOR } from "./config";
import { ScoreCard } from "./components/ScoreCard";
import { Sparkline } from "./components/Sparkline";
import { WarmupStatus } from "./components/WarmupStatus";
import { PostureBanner } from "./components/PostureBanner";
import { FlowStrip } from "./components/FlowStrip";
import { WiringReveal } from "./components/WiringReveal";
import { ConnectBand } from "./components/ConnectBand";
import { ModelInternals } from "./components/ModelInternals";
import { ActionLog } from "./components/ActionLog";
import { FreezeDemo } from "./components/FreezeDemo";
import { GovernancePanel } from "./components/GovernancePanel";
import { AttackPanel } from "./components/AttackPanel";
import { LayerStatus } from "./components/LayerStatus";
import { FooterLedger } from "./components/FooterLedger";
import { KeeperStatus, GuardianHealth } from "./components/KeeperStatus";
import { ConstraintPanel } from "./components/ConstraintPanel";
import { BacktestGallery } from "./components/BacktestGallery";

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
  const keeperPokeMs = lastKeeperPokeMs(events);
  const lastCheckMs = policy?.lastCheckMs;

  // Model warming up → the early score isn't trusted yet (shown above both cards).
  const calibrating = latest?.warmup ? !latest.warmup.ready : false;

  // PRESENTATIONAL only: tint the frame on a freeze (no atmosphere layers). Runs in
  // an effect (never during render) so the static-markup tests stay DOM-free, and it
  // never touches the data/decision path — a cosmetic mirror of `paused`.
  useEffect(() => {
    document.body.classList.toggle("frozen", paused);
    return () => document.body.classList.remove("frozen");
  }, [paused]);

  return (
    <div className="app">
      {/* A — masthead: left brand lockup (mark mass == wordmark) · right labeled CHAIN-READS rail */}
      <header className="header">
        <div className="brand">
          <span className="brand-mark-tile">
            <img className="brand-mark" src="/logo.png" alt="Seawall" />
          </span>
          <div className="brand-text">
            <div className="brand-line">
              <h1>Seawall</h1>
              <span className={`env-pill env-${enforcedEnv}`}>DEPLOYED ON {enforcedEnv.toUpperCase()}</span>
            </div>
            <p className="sub">Autonomous Risk Guardian</p>
          </div>
        </div>

        <div className="spacer" />

        <div className="rail">
          <span className="rail-label">Chain reads</span>
          <div className="statusbar" role="status" aria-label="system liveness">
            <span className="muted stat-item">
              <span className={`dot ${connected ? "dot-ok" : "dot-bad"}`} />
              {connected ? "radar live" : "radar offline"}
            </span>
            <KeeperStatus keeperPokeMs={keeperPokeMs} />
            <GuardianHealth lastCheckMs={lastCheckMs} />
          </div>
        </div>
      </header>

      {/* A — hard-stop alarm (only renders when FROZEN) */}
      <PostureBanner paused={paused} />

      {/* B — how it works: the merged product story. One claim → the sequential
          flow (verbs) → the SAME ladder live as the hero (the promoted "wall") →
          the full wiring on demand. The old "Architecture" diagram band and the
          standalone "The wall" band fold into this one band. */}
      <section className="band wall-story">
        <div className="band-head">
          <span className="kicker">How it works</span>
          <span className="lede">
            one signal — Pyth↔DeepBook divergence — climbs three rungs; trust decides who pulls which
          </span>
        </div>

        <div className="hero-claim">
          <h2 className="hero-claim-line">You never have to trust it.</h2>
          <p className="hero-claim-body">
            An off-chain <span className="c-agent">AI radar</span> watches the oracle and the order book —
            but the contract <span className="c-contract">re-derives every breach</span> from raw Pyth +
            DeepBook itself, and can only ever be <span className="c-contract">pushed safer</span>.
          </p>
          <div className="hero-legend">
            <span className="tag tag-agent">untrusted radar</span>
            <span className="tag tag-contract">the contract</span>
            <span className="tag tag-dao">the DAO</span>
          </div>
        </div>

        <FlowStrip />

        <div className="story-seam">That sequence, live on {enforcedEnv} right now:</div>

        <LayerStatus tick={latest} paused={paused} events={events} />

        <WiringReveal />
      </section>

      {/* B2 — connect your protocol: guardian-as-a-service adoption. WHAT a consumer
          protocol edits (the drop-in gate) + the deploy→gate→agent flow + the exact
          calls, grounded in the live testnet ids. Sits between the mechanism (How it
          works) and the live proof (The two seas). */}
      <ConnectBand />

      {/* C — the two seas */}
      <section className="band">
        <div className="band-head band-head--notes">
          <span className="kicker">The two seas</span>
          <span className="lede">
            the system is currently deployed on testnet only — mainnet is shown here purely for demonstration / reference
          </span>
          <span className="band-note">
            the model is currently tuned to SUI — covering other assets requires re-fitting the ML model
          </span>
        </div>
        {/* Calibration state — ABOVE the two scores (it gates whether they're trusted yet) */}
        <WarmupStatus warmup={latest?.warmup} variant="strip" />
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
      </section>

      {/* C2 — stress-test gallery: why the guardian matters when the market isn't calm */}
      <section className="band band--backtest">
        <div className="band-head">
          <span className="kicker">Proven on real crises</span>
          <span className="lede">the same unchanged model replayed through five historical crashes — score, knobs, divergence vs price</span>
        </div>
        <BacktestGallery />
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

      {/* F2 — the freeze, recorded on-chain (a verifiable witness, not interactive) */}
      <section className="band">
        <div className="band-head">
          <span className="kicker">The freeze, recorded</span>
          <span className="lede">one full LIVE → freeze → blocked borrow → DAO unfreeze cycle, captured on testnet — every step a real transaction</span>
        </div>
        <FreezeDemo />
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
