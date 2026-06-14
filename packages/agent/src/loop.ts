// The tick engine: live row → FeatureBuilder → Detector → calibrate → ratchet →
// send gate → (maybe) submit. Holds the rolling detector/featurebuilder state +
// the send-throttle clock. Calm + in-window ⇒ no tx. Scene overrides let the
// demo force an elevated reading, a malicious agent, or a dead agent.
import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { Detector, FeatureBuilder } from "@seawall/model";
import type { AgentTickDTO } from "@seawall/shared";
import type { AgentConfig } from "./config";
import type { Calibrator, CalibratedScore } from "./calibrate";
import { fetchLiveRow, type LiveRow } from "./live";
import { computeRequest, decideRequest, shouldSend, type Bps, type SendOpts } from "./policy-logic";
import { readPolicy, type PolicySnapshot } from "./onchain";
import { submitOnce } from "./tx";

export type SceneMode = "calm" | "elevate" | "malicious" | "dead";

export interface Scene {
  mode: SceneMode;
  override?: CalibratedScore; // for "elevate": forced calibrated score
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
  ) {}

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
    };
  }

  async tick(nowMs: number, scene: Scene = { mode: "calm" }): Promise<AgentTick> {
    const snap = await readPolicy(this.client, this.cfg.policyId);
    const applied = snap.applied;

    if (scene.mode === "dead") {
      // a dead agent emits nothing on-chain; the L1 floor still protects.
      const cs = { overall: 0, solvency: 0, liquidity: 0 };
      return { ...this.base(nowMs, "dead", snap, cs, 0, {}), req: applied, applied, sent: false };
    }

    // live reading + detector (always advance the EWMA, even in calm)
    let row: LiveRow | undefined;
    let cs: CalibratedScore = { overall: 0, solvency: 0, liquidity: 0 };
    let d2 = 0;
    let contributions: Record<string, number> = {};
    try {
      row = await fetchLiveRow(this.client, this.cfg, nowMs);
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

    if (scene.mode === "malicious") {
      // a compromised agent ignores the corridor + ratchet and asks below floor.
      // The contract must clamp it — the trust-min money shot. Explicit operator
      // trigger, so it bypasses the anti-spam cooldown (the FREEZE still blocks).
      const mal: Bps = { maxLtv: 1000, borrowCap: 1000 };
      const hot = { overall: 100, solvency: 100, liquidity: 100 };
      if (snap.paused) {
        return { ...this.base(nowMs, "malicious", snap, hot, d2, contributions), req: mal, applied, sent: false };
      }
      const r = await submitOnce(this.client, this.signer, this.cfg, mal, 255);
      this.lastSentMs = nowMs;
      const a = r.risk ? { maxLtv: r.risk.maxLtvCurrentBps, borrowCap: r.risk.borrowCapCurrentBps } : applied;
      return {
        ...this.base(nowMs, "malicious", snap, hot, d2, contributions),
        req: mal,
        applied: a,
        sent: true,
        digest: r.digest,
        clamped: r.clamped.length,
        book: row?.book,
      };
    }

    // normal path: compute + ratchet against the on-chain applied baseline
    const computed = computeRequest(cs.solvency, cs.liquidity);
    const { req, tighter } = decideRequest(computed, applied);
    // "elevate" is an explicit operator trigger → bypass the anti-spam cooldown
    // (still requires tighter + not paused); calm/autonomous path uses the full gate.
    const send =
      !snap.paused &&
      (scene.mode === "elevate" ? tighter : shouldSend(tighter, nowMs, this.lastSentMs, this.sendOpts));

    let digest: string | undefined;
    let outApplied = applied;
    let clamped: number | undefined;
    if (send) {
      const r = await submitOnce(this.client, this.signer, this.cfg, req, Math.round(cs.overall));
      this.lastSentMs = nowMs;
      digest = r.digest;
      clamped = r.clamped.length;
      if (r.risk) outApplied = { maxLtv: r.risk.maxLtvCurrentBps, borrowCap: r.risk.borrowCapCurrentBps };
    }
    return {
      ...this.base(nowMs, scene.mode, snap, cs, d2, contributions),
      req,
      applied: outApplied,
      sent: send,
      digest,
      clamped,
      book: row?.book,
    };
  }
}
