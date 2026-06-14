// The tick engine: live row → FeatureBuilder → Detector → calibrate → ratchet →
// send gate → (maybe) submit. Holds the rolling detector/featurebuilder state +
// the send-throttle clock. Calm + in-window ⇒ no tx. Scene overrides let the
// demo force an elevated reading, a malicious agent, or a dead agent.
import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { Detector, FeatureBuilder } from "@seawall/model";
import type { AgentTickDTO, ObservatoryBlock } from "@seawall/shared";
import type { AgentConfig } from "./config";
import type { Calibrator, CalibratedScore } from "./calibrate";
import { fetchLiveRow, fetchCexBlock, type LiveRow, type CexBlock } from "./live";
import { computeRequest, decideRequest, shouldSend, type Bps, type SendOpts } from "./policy-logic";
import { readPolicy, type PolicySnapshot } from "./onchain";
import { submitOnce } from "./tx";

export type SceneMode = "calm" | "elevate" | "malicious" | "dead";

export interface Scene {
  mode: SceneMode;
  override?: CalibratedScore; // for "elevate": forced calibrated score
}

// READ-ONLY MAINNET observatory dependency (display-only, NEVER enforced). The
// Engine calls `compute(cex, nowMs)` AFTER the testnet submit decision and
// attaches the result ONLY to the returned DTO. Injected (not built inline) so
// it is trivially stubbable in the safety test and a mainnet failure here cannot
// touch the enforced path. Omitted ⇒ no observatory block on the tick.
export interface ObservatoryDeps {
  compute(cex: CexBlock, nowMs: number): Promise<ObservatoryBlock>;
}

export type AgentTick = AgentTickDTO;

export class Engine {
  // start the heartbeat clock at construction so a calm boot doesn't immediately
  // fire a heartbeat submit (calm steady-state ⇒ 0 tx until a real signal or +5min).
  private lastSentMs = Date.now();

  constructor(
    private readonly client: SuiClient,
    private readonly signer: Ed25519Keypair,
    private readonly cfg: AgentConfig,
    private readonly det: Detector,
    private readonly fb: FeatureBuilder,
    private readonly cal: Calibrator,
    private readonly sendOpts: SendOpts,
    // OPTIONAL read-only mainnet observatory. When absent, ticks carry no
    // observatory block and the enforced path is byte-for-byte unchanged.
    private readonly obs?: ObservatoryDeps,
  ) {}

  // Computes the read-only mainnet observatory block, reusing the chain-agnostic
  // CEX block already fetched this tick. STRICTLY display-only: the result is
  // attached ONLY to the returned DTO by tick() — it is NEVER passed into
  // computeRequest / decideRequest / shouldSend / submitOnce. Its OWN try/catch
  // lives in tick() (a mainnet hiccup must never break the enforced tick).
  private async observatory(cex: CexBlock | undefined, nowMs: number): Promise<ObservatoryBlock | undefined> {
    if (!this.obs || !cex) return undefined;
    return this.obs.compute(cex, nowMs);
  }

  // common DTO fields (corridor, internals, identity) shared by every branch.
  private base(
    nowMs: number,
    mode: SceneMode,
    snap: PolicySnapshot,
    cs: CalibratedScore,
    d2: number,
    contributions: Record<string, number>,
  ) {
    return {
      ts: nowMs,
      mode,
      scoreOverall: cs.overall,
      solvency: cs.solvency,
      liquidity: cs.liquidity,
      d2,
      k: this.det.features.length,
      contributions,
      floor: snap.floor,
      baseline: snap.baseline,
      paused: snap.paused,
      // Pure identity metadata: a STATUS MIRROR of the agent's config, attached to
      // every branch via `...this.base(...)`. NEVER read by computeRequest /
      // decideRequest / shouldSend / submitOnce — the decision path never sees it.
      enforcedEnv: this.cfg.enforcedEnv,
    };
  }

  async tick(nowMs: number, scene: Scene = { mode: "calm" }): Promise<AgentTick> {
    // The ENFORCED decision (and the returned DTO) is computed FIRST and in full.
    // `result` + `cex` are the only things the (later, separate, display-only)
    // observatory step touches — it never re-enters the enforced logic below.
    const { result, cex } = await this.enforcedTick(nowMs, scene);

    // READ-ONLY MAINNET observatory — computed STRICTLY AFTER the enforced
    // decision, in its OWN try/catch, and attached ONLY to the returned DTO. A
    // mainnet RPC/Hermes hiccup here degrades to an omitted block; it can NEVER
    // break the enforced tick (already fully computed) or feed it.
    try {
      const observatory = await this.observatory(cex, nowMs);
      if (observatory) result.observatory = observatory;
    } catch {
      /* mainnet observatory hiccup → omit the block; enforced tick is intact */
    }
    return result;
  }

