import { describe, it, expect } from "vitest";
import { cholesky, solveLower, solveUpperT } from "../src/linalg";
import { mahalanobis } from "../src/mahalanobis";

describe("cholesky", () => {
  it("factors a known SPD matrix", () => {
    const L = cholesky([
      [4, 2],
      [2, 3],
    ]);
    expect(L[0][0]).toBeCloseTo(2, 9);
    expect(L[1][0]).toBeCloseTo(1, 9);
    expect(L[1][1]).toBeCloseTo(Math.sqrt(2), 9);
  });

  it("solves L y = b and Lᵀ z = y consistently", () => {
    const A = [
      [4, 2],
      [2, 3],
    ];
    const L = cholesky(A);
    const b = [1, 2];
    const y = solveLower(L, b);
    const z = solveUpperT(L, y); // z = A⁻¹ b
    // A z should equal b
    expect(A[0][0] * z[0] + A[0][1] * z[1]).toBeCloseTo(b[0], 9);
    expect(A[1][0] * z[0] + A[1][1] * z[1]).toBeCloseTo(b[1], 9);
  });
});

describe("mahalanobis", () => {
  it("reduces to sum of squares for the identity", () => {
    const I = [
      [1, 0],
      [0, 1],
    ];
    const { d2, contributions } = mahalanobis(I, [3, 4]);
    expect(d2).toBeCloseTo(25, 9);
    expect(contributions[0]).toBeCloseTo(9, 9);
    expect(contributions[1]).toBeCloseTo(16, 9);
  });

  it("contributions always sum to d2", () => {
    const cov = [
      [2, 0.5, 0.1],
      [0.5, 1.5, 0.2],
      [0.1, 0.2, 1.0],
    ];
    const diff = [1.2, -0.7, 0.4];
    const { d2, contributions } = mahalanobis(cov, diff);
    const sum = contributions.reduce((a, v) => a + v, 0);
    expect(sum).toBeCloseTo(d2, 9);
  });
});
