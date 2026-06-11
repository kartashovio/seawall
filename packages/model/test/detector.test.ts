import { describe, it, expect } from "vitest";
import { Detector } from "../src/index";

// deterministic, bounded, varying feed (no RNG) to build a covariance
function feedBaseline(d: Detector, n: number): void {
  for (let i = 0; i < n; i++) {
    const t = i * 0.3;
    d.update([Math.sin(t), Math.cos(t * 1.3), Math.sin(t * 0.7), Math.cos(t * 2.1)]);
  }
}

describe("Detector", () => {
  it("stays silent during warm-up", () => {
    const d = new Detector(4, 30);
    let last = -1;
    for (let i = 0; i < 30; i++) {
      const t = i * 0.3;
      last = d.update([Math.sin(t), Math.cos(t), Math.sin(t), Math.cos(t)]).score;
    }
    expect(last).toBe(0);
  });

  it("scores a clear outlier high and a typical point low", () => {
    const d = new Detector(4, 0);
    feedBaseline(d, 200);
    // a point far outside the learned distribution
    const outlier = d.update([8, 8, 8, 8]);
    expect(outlier.score).toBeGreaterThan(90);
    expect(outlier.d2).toBeGreaterThan(0);
    // a fresh typical sample sits low
    const typical = d.update([Math.sin(60), Math.cos(60 * 1.3), Math.sin(60 * 0.7), Math.cos(60 * 2.1)]);
    expect(typical.score).toBeLessThan(80);
    expect(outlier.score).toBeGreaterThan(typical.score);
  });

  it("keeps the score in range and contributions summing to d2", () => {
    const d = new Detector(4, 0);
    feedBaseline(d, 150);
    const r = d.update([5, -4, 3, -2]);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    const sum = Object.values(r.contributions).reduce((a, v) => a + v, 0);
    expect(sum).toBeCloseTo(r.d2, 6);
  });

  it("derives tighten-only params from the score", () => {
    const d = new Detector(4, 0);
    const p = d.paramsFor(99);
    expect(p.maxLtv).toBeCloseTo(55, 6);
    expect(p.borrowCap).toBeCloseTo(40, 6);
  });
});
