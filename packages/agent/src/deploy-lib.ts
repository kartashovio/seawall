// Reusable create_policy PTB (used by the GATE-4 smoke + the agent's optional
// bootstrap). The corridor/threshold args all come from @seawall/shared (single
// source of truth) — never re-typed.
import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import {
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
import { CLOCK, type AgentConfig } from "./config";

function hexToBytes(hex: string): number[] {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out: number[] = [];
  for (let i = 0; i < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
  return out;
}

export function buildCreatePolicy(pkg: string, agent: string, expectedPoolId: string, feed: string): Transaction {
  const tx = new Transaction();
  const cap = tx.moveCall({
    target: `${pkg}::guardian::create_policy`,
    arguments: [
      tx.pure.address(agent),
      tx.pure.vector("u8", hexToBytes(feed)),
      tx.pure.id(expectedPoolId),
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

export async function createPolicy(
  client: SuiClient,
  signer: Ed25519Keypair,
  cfg: AgentConfig,
): Promise<{ policyId: string; governanceCapId?: string }> {
  const tx = buildCreatePolicy(cfg.packageId, cfg.registeredAgent, cfg.poolId, cfg.feedId);
  const res = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });
  if (res.effects?.status?.status !== "success") throw new Error(`create_policy failed: ${JSON.stringify(res.effects?.status)}`);
  const changes = res.objectChanges ?? [];
  const find = (suffix: string) =>
    changes.find((c) => c.type === "created" && (c as any).objectType?.endsWith(suffix)) as { objectId: string } | undefined;
  const policy = find("::guardian::GuardianPolicy");
  if (!policy) throw new Error("GuardianPolicy not created");
  await client.waitForTransaction({ digest: res.digest });
  return { policyId: policy.objectId, governanceCapId: find("::guardian::GovernanceCap")?.objectId };
}
