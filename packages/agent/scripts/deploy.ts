// Step 2 — create the GuardianPolicy on testnet against the freshly-published
// package, then prove the deployed contract end-to-end. Runs in the V1 island
// (@mysten/sui v1 + @pythnetwork/pyth-sui-js) because GATE 2 needs the same-PTB
// Pyth flow. The package itself is published by `scripts/publish.sh` first; this
// script reads the packageId from config/testnet.json.
//
// What it does:
//   1. create_policy (REAL) bound to the canonical SUI_DBUSDC pool -> capture
//      policyId + governanceCapId.
//   2. create_policy (MIS-BOUND: expected_pool_id = a dummy id) -> the GATE-2b
//      fixture (proves the pool-id assert fires through the live object path).
//   3. GATE 2  : same-PTB updatePriceFeeds + poke(real policy, real pool) ->
//      devInspect == success; read RiskEvaluated.div_own as the live anchor.
//   4. GATE 2b : same-PTB updatePriceFeeds + poke(MIS-BOUND policy, real pool) ->
//      devInspect MUST abort EWrongPool (divergence code 4) — the on-chain
//      witness for the Step-1 blocker fix.
//   5. write config/testnet.json.
//
// Run:  pnpm --filter @seawall/agent exec tsx scripts/deploy.ts
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import {
  PYTH_SUI_USD,
  HERMES_BETA_URL,
  TESTNET_SNAPSHOT,
  MAX_LTV_BPS,
  BORROW_CAP_BPS,
  T_FREEZE,
  D_CAUTION,
  CONF_FRAC_MAX,
  MAX_AGE_SECS,
  BASE_DECIMALS,
  QUOTE_DECIMALS,
  ALL_CLEAR_WINDOW_MS,
  RELAX_COOLDOWN_MS,
  RELAX_STEP_FRAC_BPS,
} from "@seawall/shared";

const SUI_TYPE = "0x2::sui::SUI";
const DBUSDC_TYPE = TESTNET_SNAPSHOT.dbusdcType;
const CLOCK = "0x6";
const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../config/testnet.json");

function loadConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

