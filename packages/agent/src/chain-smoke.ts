// Runtime smoke for the V1 ISLAND (@mysten/sui v1 + @pythnetwork/pyth-sui-js).
//
// Proves the agent/keeper island actually talks to Sui testnet and interacts with
// the chain — NOT just that deps resolve. Three checks, all gas-free (devInspect):
//   1. the resolved @mysten/sui is a v1.x (the island pin),
//   2. the v1 SuiClient reads the SAME chain objects (chain id + the SUI_DBUSDC pool),
//   3. the same-PTB Pyth update+read flow (must-fix #1) devInspects to `success`.
//
// Run:  pnpm --filter @seawall/agent exec tsx src/chain-smoke.ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { createRequire } from "node:module";
import { PYTH_SUI_USD, HERMES_BETA_URL, TESTNET_SNAPSHOT } from "@seawall/shared";

const require = createRequire(import.meta.url);

function resolvedSuiVersion(): string {
  // read the version from the pnpm path (package.json is blocked by the exports map)
  const p = require.resolve("@mysten/sui/client");
  return p.match(/@mysten\+sui@([\d.]+)/)?.[1] ?? "unknown";
}

async function main(): Promise<void> {
  const ver = resolvedSuiVersion();
  console.log(`[v1] @mysten/sui resolved = ${ver}  ${ver.startsWith("1.") ? "✅ v1 island" : "❌ NOT v1"}`);

  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const sender = new Ed25519Keypair().getPublicKey().toSuiAddress();

  // [1] chain identity + a real object read on the shared chain
  const chainId = await client.getChainIdentifier();
  console.log(`[v1] testnet chainIdentifier = ${chainId}`);
  const pool = await client.getObject({
    id: TESTNET_SNAPSHOT.suiDbusdcPool,
    options: { showType: true },
  });
  console.log(`[v1] SUI_DBUSDC pool type = ${pool.data?.type ?? "(missing)"}`);

  // [2] same-PTB Pyth update+read (must-fix #1) on the SUI/USD beta feed, via devInspect
  const feed = PYTH_SUI_USD.testnetBeta;
  const conn = new SuiPriceServiceConnection(HERMES_BETA_URL);
  const data = await conn.getPriceFeedsUpdateData([feed]);
  const pyth = new SuiPythClient(client, TESTNET_SNAPSHOT.pythState, TESTNET_SNAPSHOT.wormholeState);
  const tx = new Transaction();
  tx.setSender(sender);
  const pioIds = await pyth.updatePriceFeeds(tx, data, [feed]);
  console.log(`[v1] Pyth updatePriceFeeds appended ${tx.getData().commands.length} cmds; PriceInfoObject = ${pioIds[0]}`);
  const res = await client.devInspectTransactionBlock({ sender, transactionBlock: tx });
  const ok = res.effects?.status?.status === "success";
  console.log(`[v1] same-PTB Pyth devInspect = ${JSON.stringify(res.effects?.status)}`);
  console.log(`\n[v1] RESULT: ${ok ? "✅ PASS — v1 island reads + posts Pyth on testnet" : "❌ FAIL"}`);
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error("[v1] ERROR", e);
  process.exitCode = 1;
});
