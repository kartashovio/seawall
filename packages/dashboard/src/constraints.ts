// DISPLAY-ONLY mirrors of the two formulas that decide the live lending params, so
// the dashboard can show WHY each param sits where it does (agent score-target vs
// the contract's own-divergence target vs what's applied). These reproduce existing
// logic; they DO NOT drive anything on-chain or in the agent. They are pinned to the
// real model + Move contract by constraints.test.ts (same integer arithmetic).
import {
  MAX_LTV_BPS,
  BORROW_CAP_BPS,
  SCORE_LO,
  SCORE_MID,
  SCORE_HI,
  LOGISTIC_GAMMA,
  D_CAUTION,
  T_FREEZE,
} from "@seawall/shared";

export interface Bps {
  maxLtv: number;
  borrowCap: number;
}

// ── mirror of packages/model/src/score.ts (scoreToFraction / scoreToParams) ──────
function scoreToFraction(score: number): number {
  if (score <= SCORE_LO) return 1;
  if (score >= SCORE_HI) return 0;
  const raw = (s: number): number => 1 / (1 + Math.exp(LOGISTIC_GAMMA * (s - SCORE_MID)));
  const lo = raw(SCORE_LO);
  const hi = raw(SCORE_HI);
  return (raw(score) - hi) / (lo - hi);
}
function paramFromScore(score: number, floor: number, baseline: number): number {
  return Math.round(floor + scoreToFraction(score) * (baseline - floor));
}

/// The agent's UNCONSTRAINED score→param target (pre-ratchet), in bps. This is what
/// the agent "wants"; the contract may clamp it tighter and the ratchet/relax-gate
/// may hold it. solvency → max_ltv, liquidity → borrow_cap (the model's split).
export function agentTarget(solvency: number, liquidity: number): Bps {
  return {
    maxLtv: paramFromScore(solvency, MAX_LTV_BPS.floor, MAX_LTV_BPS.baseline),
    borrowCap: paramFromScore(liquidity, BORROW_CAP_BPS.floor, BORROW_CAP_BPS.baseline),
  };
}

// ── mirror of guardian.move own_tier / tier_target (integer division, by design) ─
// Divergence-only legs (the conf/book legs only push the tier UP and aren't in the
// display DTO). div is the 1e9 fraction the contract uses; divBps × 1e5 = that.
function ownTier(div1e9: number): number {
  const d = Number(D_CAUTION);
  const t = Number(T_FREEZE);
  if (div1e9 < d) return 0;
  const span = t - d;
  if (div1e9 >= d + Math.floor((span * 2) / 3)) return 3;
  if (div1e9 >= d + Math.floor(span / 3)) return 2;
  return 1;
}
function tierTarget(floor: number, baseline: number, tier: number): number {
  const span = baseline - floor;
  return baseline - Math.floor((span * tier) / 3);
}

/// The contract's OWN coarse divergence-tier target (agent-independent), in bps —
/// the deterministic safety net the contract applies from its own measured
/// divergence. The applied param is `tighter_of(agent, contract_own)`.
export function contractTarget(divBps: number): Bps {
  const div1e9 = divBps * 1e5; // bps → 1e9 fraction
  const tier = ownTier(div1e9);
  return {
    maxLtv: tierTarget(MAX_LTV_BPS.floor, MAX_LTV_BPS.baseline, tier),
    borrowCap: tierTarget(BORROW_CAP_BPS.floor, BORROW_CAP_BPS.baseline, tier),
  };
}

export type BoundBy = "agent" | "contract" | "agent + contract" | "ratchet";

export interface ParamExplain {
  applied: number;
  agentWants: number;
  contractFloor: number;
  boundBy: BoundBy;
  agentWantsLooser: boolean; // the agent's target is looser than what's applied
}

/// Per-param: who is the binding constraint, and is the agent being held from
/// loosening. `tighter` = min(agent, contract); if applied is below even that, a
/// past tighter state is ratchet-held (relax gated).
export function explainParam(applied: number, agentWants: number, contractFloor: number): ParamExplain {
  const tighter = Math.min(agentWants, contractFloor);
  let boundBy: BoundBy;
  if (applied < tighter) boundBy = "ratchet";
  else if (contractFloor < agentWants) boundBy = "contract";
  else if (agentWants < contractFloor) boundBy = "agent";
  else boundBy = "agent + contract";
  return {
    applied,
    agentWants,
    contractFloor,
    boundBy,
    agentWantsLooser: agentWants > applied,
  };
}
