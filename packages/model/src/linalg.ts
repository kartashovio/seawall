// Small dense linear algebra for the Mahalanobis distance. Matrices are
// row-major number[][], symmetric positive-definite where required.

// Cholesky factorization A = L Lᵀ, returns the lower-triangular L.
// Assumes A is SPD; the diagonal is floored to stay positive under rounding.
export function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let m = 0; m < j; m++) s -= L[i][m] * L[j][m];
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(s, 1e-15));
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return L;
}

// Solve L y = b for y (forward substitution).
export function solveLower(L: number[][], b: number[]): number[] {
  const n = b.length;
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let j = 0; j < i; j++) s -= L[i][j] * y[j];
    y[i] = s / L[i][i];
  }
  return y;
}

// Solve Lᵀ z = y for z (back substitution).
export function solveUpperT(L: number[][], y: number[]): number[] {
  const n = y.length;
  const z = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let j = i + 1; j < n; j++) s -= L[j][i] * z[j];
    z[i] = s / L[i][i];
  }
  return z;
}
