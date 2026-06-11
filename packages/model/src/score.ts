import {
  SCORE_LO,
  SCORE_HI,
  SCORE_MID,
  LOGISTIC_GAMMA,
  MAX_LTV,
  BORROW_CAP,
} from "@seawall/shared";
import { chi2cdf } from "./chisq";

// Map a squared Mahalanobis distance to a 0-100 score via the chi-squared CDF.
// Nominal reference (MVN null): d² ~ χ²(k). On real, heavy-tailed features the
// bands get re-calibrated to calm-period percentiles during the backtest, but
// the χ² CDF is the baseline.
export function d2ToScore(d2: number, k: number): number {
  return 100 * chi2cdf(d2, k);
}

// Corridor fraction f ∈ [0,1]: 1 = baseline (loosest), 0 = floor (tightest).
// Dead-band below SCORE_LO (no tightening on noise), logistic in the middle
// normalized to hit 1 at SCORE_LO and 0 at SCORE_HI, floor above SCORE_HI.
export function scoreToFraction(score: number): number {
  if (score <= SCORE_LO) return 1;
  if (score >= SCORE_HI) return 0;
  const raw = (s: number) => 1 / (1 + Math.exp(LOGISTIC_GAMMA * (s - SCORE_MID)));
  const lo = raw(SCORE_LO);
  const hi = raw(SCORE_HI);
  return (raw(score) - hi) / (lo - hi);
}

// Tighten-only parameter targets. The agent sends these; the contract clamps
// them to [floor, baseline] and only accepts moves toward floor.
export function scoreToParams(score: number): { maxLtv: number; borrowCap: number } {
  const f = scoreToFraction(score);
  const lerp = (c: { floor: number; baseline: number }) => c.floor + f * (c.baseline - c.floor);
  return { maxLtv: lerp(MAX_LTV), borrowCap: lerp(BORROW_CAP) };
}
