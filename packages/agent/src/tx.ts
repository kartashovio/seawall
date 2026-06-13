// Builds + sends the agent's ONE autonomous action: a same-PTB
// `updatePriceFeeds → submit(ParamRequest, advisory_score)`. The submit
// ORIGINATES the CAUTION tighten (must-have #3); the contract clamps/ratchets +
// re-derives the breach itself, so the agent is never trusted.
//
// The advisory_score rides as a u8 event field ONLY (the contract never branches
// on it). The ParamRequest is built via guardian::new_param_request — the
// score→param map lives entirely off-chain.
import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { SUI_TYPE, CLOCK, type AgentConfig } from "./config";
import type { Bps } from "./policy-logic";
import { parseRiskEvaluated, type RiskEvaluatedEvent } from "./chainEvents";

/// Boot-time guard: confirm the deployed `submit` ABI matches what we build
/// against (bind to the chain, never to prose). Aborts on drift.
export async function verifySubmitAbi(client: SuiClient, packageId: string): Promise<void> {
  const mod = await client.getNormalizedMoveModule({ package: packageId, module: "guardian" });
  const submit = mod.exposedFunctions.submit;
  const npr = mod.exposedFunctions.new_param_request;
  if (!submit || !npr) throw new Error("guardian::submit / new_param_request missing on-chain");
  if (submit.typeParameters.length !== 2) throw new Error("submit must have 2 type params <Base,Quote>");
  // policy, pio, pool, clock, req, advisory_score, (ctx)
  if (submit.parameters.length < 6) throw new Error(`submit ABI drift: ${submit.parameters.length} params`);
}

export async function buildSubmitPtb(
  client: SuiClient,
  cfg: AgentConfig,
  req: Bps,
  advisoryScore: number,
): Promise<Transaction> {
  const conn = new SuiPriceServiceConnection(cfg.hermesUrl);
  const data = await conn.getPriceFeedsUpdateData([cfg.feedId]);
  const pyth = new SuiPythClient(client, cfg.pythState, cfg.wormholeState);
  const tx = new Transaction();
  const pioIds = await pyth.updatePriceFeeds(tx, data, [cfg.feedId]);
  const paramReq = tx.moveCall({
    target: `${cfg.packageId}::guardian::new_param_request`,
    arguments: [tx.pure.u16(req.maxLtv), tx.pure.u16(req.borrowCap)],
  });
  tx.moveCall({
    target: `${cfg.packageId}::guardian::submit`,
    typeArguments: [SUI_TYPE, cfg.dbusdcType], // <Base, Quote>
    arguments: [
      tx.object(cfg.policyId),
      tx.object(pioIds[0]),
      tx.object(cfg.poolId),
      tx.object(CLOCK),
      paramReq,
      tx.pure.u8(advisoryScore),
    ],
  });
  return tx;
}

export interface SubmitResult {
  digest: string;
  risk: RiskEvaluatedEvent | null;
  clamped: { param: number; requested: number; applied: number }[];
  rejected: { param: number; requested: number; applied: number }[];
}

/// devInspect (fail-fast) → execute → parse the landed events.
export async function submitOnce(
  client: SuiClient,
  signer: Ed25519Keypair,
  cfg: AgentConfig,
  req: Bps,
  advisoryScore: number,
): Promise<SubmitResult> {
  const sender = signer.getPublicKey().toSuiAddress();
  const dry = await buildSubmitPtb(client, cfg, req, advisoryScore);
  const sim = await client.devInspectTransactionBlock({ sender, transactionBlock: dry });
  if (sim.effects?.status?.status !== "success") {
    throw new Error(`submit devInspect failed: ${JSON.stringify(sim.effects?.status)}`);
  }
  const tx = await buildSubmitPtb(client, cfg, req, advisoryScore);
  const res = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEvents: true, showEffects: true },
  });
  if (res.effects?.status?.status !== "success") {
    throw new Error(`submit execute failed: ${JSON.stringify(res.effects?.status)}`);
  }
  await client.waitForTransaction({ digest: res.digest }); // so the next readPolicy is fresh
  const ev = res.events ?? [];
  const re = ev.find((e) => e.type.endsWith("::guardian::RiskEvaluated"));
  const clamps = ev
    .filter((e) => e.type.endsWith("::guardian::RequestClamped"))
    .map((e) => ({ param: Number((e.parsedJson as any).param), requested: Number((e.parsedJson as any).requested_bps), applied: Number((e.parsedJson as any).applied_bps) }));
  const rejects = ev
    .filter((e) => e.type.endsWith("::guardian::RequestRejected"))
    .map((e) => ({ param: Number((e.parsedJson as any).param), requested: Number((e.parsedJson as any).requested_bps), applied: Number((e.parsedJson as any).applied_bps) }));
  return {
    digest: res.digest,
    risk: re ? parseRiskEvaluated(re.parsedJson) : null,
    clamped: clamps,
    rejected: rejects,
  };
}
