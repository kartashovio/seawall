// GATE 5 — the live loop end-to-end: warm-start on recent history, a CALM tick
// submits nothing, and an ELEVATED reading autonomously originates a tighten
// submit. Uses a fresh policy for determinism.
//
// Run:  pnpm --filter @seawall/agent exec tsx scripts/loop-smoke.ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { loadConfig, loadAgentKeypair } from "../src/config";
import { createPolicy } from "../src/deploy-lib";
import { verifySubmitAbi } from "../src/tx";
import { warmup } from "../src/warmup";
import { Engine } from "../src/loop";
import { DEFAULT_SEND_OPTS } from "../src/policy-logic";
import { readPolicy } from "../src/onchain";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const signer = loadAgentKeypair(cfg.registeredAgent);
  await verifySubmitAbi(client, cfg.packageId);

  const { policyId } = await createPolicy(client, signer, cfg);
  const gcfg = { ...cfg, policyId };
  console.log(`[gate5] fresh policy ${policyId.slice(0, 12)}`);

  const warm = await warmup(gcfg, Date.now());
  console.log(`[gate5] warmup: ${warm.bars} bars, ${warm.calmSamples} calm d² samples`);

  const eng = new Engine(client, signer, gcfg, warm.det, warm.fb, warm.cal, DEFAULT_SEND_OPTS);

  const t1 = await eng.tick(Date.now(), { mode: "calm" });
  console.log(`[gate5] CALM tick: score=${t1.scoreOverall.toFixed(1)} solv=${t1.solvency.toFixed(1)} liq=${t1.liquidity.toFixed(1)} sent=${t1.sent} dbkMid=${t1.book?.mid}`);

  const t2 = await eng.tick(Date.now(), { mode: "elevate", override: { overall: 99, solvency: 99, liquidity: 50 } });
  const after = await readPolicy(client, policyId); // fresh (submitOnce waits for finality)
  const tightened = t2.applied.maxLtv < 7500; // in-tx event = authoritative
  console.log(`[gate5] ELEVATE tick: sent=${t2.sent} digest=${t2.digest?.slice(0, 10)} inTxApplied=${JSON.stringify(t2.applied)} readback=${JSON.stringify(after.applied)}`);

  const pass = warm.bars > 0 && warm.calmSamples > 0 && t2.sent && tightened;
  console.log(
    `\n[gate5] RESULT: ${pass ? "✅ GATE 5 PASS — warmup + autonomous elevate→tighten submit" : "❌ FAIL"}` +
      ` (warmup=${warm.bars > 0}, calmSamples=${warm.calmSamples > 0}, elevateSent=${t2.sent}, tightened=${tightened})`,
  );
  if (!pass) process.exitCode = 1;
}

main().catch((e) => {
  console.error("[gate5] ERROR", e);
  process.exitCode = 1;
});
