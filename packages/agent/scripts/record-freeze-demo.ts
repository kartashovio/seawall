// Records ONE real, end-to-end on-chain freeze cycle on testnet and writes a
// self-contained artifact the dashboard renders as the "freeze, recorded
// on-chain" block. NOTHING here touches the live public policy/vault — it spins
// up its OWN throwaway policies/vaults/caps and operates only on those.
//
// The recorded arc (all real signed txs, real digests, clickable on suiscan):
//   1. NORMAL   — borrow succeeds on a HEALTHY policy (prod T = 5%); div ~0.3% < T.
//   2. FREEZE   — a keeper-style poke on a STRESSED policy (demo T = 0.02%) makes
//                 the CONTRACT re-derive its OWN Pyth↔DeepBook divergence and HALT.
//                 The agent has no part in the freeze (contract-only).
//   3. ABORT    — the IDENTICAL borrow on the stressed vault now aborts at the L1
//                 inline floor (EFrozen, code 2) — the freeze is what blocks it,
//                 not LTV (same tiny in-corridor amount as step 1).
//   4. UNFREEZE — the owned GovernanceCap clears the halt (DAO-only override).
//
// Honest framing: the stressed policy uses a deliberately TIGHT freeze threshold
// so the natural testnet oracle↔CLOB offset crosses it on cue. Production T = 5%
// (the pool would have to genuinely de-peg). The freeze code + threshold-check are
// identical; only the per-policy, DAO-set T differs. This block proves the
// MECHANISM; the live observatory shows real monitoring at prod thresholds.
//
// Run:  pnpm --filter @seawall/agent exec tsx scripts/record-freeze-demo.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import {
  MAX_LTV_BPS,
  BORROW_CAP_BPS,
  T_FREEZE,
  D_CAUTION,
  CONF_FRAC_MAX,
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

// Deliberately tight demo threshold (1e9 fraction; 1e7 == 1.0%). 0.02% sits
// below the natural testnet Pyth↔DeepBook offset, so a single poke freezes.
const DEMO_T = 200_000n; // 0.02%
const DEMO_D = 100_000n; // 0.01% caution onset (< T)
// Collateral + borrow sizing (verified safe in deploy.ts GATE 3):
//   0.1 SUI collateral (~$0.074) ; borrow 0.01 DBUSDC — well inside 75% LTV, so
//   the ONLY reason the frozen borrow aborts is EFrozen, never ELtvExceeded.
const COLLATERAL_MIST = 100_000_000n; // 0.1 SUI (9dp)
const BORROW_MINOR = 10_000n; //         0.01 DBUSDC (6dp)
const GAS_BUDGET = 60_000_000n; //       0.06 SUI — set explicitly on the aborting
//   borrow so the SDK submits it for real (no pre-flight dry-run that would throw
//   and rob us of the on-chain failed digest).

const OUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/dashboard/src/data/freeze-demo.json",
);

const divPct = (raw: bigint | string | number): number => Number(BigInt(raw)) / 1e7; // 1e7 == 1.0%

function hexBytes(h: string): number[] {
  const s = h.replace(/^0x/, "");
  return Array.from({ length: s.length / 2 }, (_, i) => parseInt(s.slice(i * 2, i * 2 + 2), 16));
}

interface Ctx {
  client: SuiClient;
  signer: Ed25519Keypair;
  pkg: string;
  agent: string;
  poolId: string;
  feed: string;
  pythState: string;
  wormholeState: string;
  dbusdcType: string;
  hermesUrl: string;
}

