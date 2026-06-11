import type { FeatureVector, ScoreResult } from "@seawall/shared";

// Streaming anomaly detector. Feed it one feature vector per tick and it
// returns a 0-100 score plus how much each feature contributed.
//
// The implementation lands next, in this order: ewma (running mean/cov) ->
// linalg (Cholesky solve) -> chisq (incomplete gamma) -> mahalanobis -> score.
// See docs/ml-plan.md.
export interface Detector {
  update(x: FeatureVector): ScoreResult;
}
