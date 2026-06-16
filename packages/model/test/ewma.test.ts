import { describe, it, expect } from "vitest";
import { Ewma } from "../src/ewma";
import { LAMBDA_COV } from "@seawall/shared";

describe("Ewma", () => {
  it("converges the mean to a constant input and shrinks covariance", () => {
    const e = new Ewma(3);
    // Constant input => deltas decay to zero => the covariance decays as ~λ_cov^n.
    // Size the iteration count to the ACTUAL λ_cov (so this stays valid if the cov
    // decay is retuned): need λ^N < 1e-7 (margin below the 1e-6 assert), plus a
    // transient allowance for the mean to converge first.
    const N = Math.ceil(Math.log(1e-7) / Math.log(LAMBDA_COV)) + 300;
    for (let i = 0; i < N; i++) e.update([1, 2, 3]);
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
