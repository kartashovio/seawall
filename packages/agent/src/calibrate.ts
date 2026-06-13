// Empirical-percentile calibrator (mirrors backtest-lib). Raw χ² d²→score
// saturates near 100 on real heavy-tailed features; we map each d² to its
// percentile against the calm-window reference — overall + per component
// (solvency drives max_ltv, liquidity drives borrow_cap). The calibrated score
// feeds the param map, the gauge, and the advisory_score event field.
import type { ScoreResult } from "@seawall/shared";

export interface CalibratedScore {
  overall: number;
  solvency: number;
  liquidity: number;
}

/// Empirical percentile of x against a sorted reference (0–100).
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

export class Calibrator {
  private readonly pAll: (x: number) => number;
  private readonly pSolv: (x: number) => number;
  private readonly pLiq: (x: number) => number;
  readonly samples: number;

  constructor(allD2: number[], solvD2: number[], liqD2: number[]) {
    this.pAll = percentileFn([...allD2].sort((a, b) => a - b));
    this.pSolv = percentileFn([...solvD2].sort((a, b) => a - b));
    this.pLiq = percentileFn([...liqD2].sort((a, b) => a - b));
    this.samples = allD2.length;
  }

  /// A warmup reading (score 0) stays 0; otherwise map d² → calm percentile.
  calibrate(r: ScoreResult): CalibratedScore {
    if (r.score === 0) return { overall: 0, solvency: 0, liquidity: 0 };
    return {
      overall: this.pAll(r.d2),
      solvency: this.pSolv(r.groupD2.solvency ?? 0),
      liquidity: this.pLiq(r.groupD2.liquidity ?? 0),
    };
  }
}
