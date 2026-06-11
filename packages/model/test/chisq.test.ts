import { describe, it, expect } from "vitest";
import { gammp, chi2cdf } from "../src/chisq";
import { d2ToScore } from "../src/score";

describe("incomplete gamma / chi-squared", () => {
  it("gammp(1, x) = 1 - e^-x", () => {
    expect(gammp(1, 1)).toBeCloseTo(1 - Math.exp(-1), 8);
    expect(gammp(1, 2)).toBeCloseTo(1 - Math.exp(-2), 8);
  });

  it("chi2cdf(x, 2) = 1 - e^(-x/2)", () => {
    expect(chi2cdf(2, 2)).toBeCloseTo(1 - Math.exp(-1), 8); // 0.6321
    expect(chi2cdf(4, 2)).toBeCloseTo(1 - Math.exp(-2), 8);
  });

  it("chi2cdf is 0 at 0 and approaches 1 for large x", () => {
    expect(chi2cdf(0, 4)).toBe(0);
    expect(chi2cdf(100, 4)).toBeGreaterThan(0.999);
  });

  it("d2ToScore maps into [0,100] and is monotone", () => {
    expect(d2ToScore(0, 4)).toBeCloseTo(0, 6);
    expect(d2ToScore(50, 4)).toBeGreaterThan(99);
    expect(d2ToScore(8, 4)).toBeGreaterThan(d2ToScore(4, 4));
  });
});
