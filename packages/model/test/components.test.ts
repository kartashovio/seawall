import { describe, it, expect } from "vitest";
import { subDistance, mahalanobis } from "../src/mahalanobis";
import { Detector } from "../src/index";
import { scoreToParams } from "../src/score";
import { MAX_LTV, BORROW_CAP } from "@seawall/shared";

describe("subDistance", () => {
  it("equals the full d2 when all indices are used", () => {
    const cov = [
      [2, 0.3, 0.1],
      [0.3, 1.5, 0.2],
      [0.1, 0.2, 1],
    ];
    const diff = [1, -0.5, 0.7];
    expect(subDistance(cov, diff, [0, 1, 2])).toBeCloseTo(mahalanobis(cov, diff).d2, 9);
  });

  it("is the sum of squares of the subset on the identity", () => {
    const I = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    expect(subDistance(I, [3, 4, 5], [0, 2])).toBeCloseTo(9 + 25, 9);
  });
});

describe("component split", () => {
  it("reports per-group d2 and isolates the anomalous family", () => {
    const d = new Detector(4, 0);
    for (let i = 0; i < 200; i++) {
      const t = i * 0.3;
      d.update([Math.sin(t), Math.cos(t * 1.1), Math.sin(t * 0.7), Math.cos(t * 1.9)]);
    }
    // anomaly only in the solvency features (div, divvel = indices 1,2)
    const r = d.update([Math.sin(60), 8, 8, Math.cos(60 * 1.9)]);
    expect(r.groupD2.solvency).toBeGreaterThan(r.groupD2.liquidity);
  });
});

describe("independent parameters", () => {
  it("tightens max_ltv on solvency risk while leaving borrow_cap loose", () => {
    const p = scoreToParams(99, 0); // solvency high, liquidity calm
    expect(p.maxLtv).toBeCloseTo(MAX_LTV.floor, 6);
    expect(p.borrowCap).toBeCloseTo(BORROW_CAP.baseline, 6);
  });
});
