import type { FeatureVector, ScoreResult, ParamRequest } from "@seawall/shared";
import { Ewma } from "./ewma";
import { shrinkCov, mahalanobis } from "./mahalanobis";
import { d2ToScore, scoreToParams } from "./score";

export * from "./ewma";
export * from "./linalg";
export * from "./mahalanobis";
export * from "./chisq";
export * from "./score";
export * from "./align";
export * from "./features";

const ORDER_4 = ["disp", "div", "divvel", "volvel"] as const;
const ORDER_6 = [...ORDER_4, "imb", "spread"] as const;

export function featuresToArray(x: FeatureVector, k: number): number[] {
  const order = k === 6 ? ORDER_6 : ORDER_4;
  return order.map((key) => {
    const v = x[key as keyof FeatureVector];
    return typeof v === "number" ? v : 0;
  });
}

// Streaming EWMA-Mahalanobis anomaly detector. Feed one feature vector per
// tick; get back a 0-100 score plus how much each feature contributed.
export class Detector {
  readonly k: 4 | 6;
  readonly warmup: number;
  private ewma: Ewma;
  private seen = 0;

  constructor(k: 4 | 6 = 4, warmup = 60) {
    this.k = k;
    this.warmup = warmup;
    this.ewma = new Ewma(k);
  }

  update(x: FeatureVector | number[]): ScoreResult {
    const vec = Array.isArray(x) ? x : featuresToArray(x, this.k);
    this.ewma.update(vec);
    this.seen += 1;
    const order = this.k === 6 ? ORDER_6 : ORDER_4;

    if (this.seen <= this.warmup) {
      return { score: 0, d2: 0, contributions: Object.fromEntries(order.map((n) => [n, 0])) };
    }

    const diff = vec.map((v, i) => v - this.ewma.mean[i]); // x_t - μ_t
    const sigma = shrinkCov(this.ewma.cov);
    const { d2, contributions } = mahalanobis(sigma, diff);
    const score = d2ToScore(d2, this.k);
    const contribMap = Object.fromEntries(order.map((n, i) => [n, contributions[i]]));
    return { score, d2, contributions: contribMap };
  }

  // Tighten-only parameter request derived from a score.
  paramsFor(score: number): ParamRequest {
    const { maxLtv, borrowCap } = scoreToParams(score);
    return { maxLtv, borrowCap };
  }
}
