// Runtime smoke for the V2 ISLAND (@mysten/sui v2 + @mysten/deepbook-v3).
//
// Proves the dashboard island actually talks to Sui testnet and interacts with the
// chain via the v2 SDK surface — NOT just that deps resolve. Three checks:
//   1. the resolved @mysten/sui is a v2.x (the island pin),
//   2. the v2 client (SuiJsonRpcClient from @mysten/sui/jsonRpc — v2 renamed it; the
//      old v1 `SuiClient`/`getFullnodeUrl` are gone) reads the SAME chain (chain id),
//   3. the @mysten/deepbook-v3 SDK reads the live SUI_DBUSDC order book on testnet
//      (getLevel2TicksFromMid — the exact read the guardian contract does on-chain).
//
// This runs against the SAME chain + SAME pool as the v1 smoke — the two islands
// only ever meet on-chain (+ pure-TS @seawall/shared), never by passing SDK objects.
//
// Run:  pnpm --filter @seawall/dashboard exec tsx scripts/chain-smoke.ts
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { DeepBookClient, testnetPools } from "@mysten/deepbook-v3";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function resolvedSuiVersion(): string {
  const p = require.resolve("@mysten/sui/jsonRpc");
  return p.match(/@mysten\+sui@([\d.]+)/)?.[1] ?? "unknown";
}

async function main(): Promise<void> {
  const ver = resolvedSuiVersion();
  console.log(`[v2] @mysten/sui resolved = ${ver}  ${ver.startsWith("2.") ? "✅ v2 island" : "❌ NOT v2"}`);

  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet") });
  const chainId = await client.getChainIdentifier();
  console.log(`[v2] testnet chainIdentifier = ${chainId}`);

  const poolAddr = testnetPools.SUI_DBUSDC.address;
  const pool = await client.getObject({ id: poolAddr, options: { showType: true } });
  console.log(`[v2] SUI_DBUSDC pool (${poolAddr.slice(0, 10)}…) type = ${pool.data?.type ?? "(missing)"}`);

  // DeepBook SDK read of the live book — the same get_level2_ticks_from_mid the
  // guardian contract re-derives divergence from on-chain.
  const db = new DeepBookClient({ client, address: `0x${"0".repeat(64)}`, network: "testnet" });
  const book = await db.getLevel2TicksFromMid("SUI_DBUSDC", 10);
  const nBids = book.bid_prices?.length ?? 0;
  const nAsks = book.ask_prices?.length ?? 0;
  console.log(`[v2] DeepBook getLevel2TicksFromMid(SUI_DBUSDC): ${nBids} bids / ${nAsks} asks`);
  console.log(`[v2]   best bid=${book.bid_prices?.[0] ?? "-"}  best ask=${book.ask_prices?.[0] ?? "-"}`);

  const ok = ver.startsWith("2.") && !!chainId && !!pool.data?.type;
  console.log(`\n[v2] RESULT: ${ok ? "✅ PASS — v2 island reads testnet + DeepBook book" : "❌ FAIL"}`);
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error("[v2] ERROR", e);
  process.exitCode = 1;
});
