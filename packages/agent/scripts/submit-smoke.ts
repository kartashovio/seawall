// GATE 4 — prove the agent's ONE autonomous action end-to-end on the deployed
// package: a same-PTB updatePriceFeeds → submit() that ORIGINATES a CAUTION
// tighten (must-have #3), with advisory_score riding as an event field only,
// and the contract clamping a malicious over-tight request to the floor.
//
// Creates a FRESH policy so the gate is deterministic + re-runnable, and asserts
// on the in-tx RiskEvaluated event (race-free).
//
// Run:  pnpm --filter @seawall/agent exec tsx scripts/submit-smoke.ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { loadConfig, loadAgentKeypair } from "../src/config";
import { readPolicy } from "../src/onchain";
import { createPolicy } from "../src/deploy-lib";
import { verifySubmitAbi, submitOnce } from "../src/tx";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const signer = loadAgentKeypair(cfg.registeredAgent);

  console.log(`[gate4] package = ${cfg.packageId}`);
  await verifySubmitAbi(client, cfg.packageId);
  console.log(`[gate4] submit ABI verified on-chain (bound to the dump, not prose)`);

  // fresh policy at baseline -> deterministic
  const { policyId } = await createPolicy(client, signer, cfg);
  const gcfg = { ...cfg, policyId };
  const before = await readPolicy(client, policyId);
  console.log(`[gate4] fresh policy ${policyId.slice(0, 12)} applied=${JSON.stringify(before.applied)}`);

  // GATE 4a — a CAUTION tighten the agent originates (max_ltv → 6000), score 80.
  const SCORE = 80;
  const r1 = await submitOnce(client, signer, gcfg, { maxLtv: 6000, borrowCap: before.applied.borrowCap }, SCORE);
  const tightened = r1.risk?.maxLtvCurrentBps === 6000; // in-tx event = authoritative
  const scoreOk = r1.risk?.advisoryScore === SCORE && r1.risk?.hadRequest === true;
  console.log(`\n[GATE 4a] submit tx = ${r1.digest}`);
  console.log(`[GATE 4a] RiskEvaluated: advisory_score=${r1.risk?.advisoryScore} hadRequest=${r1.risk?.hadRequest} max_ltv_current=${r1.risk?.maxLtvCurrentBps}`);
  console.log(`[GATE 4a] autonomous tighten landed = ${tightened ? "✅ max_ltv 7500→6000 (agent ORIGINATED, no human)" : "❌"}`);
  console.log(`[GATE 4a] advisory_score event-only & matches = ${scoreOk ? "✅ 80" : "❌"}`);

  // GATE 4b — MALICIOUS over-tight (below corridor floor). Contract clamp-and-log,
  // never abort, never below floor.
  const r2 = await submitOnce(client, signer, gcfg, { maxLtv: 1000, borrowCap: 1000 }, 250);
  const clampedToFloor =
    r2.risk?.maxLtvCurrentBps === before.floor.maxLtv && r2.risk?.borrowCapCurrentBps === before.floor.borrowCap;
  const clampEvents = r2.clamped.length >= 1;
  console.log(`\n[GATE 4b] submit tx = ${r2.digest}`);
  console.log(`[GATE 4b] RequestClamped = ${JSON.stringify(r2.clamped)}`);
  console.log(`[GATE 4b] applied = {maxLtv:${r2.risk?.maxLtvCurrentBps}, borrowCap:${r2.risk?.borrowCapCurrentBps}} floor=${JSON.stringify(before.floor)}`);
  console.log(`[GATE 4b] malicious over-tight clamped to floor = ${clampedToFloor && clampEvents ? "✅ never below floor, RequestClamped logged" : "❌"}`);

  const pass = tightened && scoreOk && clampedToFloor && clampEvents;
  console.log(`\n[gate4] RESULT: ${pass ? "✅ GATE 4a + 4b PASS — autonomous submit + trust-min clamp proven live" : "❌ FAIL"}`);
  if (!pass) process.exitCode = 1;
}

main().catch((e) => {
  console.error("[gate4] ERROR", e);
  process.exitCode = 1;
});
