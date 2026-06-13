// The keeper tick: devInspect pre-flight → execute the params-less poke → parse
// what the CONTRACT decided (RiskEvaluated / Frozen). A failed tick is logged
// and counted, never crashes the process — a missed poke is SAFE (fail-CLOSED:
// the inline floor still protects every borrow, and relax only ever happens on a
// fresh on-chain all-clear, never on keeper silence).
import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { buildPokeTx } from "./tx";
import type { KeeperConfig, TickResult } from "./types";

export class Keeper {
  consecutiveFailures = 0;

  constructor(
    private readonly client: SuiClient,
    private readonly signer: Ed25519Keypair,
    private readonly cfg: KeeperConfig,
  ) {}

  async tick(): Promise<TickResult> {
    try {
      const sender = this.signer.getPublicKey().toSuiAddress();
      const dry = await buildPokeTx(this.client, this.cfg);
      const sim = await this.client.devInspectTransactionBlock({ sender, transactionBlock: dry });
      if (sim.effects?.status?.status !== "success") {
        throw new Error(`poke devInspect failed: ${JSON.stringify(sim.effects?.status)}`);
      }
      // Always EXECUTE — even a calm no-op advances last_check (liveness is part
      // of the safety story; the dashboard "stale guardian" alarm reads it).
      const tx = await buildPokeTx(this.client, this.cfg);
      const res = await this.client.signAndExecuteTransaction({
        signer: this.signer,
        transaction: tx,
        options: { showEvents: true, showEffects: true },
      });
      if (res.effects?.status?.status !== "success") {
        throw new Error(`poke execute failed: ${JSON.stringify(res.effects?.status)}`);
      }
      await this.client.waitForTransaction({ digest: res.digest });
      const ev = res.events ?? [];
      const re = ev.find((e) => e.type.endsWith("::guardian::RiskEvaluated"))?.parsedJson as any;
      const froze = ev.some((e) => e.type.endsWith("::guardian::Frozen"));
      this.consecutiveFailures = 0;
      return {
        ok: true,
        digest: res.digest,
        divOwn: re ? BigInt(re.div_own) : undefined,
        signal: re ? Number(re.signal) : undefined,
        paused: re ? !!re.paused : undefined,
        frozeThisTick: froze,
        lastCheckMs: re ? Number(re.ts_ms) : undefined,
      };
    } catch (e) {
      this.consecutiveFailures += 1;
      return { ok: false, error: (e as Error).message };
    }
  }
}
