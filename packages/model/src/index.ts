import type { FeatureVector, ScoreResult, ParamRequest } from "@seawall/shared";
import { Ewma } from "./ewma";
import { shrinkCov, mahalanobis, subDistance } from "./mahalanobis";
import { d2ToScore, scoreToParams } from "./score";

export * from "./ewma";
export * from "./linalg";
export * from "./mahalanobis";
export * from "./chisq";
export * from "./score";
export * from "./align";
export * from "./features";

// Default feature set (target token only). A market-aware run adds "mktvol";
// the live agent also adds depth ("imb"/"spread"). The detector works on
// whatever feature list you hand it.
export const DEFAULT_FEATURES = ["disp", "div", "divvel", "volvel"];

// Which features feed which lending parameter. max_ltv reacts to oracle/price
// correctness (solvency); borrow_cap reacts to liquidity and systemic stress,
// which is where market-wide volatility ("mktvol") belongs too.
export const GROUP_FEATURES: Record<string, readonly string[]> = {
  solvency: ["div", "divvel"],
  liquidity: ["disp", "volvel", "mktvol", "imb", "spread"],
};
export const PARAM_GROUP = { maxLtv: "solvency", borrowCap: "liquidity" } as const;

export function featuresToArray(x: FeatureVector, features: readonly string[]): number[] {
  return features.map((key) => {
    const v = x[key as keyof FeatureVector];
    return typeof v === "number" ? v : 0;
  });
}

export interface DetectorOptions {
  warmup?: number;
  lambdas?: { mean?: number; cov?: number };
}

// Streaming EWMA-Mahalanobis anomaly detector over a configurable feature list.
// Feed one feature vector per tick; get a 0-100 score, per-feature
// contributions, and the per-component (solvency/liquidity) sub-distances.
export class Detector {
  readonly features: string[];
  readonly warmup: number;
  private ewma: Ewma;
  private seen = 0;
  private groupIdx: Record<string, number[]>;

  constructor(features: string[] = [...DEFAULT_FEATURES], opts: DetectorOptions = {}) {
    this.features = features;
    this.warmup = opts.warmup ?? 60;
    this.ewma = new Ewma(features.length, opts.lambdas?.mean, opts.lambdas?.cov);
    this.groupIdx = Object.fromEntries(
      Object.entries(GROUP_FEATURES).map(([g, feats]) => [
        g,
        feats.map((f) => features.indexOf(f)).filter((i) => i >= 0),
      ]),
    );
  }

  update(x: FeatureVector | number[]): ScoreResult {
    const vec = Array.isArray(x) ? x : featuresToArray(x, this.features);
    this.ewma.update(vec);
    this.seen += 1;

    const zeroGroups = Object.fromEntries(Object.keys(GROUP_FEATURES).map((g) => [g, 0]));
    if (this.seen <= this.warmup) {
      return {
        score: 0,
        d2: 0,
        contributions: Object.fromEntries(this.features.map((n) => [n, 0])),
        groupD2: zeroGroups,
      };
    }

    const diff = vec.map((v, i) => v - this.ewma.mean[i]); // x_t - μ_t
    const sigma = shrinkCov(this.ewma.cov);
    const { d2, contributions } = mahalanobis(sigma, diff);
    const score = d2ToScore(d2, this.features.length);
    const contribMap = Object.fromEntries(this.features.map((n, i) => [n, contributions[i]]));
    const groupD2 = Object.fromEntries(
      Object.entries(this.groupIdx).map(([g, idx]) => [g, subDistance(sigma, diff, idx)]),
    );
    return { score, d2, contributions: contribMap, groupD2 };
  }

  paramsFor(score: number): ParamRequest {
    const { maxLtv, borrowCap } = scoreToParams(score);
    return { maxLtv, borrowCap };
  }
}
