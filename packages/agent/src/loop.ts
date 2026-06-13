// The tick engine: live row → FeatureBuilder → Detector → calibrate → ratchet →
// send gate → (maybe) submit. Holds the rolling detector/featurebuilder state +
// the send-throttle clock. Calm + in-window ⇒ no tx. Scene overrides let the
// demo force an elevated reading, a malicious agent, or a dead agent.
import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { Detector, FeatureBuilder } from "@seawall/model";
import type { AgentConfig } from "./config";
import type { Calibrator, CalibratedScore } from "./calibrate";
import { fetchLiveRow, type LiveRow } from "./live";
import { computeRequest, decideRequest, shouldSend, type Bps, type SendOpts } from "./policy-logic";
import { readPolicy } from "./onchain";
import { submitOnce } from "./tx";

export type SceneMode = "calm" | "elevate" | "malicious" | "dead";

export interface Scene {
  mode: SceneMode;
  override?: CalibratedScore; // for "elevate": forced calibrated score
}

export interface AgentTick {
  ts: number;
  mode: SceneMode;
  scoreOverall: number;
  solvency: number;
  liquidity: number;
  req: Bps;
  applied: Bps;
  paused: boolean;
  sent: boolean;
  digest?: string;
  clamped?: number;
  book?: LiveRow["book"];
}

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

  async tick(nowMs: number, scene: Scene = { mode: "calm" }): Promise<AgentTick> {
    const snap = await readPolicy(this.client, this.cfg.policyId);
    const applied = snap.applied;

    if (scene.mode === "dead") {
      // a dead agent emits nothing on-chain; the L1 floor still protects.
      return { ts: nowMs, mode: "dead", scoreOverall: 0, solvency: 0, liquidity: 0, req: applied, applied, paused: snap.paused, sent: false };
    }

    // live reading + detector (always advance the EWMA, even in calm)
    let row: LiveRow | undefined;
    let cs: CalibratedScore = { overall: 0, solvency: 0, liquidity: 0 };
    try {
      row = await fetchLiveRow(this.client, this.cfg, nowMs);
      const fv = this.fb.push(row);
      if (fv) cs = this.cal.calibrate(this.det.update(fv));
    } catch {
      /* source hiccup → treat as calm this tick; next tick retries */
    }
    if (scene.mode === "elevate" && scene.override) cs = scene.override;

    if (scene.mode === "malicious") {
      // a compromised agent ignores the corridor + ratchet and asks below floor.
      // The contract must clamp it — the trust-min money shot. Explicit operator
      // trigger, so it bypasses the anti-spam cooldown (the FREEZE still blocks).
      if (snap.paused) {
        return { ts: nowMs, mode: "malicious", scoreOverall: 100, solvency: 100, liquidity: 100, req: { maxLtv: 1000, borrowCap: 1000 }, applied, paused: snap.paused, sent: false };
      }
      const r = await submitOnce(this.client, this.signer, this.cfg, { maxLtv: 1000, borrowCap: 1000 }, 255);
      this.lastSentMs = nowMs;
      const a = r.risk ? { maxLtv: r.risk.maxLtvCurrentBps, borrowCap: r.risk.borrowCapCurrentBps } : applied;
      return { ts: nowMs, mode: "malicious", scoreOverall: 100, solvency: 100, liquidity: 100, req: { maxLtv: 1000, borrowCap: 1000 }, applied: a, paused: snap.paused, sent: true, digest: r.digest, clamped: r.clamped.length, book: row?.book };
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
      ts: nowMs,
      mode: scene.mode,
      scoreOverall: cs.overall,
      solvency: cs.solvency,
      liquidity: cs.liquidity,
      req,
      applied: outApplied,
      paused: snap.paused,
      sent: send,
      digest,
      clamped,
      book: row?.book,
    };
  }
}