  // The full ENFORCED path. Returns the DTO it built PLUS the chain-agnostic CEX
  // block (fetched once, reused by the observatory). The observatory value never
  // enters here — this is the only code that decides computeRequest / decideRequest
  // / shouldSend / submitOnce.
  private async enforcedTick(nowMs: number, scene: Scene): Promise<{ result: AgentTick; cex?: CexBlock }> {
    const snap = await readPolicy(this.client, this.cfg.policyId);
    const applied = snap.applied;

    if (scene.mode === "dead") {
      // a dead agent emits nothing on-chain; the L1 floor still protects.
      const cs = { overall: 0, solvency: 0, liquidity: 0 };
      return {
        result: { ...this.base(nowMs, "dead", snap, cs, 0, {}), req: applied, applied, sent: false },
      };
    }

    // Fetch the chain-agnostic CEX block ONCE per tick (only when an observatory
    // is present — keeps the no-observatory path's fetch shape unchanged) so it
    // can be reused by BOTH the testnet row and the observatory.
    const cex = this.obs ? await fetchCexBlock() : undefined;

    // live reading + detector (always advance the EWMA, even in calm)
    let row: LiveRow | undefined;
    let cs: CalibratedScore = { overall: 0, solvency: 0, liquidity: 0 };
    let d2 = 0;
    let contributions: Record<string, number> = {};
    try {
      row = await fetchLiveRow(this.client, this.cfg, nowMs, cex);
      const fv = this.fb.push(row);
      if (fv) {
        const sr = this.det.update(fv);
        cs = this.cal.calibrate(sr);
        d2 = sr.d2;
        contributions = sr.contributions;
      }
    } catch {
      /* source hiccup → treat as calm this tick; next tick retries */
    }
    if (scene.mode === "elevate" && scene.override) cs = scene.override;

    // Testnet Pyth↔DeepBook divergence in bps — the symmetry-completer mirroring
    // the mainnet observatory. DISPLAY ONLY: a pure read over `row` data the
    // enforced tick already fetched (no new fetch, no observatory coupling), never
    // passed into computeRequest/decideRequest/shouldSend/submitOnce. Uses the
    // RATIO form 1e4·|pyth−mid|/pyth — the SAME formula the observatory uses
    // (observatory.ts:52) so both cards' divergence rows are computed identically.
    // (features.ts uses a LOG difference; they agree to <0.01 bps at calm levels
    // but are not bit-identical — the ratio is the honest cross-card match.) A
    // book loss-of-signal (book.ok===false / dead branch with no row) omits it →
    // the card reads "no signal", identical to the mainnet card.
    const pyth = row?.values.pyth;
    const divBps =
      row?.book.ok && typeof pyth === "number" && pyth > 0 && row.book.mid != null
        ? 1e4 * (Math.abs(pyth - row.book.mid) / pyth)
        : undefined;

    if (scene.mode === "malicious") {
      // a compromised agent ignores the corridor + ratchet and asks below floor.
      // The contract must clamp it — the trust-min money shot. Explicit operator
      // trigger, so it bypasses the anti-spam cooldown (the FREEZE still blocks).
      const mal: Bps = { maxLtv: 1000, borrowCap: 1000 };
      const hot = { overall: 100, solvency: 100, liquidity: 100 };
      if (snap.paused) {
        return {
          result: { ...this.base(nowMs, "malicious", snap, hot, d2, contributions), req: mal, applied, sent: false, book: row?.book, divBps },
          cex,
        };
      }
      try {
        const r = await submitOnce(this.client, this.signer, this.cfg, mal, 255);
        this.lastSentMs = nowMs;
        const a = r.risk ? { maxLtv: r.risk.maxLtvCurrentBps, borrowCap: r.risk.borrowCapCurrentBps } : applied;
        return {
          result: {
            ...this.base(nowMs, "malicious", snap, hot, d2, contributions),
            req: mal,
            applied: a,
            sent: true,
            digest: r.digest,
            clamped: r.clamped.length,
            book: row?.book,
            divBps,
          },
          cex,
        };
      } catch (e) {
        // submit failed (e.g. out of gas) — still emit the score so the gauge lives.
        console.error(`[submit] malicious-scene submit failed, score-only: ${(e as Error).message}`);
        return {
          result: { ...this.base(nowMs, "malicious", snap, hot, d2, contributions), req: mal, applied, sent: false, book: row?.book, divBps },
          cex,
        };
      }
    }

    // normal path: compute + ratchet against the on-chain applied baseline
    const computed = computeRequest(cs.solvency, cs.liquidity);
    const { req, tighter } = decideRequest(computed, applied);
    // "elevate" is an explicit operator trigger → bypass the anti-spam cooldown
    // (still requires tighter + not paused); calm/autonomous path uses the full gate.
    let send =
      !snap.paused &&
      (scene.mode === "elevate" ? tighter : shouldSend(tighter, nowMs, this.lastSentMs, this.sendOpts));

    let digest: string | undefined;
    let outApplied = applied;
    let clamped: number | undefined;
    if (send) {
      try {
        const r = await submitOnce(this.client, this.signer, this.cfg, req, Math.round(cs.overall));
        this.lastSentMs = nowMs;
        digest = r.digest;
        clamped = r.clamped.length;
        if (r.risk) outApplied = { maxLtv: r.risk.maxLtvCurrentBps, borrowCap: r.risk.borrowCapCurrentBps };
      } catch (e) {
        // The submit tx failed (agent out of gas / RPC hiccup). DISPLAY the score
        // anyway — on-chain enforcement is independent (permissionless keeper +
        // inline floor); a tx error must NEVER blank the gauge. lastSentMs is left
        // unmoved so the next tick retries once the address is funded again.
        console.error(`[submit] failed, score-only this tick: ${(e as Error).message}`);
        send = false;
      }
    }
    return {
      result: {
        ...this.base(nowMs, scene.mode, snap, cs, d2, contributions),
        req,
        applied: outApplied,
        sent: send,
        digest,
        clamped,
        book: row?.book,
        divBps,
      },
      cex,
    };
  }
}
