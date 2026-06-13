// @seawall/keeper — a separate, near-stateless v1 process that calls the
// PERMISSIONLESS params-less `guardian::poke` on a drift-free 5-min grid. All
// FREEZE / contract-own-tighten / drip-RELAX / last_check decisions are made
// ON-CHAIN inside poke; the keeper only supplies scheduling + a fresh Pyth price
// + observability. It signs with its OWN throwaway key (NOT the registered_agent)
// to prove permissionlessness, and never imports @seawall/model — the freeze
// path cannot depend on the ML model.
//
// Run:  pnpm --filter @seawall/keeper dev
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { KEEPER_TICK_MS } from "@seawall/shared";
import { loadKeeperConfig, loadOrCreateKeeperKeypair, exportCliKeypair } from "./config";
import { verifyPokeAbi, readPolicy, ensureFunded } from "./tx";
import { Keeper } from "./keeper";
import { everyMs } from "./schedule";

async function main(): Promise<void> {
  const cfg = loadKeeperConfig();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const keypair = loadOrCreateKeeperKeypair();
  const keeperAddr = keypair.getPublicKey().toSuiAddress();

  // permissionlessness: the keeper is NOT the registered agent.
  if (keeperAddr.toLowerCase() === cfg.registeredAgent.toLowerCase()) {
    throw new Error("keeper key MUST differ from the registered_agent (permissionless proof)");
  }
  await verifyPokeAbi(client, cfg.packageId);

  // sanity: poke the feed the policy is actually bound to.
  const snap = await readPolicy(client, cfg.policyId);
  if (snap.feedId.replace(/^0x/, "").toLowerCase() !== cfg.feedId.replace(/^0x/, "").toLowerCase()) {
    throw new Error(`feed mismatch: policy=${snap.feedId} cfg=${cfg.feedId}`);
  }

  // one-time gas top-up from the deployer (the keeper key starts empty; prod
  // keepers are pre-funded — this is demo convenience, the deployer is never
  // needed at runtime).
  const bal = await ensureFunded(client, exportCliKeypair(cfg.registeredAgent), keeperAddr);
  console.log(`[keeper] addr=${keeperAddr.slice(0, 12)} (≠ agent ${cfg.registeredAgent.slice(0, 12)}) gas=${(Number(bal) / 1e9).toFixed(3)} SUI`);
  console.log(`[keeper] policy=${cfg.policyId.slice(0, 12)} tick=${KEEPER_TICK_MS / 1000}s`);

  const keeper = new Keeper(client, keypair, cfg);
  const runTick = async (): Promise<void> => {
    const r = await keeper.tick();
    if (r.ok) {
      console.log(
        `[tick] ok digest=${r.digest?.slice(0, 10)} div=${r.divOwn} signal=${r.signal} paused=${r.paused}` +
          `${r.frozeThisTick ? " 🧊FROZE" : ""} last_check=${r.lastCheckMs}`,
      );
    } else {
      console.error(`[tick] FAILED (#${keeper.consecutiveFailures}, safe — missed poke ≠ loss): ${r.error}`);
    }
  };

  await runTick(); // boot tick

  const ac = new AbortController();
  const loop = everyMs(KEEPER_TICK_MS, runTick, { signal: ac.signal });
  const shutdown = () => {
    console.log("\n[keeper] stopping (a missed poke is safe — fail-CLOSED).");
    ac.abort();
    setTimeout(() => process.exit(0), 100);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await loop;
}

main().catch((e) => {
  console.error("[keeper] FATAL", e);
  process.exitCode = 1;
});
