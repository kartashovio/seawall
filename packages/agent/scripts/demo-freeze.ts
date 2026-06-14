// GATE 7 — a LIVE contract-only FREEZE, the hero beat. No mock: testnet's thin
// DBUSDC pool sits a few tenths of a percent off the Pyth oracle (a real
// oracle↔CLOB offset). We create a DEMO policy with a deliberately tight freeze
// threshold T, then poke it — the CONTRACT re-derives its OWN Pyth↔DeepBook
// divergence and, finding div ≥ T, FREEZES. The agent has no part in it.
//
// Honest framing for the demo: prod T = 5% (the SUI_DBUSDC pool would have to
// genuinely de-peg); this demo policy uses a tight T so the natural testnet
// offset crosses it. The freeze code + threshold are identical — only the
// per-policy T differs (it's DAO-set state).
//
// Run:  pnpm --filter @seawall/agent exec tsx scripts/demo-freeze.ts
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import {
  MAX_LTV_BPS,
  BORROW_CAP_BPS,
  PRICE_SCALE,
  MAX_AGE_SECS,
  BASE_DECIMALS,
  QUOTE_DECIMALS,
  ALL_CLEAR_WINDOW_MS,
  RELAX_COOLDOWN_MS,
  RELAX_STEP_FRAC_BPS,
} from "@seawall/shared";
import { loadConfig, loadAgentKeypair, SUI_TYPE, CLOCK } from "../src/config";
import { readPolicy } from "../src/onchain";

const DEMO_T = 200_000n; // 0.02% — well below the natural testnet pyth↔deepbook offset
const DEMO_D = 100_000n; // 0.01% caution onset (< T)

function hexBytes(h: string): number[] {
  const s = h.replace(/^0x/, "");
  return Array.from({ length: s.length / 2 }, (_, i) => parseInt(s.slice(i * 2, i * 2 + 2), 16));
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const signer = loadAgentKeypair(cfg.registeredAgent);

  // create_policy with a TIGHT demo threshold (conf_frac_max = 100% so only
  // divergence freezes, not the confidence leg)
  const c = new Transaction();
  const cap = c.moveCall({
    target: `${cfg.packageId}::guardian::create_policy`,
    arguments: [
      c.pure.address(cfg.registeredAgent),
      c.pure.vector("u8", hexBytes(cfg.feedId)),
      c.pure.id(cfg.poolId),
      c.pure.u16(MAX_LTV_BPS.floor), c.pure.u16(MAX_LTV_BPS.baseline),
      c.pure.u16(BORROW_CAP_BPS.floor), c.pure.u16(BORROW_CAP_BPS.baseline),
      c.pure.u128(DEMO_T), c.pure.u128(DEMO_D), c.pure.u128(PRICE_SCALE), c.pure.u64(MAX_AGE_SECS),
      c.pure.u8(BASE_DECIMALS), c.pure.u8(QUOTE_DECIMALS),
      c.pure.u64(ALL_CLEAR_WINDOW_MS), c.pure.u64(RELAX_COOLDOWN_MS), c.pure.u16(RELAX_STEP_FRAC_BPS),
      c.object(CLOCK),
    ],
  });
  c.transferObjects([cap], c.pure.address(cfg.registeredAgent));
  const cr = await client.signAndExecuteTransaction({ signer, transaction: c, options: { showObjectChanges: true } });
  const demoPolicy = (cr.objectChanges ?? []).find(
    (o) => o.type === "created" && (o as any).objectType?.endsWith("::guardian::GuardianPolicy"),
  ) as { objectId: string };
  await client.waitForTransaction({ digest: cr.digest });
  console.log(`[gate7] demo policy ${demoPolicy.objectId.slice(0, 12)} (T=${DEMO_T} = 0.02%)`);

  // poke it (same-PTB Pyth + params-less poke) — the contract re-derives + freezes
  const conn = new SuiPriceServiceConnection(cfg.hermesUrl);
  const data = await conn.getPriceFeedsUpdateData([cfg.feedId]);
  const pyth = new SuiPythClient(client, cfg.pythState, cfg.wormholeState);
  const tx = new Transaction();
  const pio = await pyth.updatePriceFeeds(tx, data, [cfg.feedId]);
  tx.moveCall({
    target: `${cfg.packageId}::guardian::poke`,
    typeArguments: [SUI_TYPE, cfg.dbusdcType],
    arguments: [tx.object(demoPolicy.objectId), tx.object(pio[0]), tx.object(cfg.poolId), tx.object(CLOCK)],
  });
  const pk = await client.signAndExecuteTransaction({ signer, transaction: tx, options: { showEvents: true } });
  await client.waitForTransaction({ digest: pk.digest });

  const frozen = (pk.events ?? []).find((e) => e.type.endsWith("::guardian::Frozen"));
  const fj = frozen?.parsedJson as any;
  const after = await readPolicy(client, demoPolicy.objectId);
  console.log(`\n[GATE 7] poke tx = ${pk.digest}`);
  console.log(`[GATE 7] Frozen event = ${frozen ? `div ${(Number(fj.div) / 1e7).toFixed(3)}% cause ${fj.cause}` : "none"}`);
  console.log(`[GATE 7] policy paused = ${after.paused}`);
  const pass = !!frozen && after.paused;
  console.log(`\n[gate7] RESULT: ${pass ? "✅ GATE 7 PASS — contract-only FREEZE on its OWN re-derived divergence (agent had no part)" : "❌ FAIL (div may be < demo T this moment; re-run)"}`);
  console.log(`[gate7] demo policy id (for the dashboard freeze beat): ${demoPolicy.objectId}`);
  if (!pass) process.exitCode = 1;
}

main().catch((e) => {
  console.error("[gate7] ERROR", e);
  process.exitCode = 1;
});
