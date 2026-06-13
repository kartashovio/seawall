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

describe("Calibrator", () => {
  const calm = Array.from({ length: 100 }, (_, i) => i + 1); // d² calm reference 1..100
  const cal = new Calibrator(calm, calm, calm);
  it("a warmup reading (score 0) stays 0", () => {
    expect(cal.calibrate({ score: 0, d2: 999, contributions: {}, groupD2: {} })).toEqual({
      overall: 0,
      solvency: 0,
      liquidity: 0,
    });
  });
  it("an extreme post-warmup d² calibrates to ~100", () => {
    const c = cal.calibrate({ score: 50, d2: 99999, contributions: {}, groupD2: { solvency: 99999, liquidity: 99999 } });
    expect(c.overall).toBe(100);
    expect(c.solvency).toBe(100);
  });
  it("a mid d² lands near its calm percentile", () => {
    const c = cal.calibrate({ score: 50, d2: 50, contributions: {}, groupD2: { solvency: 50, liquidity: 25 } });
    expect(c.overall).toBe(50);
    expect(c.liquidity).toBe(25);
  });
});