// create_policy(registered_agent, feed_id, expected_pool_id, 4×corridor bps,
//   t_freeze, d_caution, conf_frac_max, max_age_secs, base_dec, quote_dec,
//   all_clear_window, relax_cooldown, relax_step_frac, clock): GovernanceCap
// `conf` defaults to disabled (PRICE_SCALE = 100%) so ONLY divergence can freeze.
function buildCreatePolicy(
  c: Ctx,
  opts: { t: bigint; d: bigint; conf?: bigint },
): Transaction {
  const tx = new Transaction();
  const cap = tx.moveCall({
    target: `${c.pkg}::guardian::create_policy`,
    arguments: [
      tx.pure.address(c.agent),
      tx.pure.vector("u8", hexBytes(c.feed)),
      tx.pure.id(c.poolId),
      tx.pure.u16(MAX_LTV_BPS.floor),
      tx.pure.u16(MAX_LTV_BPS.baseline),
      tx.pure.u16(BORROW_CAP_BPS.floor),
      tx.pure.u16(BORROW_CAP_BPS.baseline),
      tx.pure.u128(opts.t),
      tx.pure.u128(opts.d),
      tx.pure.u128(opts.conf ?? PRICE_SCALE),
      tx.pure.u64(MAX_AGE_SECS),
      tx.pure.u8(BASE_DECIMALS),
      tx.pure.u8(QUOTE_DECIMALS),
      tx.pure.u64(ALL_CLEAR_WINDOW_MS),
      tx.pure.u64(RELAX_COOLDOWN_MS),
      tx.pure.u16(RELAX_STEP_FRAC_BPS),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([cap], tx.pure.address(c.agent));
  return tx;
}

async function pythPio(c: Ctx, tx: Transaction): Promise<string> {
  const conn = new SuiPriceServiceConnection(c.hermesUrl);
  const data = await conn.getPriceFeedsUpdateData([c.feed]);
  const pyth = new SuiPythClient(c.client, c.pythState, c.wormholeState);
  const pioIds = await pyth.updatePriceFeeds(tx, data, [c.feed]);
  return pioIds[0];
}

async function buildPokePtb(c: Ctx, policyId: string): Promise<Transaction> {
  const tx = new Transaction();
  const pio = await pythPio(c, tx);
  tx.moveCall({
    target: `${c.pkg}::guardian::poke`,
    typeArguments: [SUI_TYPE, c.dbusdcType], // poke<Base, Quote>
    arguments: [tx.object(policyId), tx.object(pio), tx.object(c.poolId), tx.object(CLOCK)],
  });
  return tx;
}

async function buildBorrowPtb(c: Ctx, vaultId: string, policyId: string, amount: bigint): Promise<Transaction> {
  const tx = new Transaction();
  const pio = await pythPio(c, tx);
  tx.moveCall({
    target: `${c.pkg}::demo_vault::borrow`,
    typeArguments: [c.dbusdcType, SUI_TYPE], // borrow<Quote, Base>
    arguments: [
      tx.object(vaultId),
      tx.object(policyId),
      tx.object(pio),
      tx.object(c.poolId),
      tx.object(CLOCK),
      tx.pure.u128(amount),
    ],
  });
  return tx;
}

async function signOk(c: Ctx, tx: Transaction, label: string): Promise<string> {
  const res = await c.client.signAndExecuteTransaction({
    signer: c.signer,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true, showEvents: true },
  });
  await c.client.waitForTransaction({ digest: res.digest });
  const st = res.effects?.status?.status;
  if (st !== "success") throw new Error(`${label} expected success, got ${JSON.stringify(res.effects?.status)}`);
  console.log(`[ok ] ${label} ${res.digest}`);
  return res.digest;
}

// Create one scratch policy + its vault + 0.1 SUI collateral. Returns the ids +
// the create digests (all clickable). The cap is transferred to `agent` in the
// create tx, so we look it up afterwards by owner+type.
async function createKit(
  c: Ctx,
  opts: { t: bigint; d: bigint; conf?: bigint },
  tag: string,
): Promise<{ policyId: string; vaultId: string; capId: string; createDigest: string; vaultDigest: string; depositDigest: string }> {
  // 1) policy (+ cap)
  const cr = await c.client.signAndExecuteTransaction({
    signer: c.signer,
    transaction: buildCreatePolicy(c, opts),
    options: { showObjectChanges: true, showEffects: true },
  });
  await c.client.waitForTransaction({ digest: cr.digest });
  if (cr.effects?.status?.status !== "success") throw new Error(`${tag} create_policy failed: ${JSON.stringify(cr.effects?.status)}`);
  const changes = cr.objectChanges ?? [];
  const created = (suffix: string) =>
    changes.find((o) => o.type === "created" && (o as any).objectType?.endsWith(suffix)) as { objectId: string } | undefined;
  const policyId = created("::guardian::GuardianPolicy")?.objectId;
  const capId = created("::guardian::GovernanceCap")?.objectId;
  if (!policyId || !capId) throw new Error(`${tag}: policy/cap not found in objectChanges`);
  console.log(`[kit] ${tag} policy=${policyId.slice(0, 10)} cap=${capId.slice(0, 10)} T=${divPct(opts.t).toFixed(3)}% ${cr.digest}`);

  // 2) vault bound to the policy
  const txV = new Transaction();
  txV.moveCall({
    target: `${c.pkg}::demo_vault::create_vault`,
    typeArguments: [c.dbusdcType, SUI_TYPE], // <Quote, Base>
    arguments: [txV.object(policyId)],
  });
  const rv = await c.client.signAndExecuteTransaction({ signer: c.signer, transaction: txV, options: { showObjectChanges: true, showEffects: true } });
  await c.client.waitForTransaction({ digest: rv.digest });
  if (rv.effects?.status?.status !== "success") throw new Error(`${tag} create_vault failed`);
  const vaultId = (rv.objectChanges ?? []).find(
    (o) => o.type === "created" && (o as any).objectType?.includes("::demo_vault::DemoVault"),
  ) as { objectId: string } | undefined;
  if (!vaultId) throw new Error(`${tag}: DemoVault not found`);
  console.log(`[kit] ${tag} vault=${vaultId.objectId.slice(0, 10)} ${rv.digest}`);

  // 3) deposit 0.1 SUI collateral (split from the gas coin)
  const txD = new Transaction();
  const [coll] = txD.splitCoins(txD.gas, [txD.pure.u64(COLLATERAL_MIST)]);
  txD.moveCall({
    target: `${c.pkg}::demo_vault::deposit_collateral`,
    typeArguments: [c.dbusdcType, SUI_TYPE],
    arguments: [txD.object(vaultId.objectId), coll],
  });
  const depositDigest = await signOk(c, txD, `${tag} deposit 0.1 SUI`);

  return { policyId, vaultId: vaultId.objectId, capId, createDigest: cr.digest, vaultDigest: rv.digest, depositDigest };
}

// devInspect a poke on `policyId` and read the contract's OWN current divergence
// (RiskEvaluated.div_own) + signal. No state change, no gas — pure read.
async function sampleDiv(c: Ctx, policyId: string): Promise<{ divRaw: bigint; signal: number; conf: bigint } | null> {
  const tx = await buildPokePtb(c, policyId);
  const r = await c.client.devInspectTransactionBlock({ sender: c.agent, transactionBlock: tx });
  const ev = (r.events ?? []).find((e) => e.type.endsWith("::guardian::RiskEvaluated"));
  const j = ev?.parsedJson as any;
  if (j?.div_own === undefined) return null;
  return { divRaw: BigInt(j.div_own), signal: Number(j.signal), conf: BigInt(j.conf_frac) };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const signer = loadAgentKeypair(cfg.registeredAgent);
  const c: Ctx = {
    client,
    signer,
    pkg: cfg.packageId,
    agent: cfg.registeredAgent,
    poolId: cfg.poolId,
    feed: cfg.feedId,
    pythState: cfg.pythState,
    wormholeState: cfg.wormholeState,
    dbusdcType: cfg.dbusdcType,
    hermesUrl: cfg.hermesUrl,
  };
  console.log(`[demo] package=${c.pkg}`);
  console.log(`[demo] agent=${c.agent}`);

  // Guard: refuse to ever touch the live policy/vault.
  const LIVE = new Set([cfg.policyId, (cfg as any).vaultId, (cfg as any).governanceCapId].filter(Boolean));

  const t0 = Date.now();
  const series: Array<{ tMs: number; divPct: number }> = [];
  const sampleInto = async (policyId: string, note: string): Promise<bigint | null> => {
    const s = await sampleDiv(c, policyId);
    if (s) {
      series.push({ tMs: Date.now() - t0, divPct: divPct(s.divRaw) });
      console.log(`[div] ${note}: ${divPct(s.divRaw).toFixed(3)}% signal=${s.signal} conf=${divPct(s.conf).toFixed(3)}%`);
    }
    return s ? s.divRaw : null;
  };

  // ── Pre-flight: read the live divergence/signal so we know the pool is in the
  // clean "two-sided book, ~0.3% offset" state (cause 0), not a one-sided book.
  const pre = await sampleDiv(c, cfg.policyId); // read-only on the live policy is harmless (devInspect)
  if (!pre) throw new Error("pre-flight: could not read divergence (RiskEvaluated missing)");
  console.log(`[pre] live divergence=${divPct(pre.divRaw).toFixed(3)}% signal=${pre.signal} conf=${divPct(pre.conf).toFixed(3)}%`);
  if (pre.signal !== 0) {
    console.warn(`[pre] ⚠️ book signal=${pre.signal} (1 = one-sided/empty). Freeze would be cause=1, not divergence. Proceeding, but the story is cleanest at signal=0.`);
  }
  if (pre.divRaw < DEMO_T) {
    throw new Error(`[pre] live divergence ${divPct(pre.divRaw).toFixed(3)}% is below demo T 0.02% right now — the poke would not freeze. Re-run when the offset is larger.`);
  }

  // ── HEALTHY kit (prod T = 5%) — the "normal operation" baseline ────────────
  const healthy = await createKit(c, { t: T_FREEZE, d: D_CAUTION, conf: CONF_FRAC_MAX }, "HEALTHY");
  await sampleInto(healthy.policyId, "after healthy kit");

  // STEP 1 — borrow SUCCEEDS on the healthy policy (div < 5%)
  const step1 = await buildBorrowPtb(c, healthy.vaultId, healthy.policyId, BORROW_MINOR);
  const step1Digest = await signOk(c, step1, "STEP 1 normal borrow (healthy)");
  const healthyPaused = (await readPolicy(client, healthy.policyId)).paused;
  if (healthyPaused) throw new Error("healthy policy unexpectedly paused after the normal borrow");

  // ── STRESSED kit (demo T = 0.02%, conf disabled) — the freeze subject ──────
  const stressed = await createKit(c, { t: DEMO_T, d: DEMO_D }, "STRESSED");
  await sampleInto(stressed.policyId, "stressed, pre-freeze");

  // STEP 2 — poke the stressed policy → contract re-derives div ≥ T → FREEZE.
  // Retry a few times in case the offset momentarily dips below the tight T.
  let freezeDigest = "";
  let frozenDiv = 0n;
  let frozenCause = 0;
  const tFreezeMs = () => Date.now() - t0;
  let freezeAtMs = 0;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const tx = await buildPokePtb(c, stressed.policyId);
    const res = await client.signAndExecuteTransaction({ signer, transaction: tx, options: { showEvents: true, showEffects: true } });
    await client.waitForTransaction({ digest: res.digest });
    if (res.effects?.status?.status !== "success") throw new Error(`poke failed: ${JSON.stringify(res.effects?.status)}`);
    const frozen = (res.events ?? []).find((e) => e.type.endsWith("::guardian::Frozen"));
    const after = await readPolicy(client, stressed.policyId);
    if (frozen && after.paused) {
      freezeDigest = res.digest;
      frozenDiv = BigInt((frozen.parsedJson as any).div);
      frozenCause = Number((frozen.parsedJson as any).cause);
      freezeAtMs = tFreezeMs();
      series.push({ tMs: freezeAtMs, divPct: divPct(frozenDiv) });
      console.log(`[ok ] STEP 2 FREEZE ${res.digest} — div ${divPct(frozenDiv).toFixed(3)}% cause ${frozenCause} paused=${after.paused}`);
      break;
    }
    console.warn(`[..] poke attempt ${attempt}: no freeze yet (div may have dipped < demo T); retrying`);
  }
  if (!freezeDigest) throw new Error("STEP 2: could not freeze the stressed policy after 5 pokes (offset < demo T the whole time?)");

  // STEP 3 — the IDENTICAL borrow on the frozen vault MUST abort with EFrozen (2).
  // Set an explicit gas budget so the SDK submits it for real and we get the
  // on-chain FAILED digest + the abort code (no pre-flight dry-run throw).
  const step3 = await buildBorrowPtb(c, stressed.vaultId, stressed.policyId, BORROW_MINOR);
  step3.setGasBudget(GAS_BUDGET);
  let r3;
  try {
    r3 = await client.signAndExecuteTransaction({ signer, transaction: step3, options: { showEffects: true } });
  } catch (e) {
    throw new Error(`STEP 3 threw instead of returning a failed tx (a pre-flight dry-run aborted before submit, so no on-chain digest). err: ${(e as Error).message}`);
  }
  await client.waitForTransaction({ digest: r3.digest });
  const st3 = r3.effects?.status?.status;
  const err3 = r3.effects?.status?.error ?? "";
  console.log(`[ok ] STEP 3 frozen borrow ${r3.digest} — status=${st3} error=${JSON.stringify(err3)}`);
  if (st3 !== "failure") throw new Error(`STEP 3: expected the frozen borrow to FAIL, got ${st3}`);
  // The Move abort string looks like "...function_name: Some(\"borrow\") }, 2) in command 1".
  const m = err3.match(/,\s*(\d+)\)/);
  const abortCode = m ? Number(m[1]) : undefined;
  if (abortCode !== 2) throw new Error(`STEP 3: expected abort code 2 (EFrozen), got ${abortCode} from error: ${err3}`);
  await sampleInto(stressed.policyId, "frozen");

  // STEP 4 — DAO unfreeze with the STRESSED policy's own cap (not the live cap).
  const txU = new Transaction();
  txU.moveCall({
    target: `${c.pkg}::guardian::governance_unfreeze`,
    arguments: [txU.object(stressed.policyId), txU.object(stressed.capId), txU.object(CLOCK)],
  });
  const unfreezeDigest = await signOk(c, txU, "STEP 4 DAO unfreeze");
  const unfreezeAtMs = Date.now() - t0;
  const afterU = await readPolicy(client, stressed.policyId);
  if (afterU.paused) throw new Error("STEP 4: policy still paused after governance_unfreeze");
  await sampleInto(stressed.policyId, "after unfreeze");

  // ── Artifact ───────────────────────────────────────────────────────────────
  const artifact = {
    recordedAt: new Date().toISOString(),
    network: "testnet",
    explorerTxBase: "https://suiscan.xyz/testnet/tx",
    explorerObjBase: "https://suiscan.xyz/testnet/object",
    poolId: c.poolId,
    feedId: c.feed,
    prodTPct: divPct(T_FREEZE), // 5.0
    demoTPct: divPct(DEMO_T), //   0.02
    healthy: { policyId: healthy.policyId, vaultId: healthy.vaultId, tPct: divPct(T_FREEZE) },
    stressed: { policyId: stressed.policyId, vaultId: stressed.vaultId, capId: stressed.capId, tPct: divPct(DEMO_T) },
    setup: {
      healthyCreate: healthy.createDigest,
      healthyVault: healthy.vaultDigest,
      healthyDeposit: healthy.depositDigest,
      stressedCreate: stressed.createDigest,
      stressedVault: stressed.vaultDigest,
      stressedDeposit: stressed.depositDigest,
    },
    marks: { freezeAtMs, unfreezeAtMs },
    series,
    steps: [
      {
        n: 1,
        key: "normal",
        title: "Normal operation",
        desc: "A borrow flows on a healthy policy. The inline floor re-derives the live Pyth↔DeepBook divergence, sees it well under the 5% threshold, and allows it.",
        digest: step1Digest,
        status: "success",
        paused: false,
        actor: "vault",
      },
      {
        n: 2,
        key: "freeze",
        title: "Ping → contract-only freeze",
        desc: "A keeper-style ping makes the contract re-derive its OWN divergence and, finding it over the (deliberately tight) demo threshold, HALT. The off-chain agent has no part in the freeze.",
        digest: freezeDigest,
        status: "success",
        paused: true,
        divPct: divPct(frozenDiv),
        cause: frozenCause,
        actor: "contract",
      },
      {
        n: 3,
        key: "abort",
        title: "Inline floor aborts the borrow",
        desc: "The identical borrow now aborts on-chain: the inline floor checks the freeze first and refuses the transaction (EFrozen). Same tiny in-corridor amount as step 1 — only the freeze blocks it, not leverage.",
        digest: r3.digest,
        status: "failure",
        abortCode: 2,
        abortName: "EFrozen",
        paused: true,
        actor: "contract",
      },
      {
        n: 4,
        key: "unfreeze",
        title: "DAO unfreeze",
        desc: "The owned GovernanceCap clears the halt — the only authority that can. The agent physically cannot hold this cap.",
        digest: unfreezeDigest,
        status: "success",
        paused: false,
        actor: "dao",
      },
    ],
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`\n[demo] ✅ wrote ${OUT_PATH}`);
  console.log(`[demo] healthy policy ${healthy.policyId}`);
  console.log(`[demo] stressed policy ${stressed.policyId} (frozen→unfrozen)`);
  console.log(`[demo] series points: ${series.length}`);
}

main().catch((e) => {
  console.error("[demo] ERROR", e);
  process.exitCode = 1;
});
