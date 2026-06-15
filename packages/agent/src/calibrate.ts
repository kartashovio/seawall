// Maps the detector's squared Mahalanobis distance d² to a 0–100 risk score via
// the χ²(k) CDF with a calm dead-zone. The EWMA covariance is itself an adaptive
// (RiskMetrics-style) calm baseline, so a genuinely calm market's d² centers at
// χ²(k)≈k; the dead-zone reads that calm body as ~0 and the score only lifts as
// the joint state enters the χ²(k) tail — the gauge reads near zero on a calm
// market BY CONSTRUCTION, with no frozen warmup reference to rot. The calibrated
// score feeds the param map (solvency→max_ltv, liquidity→borrow_cap), the gauge,
// and the advisory_score event field. The score stays DIRECTIONLESS (a turbulence
// magnitude, not a price-direction forecast) and off the on-chain decision path.
import type { ScoreResult } from "@seawall/shared";
import { SCORE_SMOOTH_ALPHA } from "@seawall/shared";
import { chi2cdf, GROUP_FEATURES } from "@seawall/model";

export interface CalibratedScore {
  overall: number;
  solvency: number;
  liquidity: number;
}

/// EWMA-smooth a calibrated score against its previous value (one number per
/// component). SHARED by both legs (the enforced loop + the mainnet observatory) so
/// the smoothing is literally identical — only the `prev` state differs (each leg
/// keeps its OWN, so they stay independent). `prev` undefined ⇒ pass `next` through.
export function smoothScore(
  prev: CalibratedScore | undefined,
  next: CalibratedScore,
  alpha: number = SCORE_SMOOTH_ALPHA,
): CalibratedScore {
  if (!prev) return next;
  const e = (n: number, p: number): number => alpha * n + (1 - alpha) * p;
  return {
    overall: e(next.overall, prev.overall),
    solvency: e(next.solvency, prev.solvency),
    liquidity: e(next.liquidity, prev.liquidity),
  };
}

/// Empirical percentile of x against a sorted reference (0–100). Retained +
/// exported: the BACKTEST fits its OWN per-event calm percentile with this (a
/// reference that stays consistent within a single replay), and the unit tests
/// cover it. The LIVE path no longer uses it — it rotted once the EWMA covariance
/// self-adapted past the one-time frozen warmup baseline (a now-normal d² mapped
/// to an inflated percentile). The χ²-CDF mapping below removes that reference.
export function percentileFn(sorted: number[]): (x: number) => number {
  return (x: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return sorted.length ? (100 * lo) / sorted.length : 0;
  };
}

// Calm dead-zone: the χ²(k) probability mass treated as the "calm body". Below the
// P0 quantile → score 0; above → rescaled into (0,100]. 0.90 puts the 0-point near
// the χ²(k) ~90th pct (k=5 → d²≈9.2), just under the 95th-pct trip line (11.07),
// so the gauge lift-off and the contract's own freeze trip agree.
const P0 = 0.9;

function d2ToCalmScore(d2: number, k: number): number {
  if (d2 <= 0 || k <= 0) return 0;
  const p = chi2cdf(d2, k); // P(D² ≤ d2) under the χ²(k) null
  return 100 * Math.max(0, (p - P0) / (1 - P0));
}

export class Calibrator {
  // per-component χ² degrees of freedom = the feature-count of each sub-block (the
  // same indices subDistance integrates over): overall = k, solvency, liquidity.
  constructor(
    private readonly kAll: number,
    private readonly kSolv: number,
    private readonly kLiq: number,
  ) {}

  /// Build a calibrator whose component df match a detector's feature groups.
  static forFeatures(features: string[]): Calibrator {
    const n = (g: string): number => GROUP_FEATURES[g].filter((f) => features.includes(f)).length;
    return new Calibrator(features.length, n("solvency"), n("liquidity"));
  }

  /// A warmup reading (score 0) stays 0; otherwise map each d² through the χ²(k)
  /// tail with the calm dead-zone.
  calibrate(r: ScoreResult): CalibratedScore {
    if (r.score === 0) return { overall: 0, solvency: 0, liquidity: 0 };
    return {
      overall: d2ToCalmScore(r.d2, this.kAll),
      solvency: d2ToCalmScore(r.groupD2.solvency ?? 0, this.kSolv),
      liquidity: d2ToCalmScore(r.groupD2.liquidity ?? 0, this.kLiq),
    };
  }
}
