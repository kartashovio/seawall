// Pure decision logic between the ML score and the on-chain submit. No I/O — so
// the one-way ratchet and the send gate (the trust-min invariants the agent must
// honor off-chain) are unit-testable in isolation.
//
// The contract clamps + ratchets again on its side; this just keeps the agent
// from ever ORIGINATING a looser-than-applied request (correctness #16: the
// ratchet baseline is the on-chain APPLIED value, never the agent's own request).
import {
  MAX_LTV_BPS,
  BORROW_CAP_BPS,
  AGENT_HEARTBEAT_MS,
  RESUBMIT_COOLDOWN_MS,
} from "@seawall/shared";
import { scoreToParams } from "@seawall/model";

export interface Bps {
  maxLtv: number;
  borrowCap: number;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(x, hi));

/// Percent corridor (what the ML reads) → on-chain bps (×100).
export function toBps(p: { maxLtv: number; borrowCap: number }): Bps {
  return { maxLtv: Math.round(p.maxLtv * 100), borrowCap: Math.round(p.borrowCap * 100) };
}

/// Never outside [floor, baseline] — the contract would clamp anyway, but the
/// agent stays inside so its requests read as honored, not clamped.
export function clampToCorridor(b: Bps): Bps {
  return {
    maxLtv: clamp(b.maxLtv, MAX_LTV_BPS.floor, MAX_LTV_BPS.baseline),
    borrowCap: clamp(b.borrowCap, BORROW_CAP_BPS.floor, BORROW_CAP_BPS.baseline),
  };
}

/// solvency score → max_ltv, liquidity score → borrow_cap (the model's split),
/// in clamped on-chain bps.
export function computeRequest(solvencyScore: number, liquidityScore: number): Bps {
  return clampToCorridor(toBps(scoreToParams(solvencyScore, liquidityScore)));
}

/// One-way ratchet against the on-chain APPLIED baseline: the agent only ever
/// proposes TIGHTER-or-equal. A looser score target is dropped (the contract
/// relaxes on its own gated drip — never on an agent ask). Returns the request
/// to submit + whether it's strictly tighter than applied (the send condition).
export function decideRequest(computed: Bps, lastApplied: Bps): { req: Bps; tighter: boolean } {
  const req = {
    maxLtv: Math.min(computed.maxLtv, lastApplied.maxLtv),
    borrowCap: Math.min(computed.borrowCap, lastApplied.borrowCap),
  };
  const tighter = req.maxLtv < lastApplied.maxLtv || req.borrowCap < lastApplied.borrowCap;
  return { req, tighter };
}

export interface SendOpts {
  heartbeatMs: number;
  resubmitCooldownMs: number;
}

export const DEFAULT_SEND_OPTS: SendOpts = {
  heartbeatMs: AGENT_HEARTBEAT_MS,
  resubmitCooldownMs: RESUBMIT_COOLDOWN_MS,
};

/// Send iff (A) strictly tighter than applied AND past the resubmit cooldown,
/// OR (B) the heartbeat elapsed. Calm + inside the heartbeat window ⇒ 0 tx.
export function shouldSend(tighter: boolean, now: number, lastSentMs: number, opts: SendOpts): boolean {
  if (tighter && now - lastSentMs >= opts.resubmitCooldownMs) return true;
  if (now - lastSentMs >= opts.heartbeatMs) return true;
  return false;
}
