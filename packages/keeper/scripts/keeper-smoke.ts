// GATE 6 — the keeper, end-to-end on the deployed package:
//   * signs with its OWN throwaway key (≠ registered_agent) → permissionless;
//   * verifyPokeAbi binds to poke(policy,pio,pool,clock) + 2 type params;
//   * one params-less poke EXECUTES, RiskEvaluated lands, last_check advances;
//   * @seawall/model is absent from the keeper's dependency tree (asserted via
//     the package manifest — the freeze path can't depend on the ML model).
//
// Run:  pnpm --filter @seawall/keeper exec tsx scripts/keeper-smoke.ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKeeperConfig, loadOrCreateKeeperKeypair, exportCliKeypair } from "../src/config";
import { verifyPokeAbi, readPolicy, ensureFunded } from "../src/tx";
import { Keeper } from "../src/keeper";

async function main(): Promise<void> {
  const cfg = loadKeeperConfig();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const keypair = loadOrCreateKeeperKeypair();
  const keeperAddr = keypair.getPublicKey().toSuiAddress();

  const notAgent = keeperAddr.toLowerCase() !== cfg.registeredAgent.toLowerCase();
  console.log(`[gate6] keeper=${keeperAddr.slice(0, 12)}  registered_agent=${cfg.registeredAgent.slice(0, 12)}  distinct=${notAgent ? "✅" : "❌"}`);

  await verifyPokeAbi(client, cfg.packageId);
  console.log(`[gate6] poke ABI verified (policy,pio,pool,clock + 2 type params, no req/score)`);

  // @seawall/model must NOT be a keeper dependency (freeze independence).
  const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"));
  const noModel = !JSON.stringify(pkg.dependencies ?? {}).includes("@seawall/model");

  await ensureFunded(client, exportCliKeypair(cfg.registeredAgent), keeperAddr);
  const before = await readPolicy(client, cfg.policyId);

  const keeper = new Keeper(client, keypair, cfg);
  const r = await keeper.tick();
  const after = await readPolicy(client, cfg.policyId);
  const advanced = after.lastCheckMs > before.lastCheckMs;

  console.log(`\n[GATE 6] poke tick = ${r.ok ? "✅ executed" : "❌ " + r.error} digest=${r.digest?.slice(0, 10)}`);
  console.log(`[GATE 6] RiskEvaluated: div=${r.divOwn} signal=${r.signal} paused=${r.paused}`);
  console.log(`[GATE 6] last_check advanced: ${before.lastCheckMs} → ${after.lastCheckMs} = ${advanced ? "✅ liveness" : "❌"}`);
  console.log(`[GATE 6] @seawall/model absent from keeper deps = ${noModel ? "✅ freeze ⟂ ML" : "❌"}`);

  const pass = notAgent && r.ok && advanced && noModel;
  console.log(`\n[gate6] RESULT: ${pass ? "✅ GATE 6 PASS — permissionless params-less poke advances last_check, freeze ⟂ ML" : "❌ FAIL"}`);
  if (!pass) process.exitCode = 1;
}

main().catch((e) => {
  console.error("[gate6] ERROR", e);
  process.exitCode = 1;
});
