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
import { ArchitectureReveal } from "./components/ArchitectureReveal";
import { ConnectBand } from "./components/ConnectBand";
import { FreezeDemo } from "./components/FreezeDemo";
import { DaoConsoleBand } from "./components/DaoConsoleBand";
import { AttackPanel } from "./components/AttackPanel";
import { LayerStatus } from "./components/LayerStatus";
import { FooterLedger } from "./components/FooterLedger";
import { KeeperStatus, GuardianHealth } from "./components/KeeperStatus";
import { TheReading } from "./components/TheReading";
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

  // Operator-only demo drill. The public site never renders the attack panel — its
  // /control/scene POSTs are token-gated and 401 for any visitor anyway. The operator
  // opens ?demo=<token> to render it AND authorize the POST for a video take. Guarded
  // for the DOM-free static-markup tests (no window → hidden, the public default).
  const demoToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("demo") : null;

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

        <div className="header-links">
          <a
            className="header-gh"
            href="https://www.youtube.com/watch?v=HZuOTUocs3Y"
            target="_blank"
            rel="noreferrer"
            aria-label="Watch the demo on YouTube"
            title="Watch the demo on YouTube"
          >
            <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
              <path d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.55 15.57V8.43L15.82 12l-6.27 3.57z" />
            </svg>
            <span className="header-gh-label">Demo</span>
          </a>
          <a
            className="header-gh"
            href="https://github.com/kartashovio/seawall"
            target="_blank"
            rel="noreferrer"
            aria-label="Source on GitHub"
            title="Source on GitHub"
          >
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span className="header-gh-label">GitHub</span>
          </a>
          <a
            className="header-gh"
            href="https://x.com/kartashovio/status/2069339181919175050"
            target="_blank"
            rel="noreferrer"
            aria-label="Read the write-up on X"
            title="Read the write-up on X"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
              <path d="M18.9 1.5h3.68l-8.04 9.19L24 22.5h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.5h7.6l5.24 6.93L18.9 1.5zm-1.29 18.8h2.04L6.48 3.6H4.3l13.31 16.7z" />
            </svg>
            <span className="header-gh-label">Article</span>
          </a>
        </div>
      </header>

      {/* A — hard-stop alarm (only renders when FROZEN) */}
      <PostureBanner paused={paused} />

      {/* B — how it works: the merged product story. One claim → the sequential
          flow (verbs) → the SAME ladder live as the hero (the promoted "wall") →
          the full wiring on demand. The old "Architecture" diagram band and the
          standalone "The wall" band fold into this one band. */}
      <section className="band wall-story">
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
      </section>

      {/* Full architecture — the deep-dive of the how-it-works overview above, one
          click away. A bare disclosure band: the progressive-disclosure control IS
          the band, no claim header (the <summary> carries its own title + sub). */}
      <section className="band">
        <ArchitectureReveal />
      </section>

      {/* What Sui makes possible — the three Sui primitives that enforce each rule
          (the architecture deep-dive is its own band above). */}
      <section className="band">
        <div className="seas-intro">
          <h2 className="hero-claim-line seas-claim-line">
            What <span className="c-contract">Sui</span> makes possible
          </h2>
          <p className="hero-claim-body">
            Each rule is enforced by a Sui primitive — PTB atomicity, Move capabilities, the native DeepBook order book —
            not bolted on off-chain.
          </p>
        </div>
        <WiringReveal />
      </section>

      {/* C — testnet (enforced) vs mainnet (read-only sanity check): one model, two
          venues by PURPOSE, not coverage. STATUS, NOT CONTROL: the env is a data field
          echoed from the agent; no toggle, no implication mainnet can be switched to
          enforcing. The calm-vs-jumpy contrast IS the proof. */}
      <section className="band">
        <div className="seas-intro">
          <h2 className="hero-claim-line seas-claim-line">
            Watch it react — <span className="c-enforced">live on testnet</span>,{" "}
            <span className="c-observing">read-only on the real market</span>.
          </h2>
          <p className="hero-claim-body">
            The guardian is <span className="c-enforced">fully deployed on testnet</span>, and because that pool is
            volatile you can watch the limits move with the AI risk score in real time. The same{" "}
            <b>EWMA-Mahalanobis</b> model, fit to SUI/USDC, runs on both networks and streams a live score.{" "}
            <span className="c-enforced">On-chain enforcement</span> is deployed on{" "}
            <span className="c-enforced">testnet only</span> for now — the mainnet market stays{" "}
            <span className="c-observing">read-only</span>.
          </p>
          <p className="band-note seas-scope">
            Fit to SUI today — other assets need the model re-fit.
          </p>
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
        <Sparkline history={history} events={events} />
      </section>

      {/* The reading: the live deep-dive glass box — the payoff of the two-seas gauges
          directly above it. What the model measured, then the limits the contract
          clamped it to. (The old "instruments" + "why these limits" bands fold into
          this one; the corridor geometry lives here ONCE — LayerStatus L2 is the teaser.) */}
      <section className="band">
        <div className="seas-intro">
          <h2 className="hero-claim-line seas-claim-line">
            Every signal looks calm — the joint distance still trips.
          </h2>
          <p className="hero-claim-body">
            The <span className="c-agent">Mahalanobis distance</span> fires on the combined anomaly no single feature
            shows — and the contract clamps the result to the safe direction, never trusting the{" "}
            <span className="c-agent">0–100 score</span> (it stays off the logic path).
          </p>
        </div>
        <TheReading tick={latest} applied={applied} floor={floor} baseline={baseline} />
      </section>

      {/* stress-test gallery: historical proof the guardian matters when the market isn't calm */}
      <section className="band band--backtest">
        <div className="seas-intro">
          <h2 className="hero-claim-line seas-claim-line">
            The same model, replayed through five real crashes.
          </h2>
          <p className="hero-claim-body">
            <span className="c-coral">Two contract freezes</span>, <span className="c-agent">three graded tightens</span> —
            scores regression-verified against the validated reports.
          </p>
        </div>
        <BacktestGallery />
      </section>

      {/* F1.5 — human override: the standalone LIVE DAO console (must-have #4).
          Pulled out of "On-chain proof"; sits right before the recorded freeze
          cycle so a judge presses the real Unfreeze button, then sees it recorded. */}
      <DaoConsoleBand paused={paused} />

      {/* F2 — the freeze, recorded on-chain (a verifiable witness, not interactive) */}
      <section className="band">
        <div className="seas-intro">
          <h2 className="hero-claim-line seas-claim-line">
            The contract froze itself — every step is a real transaction.
          </h2>
          <p className="hero-claim-body">
            One recorded testnet cycle: a <span className="c-emerald">healthy borrow</span>, a keeper poke that makes the
            contract <span className="c-coral">freeze on its own divergence</span>, the same borrow now{" "}
            <span className="c-coral">aborting at the inline floor</span>, then the{" "}
            <span className="c-dao">DAO lifting the halt</span> — verify every hash on-chain.
          </p>
        </div>
        <FreezeDemo />
      </section>

      {/* G — the drill (operator-gated: renders only with ?demo=<token>, which also
          authorizes the scene POST). Hidden from the public site — visitors can't
          drive the live agent, and the endpoint 401s them anyway. */}
      {demoToken !== null && (
        <section className="band">
          <div className="seas-intro">
            <h2 className="hero-claim-line seas-claim-line">
              Run the demo — then try to break the guardian.
            </h2>
            <p className="hero-claim-body">
              Four scenes — a fast <span className="c-coral">de-peg</span>, a slow drift, a{" "}
              <span className="c-agent">malicious agent</span>, a <span className="c-dao">DAO override</span>. The contract
              refuses every unsafe move.
            </p>
          </div>
          <AttackPanel agentUrl={CFG.agentUrl} operatorToken={demoToken || undefined} />
        </section>
      )}

      {/* G2 — connect your protocol: the adoption capstone. Integration guidance,
          not primary product presentation, so it lands near the end — after the
          proof + the drill, right before the footer. */}
      <ConnectBand />

      {/* H — footer ledger */}
      <FooterLedger />
    </div>
  );
}
