import { describe, it, expect } from "vitest";
import { percentileFn, Calibrator } from "../src/calibrate";

describe("percentileFn", () => {
  const p = percentileFn([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  it("maps a value to its calm percentile", () => {
    expect(p(0)).toBe(0); // below all
    expect(p(5)).toBe(50); // 5 of 10 <= 5
    expect(p(10)).toBe(100); // all <= 10
    expect(p(100)).toBe(100); // beyond reference saturates
  });
});

describe("Calibrator (χ²-CDF + calm dead-zone)", () => {
  const cal = new Calibrator(5, 2, 3); // kAll, kSolv, kLiq (live feature groups)

  it("a warmup reading (score 0) stays 0", () => {
    expect(cal.calibrate({ score: 0, d2: 999, contributions: {}, groupD2: {} })).toEqual({
      overall: 0,
      solvency: 0,
      liquidity: 0,
    });
  });

  it("a CALM d² (≈k, inside the dead-zone) reads 0 — the whole point", () => {
    // χ²(5) median ≈ 4.35, χ²(2)/χ²(3) likewise centered at k → all below P0=0.90.
    const c = cal.calibrate({ score: 1, d2: 5, contributions: {}, groupD2: { solvency: 2, liquidity: 3 } });
    expect(c.overall).toBe(0);
    expect(c.solvency).toBe(0);
    expect(c.liquidity).toBe(0);
  });

  it("a deep-tail d² saturates to 100", () => {
    const c = cal.calibrate({ score: 50, d2: 99999, contributions: {}, groupD2: { solvency: 99999, liquidity: 99999 } });
    expect(c.overall).toBe(100);
    expect(c.solvency).toBe(100);
  });

  it("a tail d² (past the dead-zone) lifts strictly between 0 and 100", () => {
    // χ²(5) 95th pct = 11.07 (> the ~9.2 dead-zone edge) → score > 0, < 100.
    const c = cal.calibrate({ score: 50, d2: 14, contributions: {}, groupD2: { solvency: 8, liquidity: 11 } });
    expect(c.overall).toBeGreaterThan(0);
    expect(c.overall).toBeLessThan(100);
    expect(c.solvency).toBeGreaterThan(0);
  });

  it("forFeatures derives component df from the feature groups", () => {
    const c = Calibrator.forFeatures(["disp", "div", "divvel", "volvel", "mktvol"]);
    // solvency={div,divvel}=2, liquidity={disp,volvel,mktvol}=3; a calm d² still reads 0
    expect(c.calibrate({ score: 1, d2: 5, contributions: {}, groupD2: { solvency: 2, liquidity: 3 } }).overall).toBe(0);
  });
});
