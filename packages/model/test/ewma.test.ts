import { describe, it, expect } from "vitest";
import { Ewma } from "../src/ewma";

describe("Ewma", () => {
  it("converges the mean to a constant input and shrinks covariance", () => {
    const e = new Ewma(3);
    // Iteration count is sized to the production default λ_cov = 0.99 (single λ
    // pair, live == backtest). Constant input => deltas decay to zero => the
    // covariance decays as ~λ^n: 0.99^2000 = e^-20 ≈ 2e-9, comfortably < 1e-6.
    // (At the old stale 0.94 default this reached ~0 in a few hundred steps.)
    for (let i = 0; i < 2000; i++) e.update([1, 2, 3]);
    expect(e.mean[0]).toBeCloseTo(1, 6);
    expect(e.mean[1]).toBeCloseTo(2, 6);
    expect(e.mean[2]).toBeCloseTo(3, 6);
    // constant input => deltas are zero => covariance decays toward zero
    expect(Math.abs(e.cov[0][0])).toBeLessThan(1e-6);
    expect(Math.abs(e.cov[1][2])).toBeLessThan(1e-6);
  });

  it("builds positive variance for a varying input", () => {
    const e = new Ewma(2);
    for (let i = 0; i < 200; i++) {
      const t = i * 0.3;
      e.update([Math.sin(t), Math.cos(t)]);
    }
    expect(e.cov[0][0]).toBeGreaterThan(0);
    expect(e.cov[1][1]).toBeGreaterThan(0);
  });

  it("rejects the wrong dimension", () => {
    const e = new Ewma(2);
    e.update([1, 2]);
    expect(() => e.update([1, 2, 3])).toThrow();
  });
});
