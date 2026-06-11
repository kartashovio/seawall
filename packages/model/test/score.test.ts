import { describe, it, expect } from "vitest";
import { scoreToFraction, scoreToParams } from "../src/score";

describe("score -> parameters", () => {
  it("dead-band: low scores leave parameters at the baseline", () => {
    expect(scoreToFraction(0)).toBe(1);
    expect(scoreToFraction(60)).toBe(1);
    const p = scoreToParams(50);
    expect(p.maxLtv).toBeCloseTo(75, 9); // baseline
    expect(p.borrowCap).toBeCloseTo(100, 9);
  });

  it("high scores pin parameters at the floor", () => {
    expect(scoreToFraction(95)).toBe(0);
    expect(scoreToFraction(100)).toBe(0);
    const p = scoreToParams(99);
    expect(p.maxLtv).toBeCloseTo(55, 9); // floor
    expect(p.borrowCap).toBeCloseTo(40, 9);
  });

  it("is continuous at the endpoints and monotone decreasing in between", () => {
    expect(scoreToFraction(60)).toBeCloseTo(1, 9);
    expect(scoreToFraction(95)).toBeCloseTo(0, 9);
    expect(scoreToFraction(70)).toBeGreaterThan(scoreToFraction(80));
    expect(scoreToFraction(80)).toBeGreaterThan(scoreToFraction(90));
  });

  it("tightens (never loosens) as the score rises", () => {
    const a = scoreToParams(70);
    const b = scoreToParams(85);
    expect(b.maxLtv).toBeLessThanOrEqual(a.maxLtv);
    expect(b.borrowCap).toBeLessThanOrEqual(a.borrowCap);
  });
});
