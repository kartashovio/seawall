// Seawall off-chain ML agent. Warm-starts the detector on recent history, then
// every 60s: live multi-source reading → EWMA-Mahalanobis score → calibrate →
// ratchet vs the on-chain applied baseline → send gate → (only if tighter or the
// heartbeat) ONE same-PTB submit. Calm steady-state ⇒ 0 tx. Never decides
// on-chain; the contract clamps + re-derives the breach itself.
//
// Run:  pnpm --filter @seawall/agent exec tsx src/index.ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { AGENT_GRID_MS } from "@seawall/shared";
import { loadConfig, loadAgentKeypair } from "./config";
import { verifySubmitAbi } from "./tx";
import { warmup } from "./warmup";
import { FeatureBuilder } from "@seawall/model";
import { LIVE_FEATURE_CONFIG } from "./live";
import { Engine, type Scene, type AgentTick, type ObservatoryDeps } from "./loop";
import { DEFAULT_SEND_OPTS } from "./policy-logic";
import { startControlServer } from "./control-server";
import { loadObservatoryConfig } from "./observatory-config";
import { computeObservatory } from "./observatory";

const PORT = Number(process.env.AGENT_PORT ?? 8787);

async function main(): Promise<void> {
  const cfg = loadConfig();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const signer = loadAgentKeypair(cfg.registeredAgent);
  await verifySubmitAbi(client, cfg.packageId);
  console.log(`[agent] package=${cfg.packageId.slice(0, 12)} policy=${cfg.policyId.slice(0, 12)} agent=${signer.getPublicKey().toSuiAddress().slice(0, 12)}`);

  console.log(`[agent] warming up on recent history…`);
  const warm = await warmup(cfg, Date.now());
  console.log(`[agent] warmup: ${warm.bars} bars, ${warm.calmSamples} calm d² samples`);

  // READ-ONLY MAINNET observatory (display-only, NEVER enforced). Builds a SECOND,
  // INDEPENDENT warmup triple (separate EWMA/velocity buffers — never shared, or
  // one chain poisons the other's baseline) + a mainnet read-only client. Wrapped
  // so a mainnet warmup failure logs a warning and the agent runs enforced-only.
  let observatory: ObservatoryDeps | undefined;
  try {
    const obsCfg = loadObservatoryConfig();
    const obsWarm = await warmup(cfg, Date.now()); // CEX-consensus proxy, chain-agnostic
    const mainnetClient = new SuiClient({ url: obsCfg.rpcUrl });
    // Fresh FeatureBuilder for the live leg: warmup primed its velocity window on
    // the CEX-consensus proxy, and carrying that into the live mainnet read spikes
    // divvel for the first ~30 ticks (the cold-start over-reaction). Reset the
    // velocity at the seam — the warm EWMA detector + calibrator are kept.
    const obsTriple = { det: obsWarm.det, fb: new FeatureBuilder(LIVE_FEATURE_CONFIG), cal: obsWarm.cal };
    observatory = {
      compute: (cex, nowMs) => computeObservatory(mainnetClient, obsCfg, cex, nowMs, obsTriple),
    };
    console.log(`[agent] mainnet observatory armed (read-only · not enforced): pool=${obsCfg.poolId.slice(0, 12)}`);
  } catch (e) {
    console.warn(`[agent] mainnet observatory unavailable — running enforced-only: ${(e as Error).message}`);
  }

  // Same velocity-seam reset for the enforced testnet leg: keep the warm detector
  // + calibrator, start the live velocity window empty (no warmup→live spike).
  const liveFb = new FeatureBuilder(LIVE_FEATURE_CONFIG);
  const engine = new Engine(client, signer, cfg, warm.det, liveFb, warm.cal, DEFAULT_SEND_OPTS, observatory);
  let scene: Scene = { mode: "calm" };
  let busy = false;

  // single-flight tick (avoids overlapping submits from the timer + scene POST)
  const runTick = async (): Promise<AgentTick | null> => {
    if (busy) return null;
    busy = true;
    try {
      const t = await engine.tick(Date.now(), scene);
      const tag = t.sent ? `SUBMIT ${t.digest?.slice(0, 10)}${t.clamped ? ` (clamped ${t.clamped})` : ""}` : "—";
      console.log(
        `[tick] ${t.mode} score=${t.scoreOverall.toFixed(0)} solv=${t.solvency.toFixed(0)} liq=${t.liquidity.toFixed(0)} ` +
          `applied=${t.applied.maxLtv}/${t.applied.borrowCap} paused=${t.paused} ${tag}`,
      );
      return t;
    } catch (e) {
      console.error(`[tick] error: ${(e as Error).message}`);
      return null;
    } finally {
      busy = false;
    }
  };

  const ctrl = startControlServer({
    port: PORT,
    feedId: cfg.feedId,
    setScene: (s) => {
      scene = s;
      console.log(`[scene] -> ${s.mode}${s.override ? ` override=${JSON.stringify(s.override)}` : ""}`);
    },
    runTick,
  });
  console.log(`[agent] control server on :${PORT} (GET /stream, POST /control/scene, GET /feed-id)`);

  const timer = setInterval(async () => {
    const t = await runTick();
    if (t) ctrl.broadcast(t);
  }, AGENT_GRID_MS);

  // first tick immediately so the gauge isn't blank
  const t0 = await runTick();
  if (t0) ctrl.broadcast(t0);

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer); // no NEW ticks; an in-flight submit is one atomic PTB
    ctrl.close();
    console.log(`\n[agent] stopped (no half-submitted tx — submit is one PTB).`);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[agent] FATAL", e);
  process.exitCode = 1;
});
