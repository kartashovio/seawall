// Same-PTB Pyth + the PARAMS-LESS poke. Byte-identical Pyth-posting to the
// agent (must-fix #1: poke aborts on a stale pio), but NO req/advisory_score —
// the keeper carries no opinion, only a fresh price + scheduling. The contract
// decides FREEZE / contract-own-tighten / drip-RELAX / last_check on its own.
import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import type { KeeperConfig, PolicySnapshot } from "./types";

const SUI_TYPE = "0x2::sui::SUI";
const CLOCK = "0x6";

export async function buildPokeTx(client: SuiClient, cfg: KeeperConfig): Promise<Transaction> {
  const conn = new SuiPriceServiceConnection(cfg.hermesUrl);
  const data = await conn.getPriceFeedsUpdateData([cfg.feedId]);
  const pyth = new SuiPythClient(client, cfg.pythState, cfg.wormholeState);
  const tx = new Transaction();
  const pioIds = await pyth.updatePriceFeeds(tx, data, [cfg.feedId]);
  tx.moveCall({
    target: `${cfg.packageId}::guardian::poke`,
    typeArguments: [SUI_TYPE, cfg.dbusdcType], // <Base, Quote>
    arguments: [tx.object(cfg.policyId), tx.object(pioIds[0]), tx.object(cfg.poolId), tx.object(CLOCK)],
  });
  return tx;
}

/// Boot guard: poke(policy, pio, pool, clock) + 2 type params, no req/score.
export async function verifyPokeAbi(client: SuiClient, packageId: string): Promise<void> {
  const mod = await client.getNormalizedMoveModule({ package: packageId, module: "guardian" });
  const poke = mod.exposedFunctions.poke;
  if (!poke) throw new Error("guardian::poke missing on-chain");
  if (poke.typeParameters.length !== 2) throw new Error(`poke type-param drift: ${poke.typeParameters.length}`);
  if (poke.parameters.length !== 4) throw new Error(`poke ABI drift: ${poke.parameters.length} params (expected policy,pio,pool,clock)`);
}

function bytesToHex(v: unknown): string {
  if (typeof v === "string") return v.startsWith("0x") ? v : `0x${v}`;
  if (Array.isArray(v)) return "0x" + (v as number[]).map((b) => b.toString(16).padStart(2, "0")).join("");
  return "";
}

export async function readPolicy(client: SuiClient, policyId: string): Promise<PolicySnapshot> {
  const o = await client.getObject({ id: policyId, options: { showContent: true } });
  const f = (o.data?.content as any)?.fields;
  if (!f) throw new Error(`policy ${policyId} has no content`);
  const n = (x: unknown) => Number(x as string);
  return {
    paused: !!f.paused,
    maxLtvCurrentBps: n(f.max_ltv_current_bps),
    borrowCapCurrentBps: n(f.borrow_cap_current_bps),
    lastCheckMs: n(f.last_check_ms),
    lastChangeMs: n(f.last_change_ms),
    lastBreachMs: n(f.last_breach_ms),
    epoch: n(f.epoch),
    feedId: bytesToHex(f.feed_id),
  };
}

/// One-time top-up of the keeper's gas from the deployer (the keeper key starts
/// empty). Returns the keeper's balance after. Idempotent: no-op if already funded.
export async function ensureFunded(
  client: SuiClient,
  deployer: Ed25519Keypair,
  keeperAddr: string,
  minMist = 50_000_000n,
  topUpMist = 200_000_000n,
): Promise<bigint> {
  const bal = BigInt((await client.getBalance({ owner: keeperAddr })).totalBalance);
  if (bal >= minMist) return bal;
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(topUpMist)]);
  tx.transferObjects([coin], tx.pure.address(keeperAddr));
  const res = await client.signAndExecuteTransaction({ signer: deployer, transaction: tx, options: { showEffects: true } });
  await client.waitForTransaction({ digest: res.digest });
  return BigInt((await client.getBalance({ owner: keeperAddr })).totalBalance);
}
