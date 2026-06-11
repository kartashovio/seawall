import { SHRINKAGE, EPS } from "@seawall/shared";
import { cholesky, solveLower, solveUpperT } from "./linalg";

// Ledoit-Wolf-style shrinkage with a fixed weight: pull the covariance toward
// a scaled identity, then add a tiny ridge. Keeps the matrix well-conditioned
// so the Cholesky never blows up.
export function shrinkCov(cov: number[][], delta = SHRINKAGE, eps = EPS): number[][] {
  const k = cov.length;
  let tr = 0;
  for (let i = 0; i < k; i++) tr += cov[i][i];
  const avg = tr / k;
  return cov.map((row, i) =>
    row.map((v, j) => (1 - delta) * v + (i === j ? delta * avg + eps : 0)),
  );
}

export interface MahalanobisResult {
  d2: number; // squared Mahalanobis distance
  z: number[]; // Σ⁻¹ · diff
  contributions: number[]; // diffᵢ · zᵢ, sums to d2
}

// d² = diffᵀ Σ⁻¹ diff via Cholesky: Σ = LLᵀ, solve L y = diff, d² = yᵀy.
// z = Σ⁻¹ diff (solve Lᵀ z = y) gives the per-feature contribution
// cᵢ = diffᵢ·zᵢ, and Σ cᵢ = d² exactly.
export function mahalanobis(cov: number[][], diff: number[]): MahalanobisResult {
  const L = cholesky(cov);
  const y = solveLower(L, diff);
  const d2 = y.reduce((a, v) => a + v * v, 0);
  const z = solveUpperT(L, y);
  const contributions = diff.map((d, i) => d * z[i]);
  return { d2, z, contributions };
}

// Marginal squared distance over a subset of features. Uses the corresponding
// sub-block of the covariance (the marginal of a Gaussian), so it measures how
// anomalous just those features are on their own. Lets us score risk
// "components" (e.g. oracle divergence vs liquidity) separately from one model.
export function subDistance(cov: number[][], diff: number[], indices: number[]): number {
  if (indices.length === 0) return 0;
  const sub = indices.map((i) => diff[i]);
  const subCov = indices.map((i) => indices.map((j) => cov[i][j]));
  return mahalanobis(subCov, sub).d2;
}