function loadDeployerKeypair(addr: string): Ed25519Keypair {
  // Pull the key from the CLI keystore at runtime — never written to the repo.
  const out = execSync(`sui keytool export --key-identity ${addr} --json`, { encoding: "utf8" });
  const bech32 = JSON.parse(out).exportedPrivateKey as string;
  const { secretKey } = decodeSuiPrivateKey(bech32);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

function hexToBytes(hex: string): number[] {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out: number[] = [];
  for (let i = 0; i < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
  return out;
}

// create_policy(registered_agent, feed_id, expected_pool_id, 4×corridor bps,
// threshold_t, d_caution, conf_frac_max, max_age_secs, base_dec, quote_dec,
// all_clear_window, relax_cooldown, relax_step_frac, clock, ctx): GovernanceCap
function buildCreatePolicy(pkg: string, agent: string, poolId: string, feed: string): Transaction {
  const tx = new Transaction();
  const cap = tx.moveCall({
    target: `${pkg}::guardian::create_policy`,
    arguments: [
      tx.pure.address(agent),
      tx.pure.vector("u8", hexToBytes(feed)),
      tx.pure.id(poolId),
      tx.pure.u16(MAX_LTV_BPS.floor),
      tx.pure.u16(MAX_LTV_BPS.baseline),
      tx.pure.u16(BORROW_CAP_BPS.floor),
      tx.pure.u16(BORROW_CAP_BPS.baseline),
      tx.pure.u128(T_FREEZE),
      tx.pure.u128(D_CAUTION),
      tx.pure.u128(CONF_FRAC_MAX),
      tx.pure.u64(MAX_AGE_SECS),
      tx.pure.u8(BASE_DECIMALS),
      tx.pure.u8(QUOTE_DECIMALS),
      tx.pure.u64(ALL_CLEAR_WINDOW_MS),
      tx.pure.u64(RELAX_COOLDOWN_MS),
      tx.pure.u16(RELAX_STEP_FRAC_BPS),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([cap], tx.pure.address(agent));
  return tx;
}

async function executeCreate(
  client: SuiClient,
  signer: Ed25519Keypair,
  tx: Transaction,
): Promise<{ policyId: string; governanceCapId?: string }> {
  const res = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });
  if (res.effects?.status?.status !== "success") {
    throw new Error(`create_policy failed: ${JSON.stringify(res.effects?.status)}`);
  }
  const changes = res.objectChanges ?? [];
  const find = (suffix: string) =>
    changes.find((c) => c.type === "created" && (c as any).objectType?.endsWith(suffix)) as
      | { objectId: string }
      | undefined;
  const policy = find("::guardian::GuardianPolicy");
  const cap = find("::guardian::GovernanceCap");
  if (!policy) throw new Error("GuardianPolicy not found in objectChanges");
  return { policyId: policy.objectId, governanceCapId: cap?.objectId };
}

async function buildPokePtb(
  client: SuiClient,
  pkg: string,
  policyId: string,
  poolId: string,
  feed: string,
): Promise<Transaction> {
  const conn = new SuiPriceServiceConnection(HERMES_BETA_URL);
  const data = await conn.getPriceFeedsUpdateData([feed]);
  const pyth = new SuiPythClient(client, TESTNET_SNAPSHOT.pythState, TESTNET_SNAPSHOT.wormholeState);
  const tx = new Transaction();
  const pioIds = await pyth.updatePriceFeeds(tx, data, [feed]);
  tx.moveCall({
    target: `${pkg}::guardian::poke`,
    typeArguments: [SUI_TYPE, DBUSDC_TYPE],
    arguments: [tx.object(policyId), tx.object(pioIds[0]), tx.object(poolId), tx.object(CLOCK)],
  });
  return tx;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const pkg = cfg.packageId as string;
  if (!pkg || pkg === "0x0") throw new Error("packageId missing in config/testnet.json — run publish.sh first");
  const agent = cfg.registeredAgent as string;
  const poolId = TESTNET_SNAPSHOT.suiDbusdcPool;
  const feed = PYTH_SUI_USD.testnetBeta;
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const signer = loadDeployerKeypair(agent);

  console.log(`[deploy] package = ${pkg}`);
  console.log(`[deploy] registered_agent = ${agent}`);
  console.log(`[deploy] expected_pool_id = ${poolId}`);

  // [1] verify the pool's type on-chain BEFORE binding to it
  const poolObj = await client.getObject({ id: poolId, options: { showType: true } });
  const ptype = poolObj.data?.type ?? "";
  if (!ptype.includes("::pool::Pool<") || !ptype.includes("sui::SUI") || !ptype.includes("DBUSDC")) {
    throw new Error(`pool ${poolId} is not a SUI/DBUSDC Pool: ${ptype}`);
  }
  console.log(`[deploy] pool type verified = ${ptype}`);

  // [2] REAL policy
  const real = await executeCreate(client, signer, buildCreatePolicy(pkg, agent, poolId, feed));
  console.log(`[deploy] REAL policyId = ${real.policyId}`);
  console.log(`[deploy] governanceCapId = ${real.governanceCapId}`);

  // [3] MIS-BOUND policy (expected_pool_id = a dummy id) — GATE-2b fixture
  const DUMMY_POOL = "0x000000000000000000000000000000000000000000000000000000000000dead";
  const misbound = await executeCreate(
    client,
    signer,
    buildCreatePolicy(pkg, agent, DUMMY_POOL, feed),
  );
  console.log(`[deploy] MIS-BOUND policyId = ${misbound.policyId} (expected_pool_id=${DUMMY_POOL})`);

  // [4] GATE 2 — real policy + real pool -> devInspect success + live anchor
  const tx2 = await buildPokePtb(client, pkg, real.policyId, poolId, feed);
  const r2 = await client.devInspectTransactionBlock({ sender: agent, transactionBlock: tx2 });
  const ok2 = r2.effects?.status?.status === "success";
  const riskEv = (r2.events ?? []).find((e) => e.type.endsWith("::guardian::RiskEvaluated"));
  const div = (riskEv?.parsedJson as any)?.div_own;
  const sig = (riskEv?.parsedJson as any)?.signal;
  const conf = (riskEv?.parsedJson as any)?.conf_frac;
  console.log(`\n[GATE 2] same-PTB poke devInspect = ${JSON.stringify(r2.effects?.status)}`);
  console.log(`[GATE 2] RiskEvaluated div_own=${div} signal=${sig} conf_frac=${conf}`);
  const anchorOk = div !== undefined && BigInt(div) < T_FREEZE * 4n; // sane scale, not a 10^6 decimal error
  console.log(
    `[GATE 2] live anchor: div_own ${anchorOk ? "✅ physically sane" : "❌ ABSURD — check coin-decimal sign"} ` +
      `(${div} @1e9 ≈ ${div !== undefined ? (Number(div) / 1e7).toFixed(3) : "?"}% divergence)`,
  );

  // [5] GATE 2b — mis-bound policy + real pool -> MUST abort EWrongPool (div code 4)
  const tx2b = await buildPokePtb(client, pkg, misbound.policyId, poolId, feed);
  const r2b = await client.devInspectTransactionBlock({ sender: agent, transactionBlock: tx2b });
  const err = r2b.effects?.status?.error ?? "";
  const wrongPool = r2b.effects?.status?.status === "failure" && /divergence/.test(err) && /, 4\)/.test(err);
  console.log(`\n[GATE 2b] mis-bound poke devInspect = ${JSON.stringify(r2b.effects?.status)}`);
  console.log(`[GATE 2b] EWrongPool abort = ${wrongPool ? "✅ blocked (pool-id assert fires live)" : "❌ NOT blocked"}`);

  // [6] persist
  const out = {
    ...cfg,
    policyId: real.policyId,
    governanceCapId: real.governanceCapId,
    misboundPolicyId: misbound.policyId,
    poolId,
    feedId: feed,
    dbusdcType: DBUSDC_TYPE,
    pythState: TESTNET_SNAPSHOT.pythState,
    wormholeState: TESTNET_SNAPSHOT.wormholeState,
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`\n[deploy] wrote ${CONFIG_PATH}`);

  const pass = ok2 && anchorOk && wrongPool;
  console.log(`\n[deploy] RESULT: ${pass ? "✅ GATE 2 + GATE 2b PASS" : "❌ FAIL"}`);
  if (!pass) process.exitCode = 1;
}

main().catch((e) => {
  console.error("[deploy] ERROR", e);
  process.exitCode = 1;
});
