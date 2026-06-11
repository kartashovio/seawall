import { describe, it, expect } from "vitest";
import { Detector, GROUP_FEATURES } from "../src/index";
import { FeatureBuilder } from "../src/features";

describe("flexible feature set + market feature", () => {
  it("routes mktvol into the liquidity group, not solvency", () => {
    expect(GROUP_FEATURES.liquidity).toContain("mktvol");
    expect(GROUP_FEATURES.solvency).not.toContain("mktvol");
  });

  it("a market-only anomaly drives liquidity, leaves solvency calm", () => {
    const d = new Detector(["disp", "div", "divvel", "volvel", "mktvol"], { warmup: 0 });
    for (let i = 0; i < 200; i++) {
      const t = i * 0.3;
      d.update([Math.sin(t), Math.cos(t * 1.1), Math.sin(t * 0.7), Math.cos(t * 1.9), Math.sin(t * 0.5)]);
    }
    // spike ONLY the market feature (index 4)
    const r = d.update([Math.sin(60), Math.cos(60 * 1.1), Math.sin(60 * 0.7), Math.cos(60 * 1.9), 9]);
    expect("mktvol" in r.contributions).toBe(true);
    expect(r.groupD2.liquidity).toBeGreaterThan(r.groupD2.solvency);
  });

  it("FeatureBuilder emits mktvol when a market series is configured", () => {
    const fb = new FeatureBuilder({
      refKey: "ref",
      divA: "a",
      divB: "b",
      dispKeys: ["a", "b"],
      marketRefKey: "mkt",
      velWindow: 5,
    });
    let last = null as ReturnType<FeatureBuilder["push"]>;
    for (let i = 0; i < 20; i++) {
      const m = 100 * (1 + 0.002 * Math.sin(i));
      last = fb.push({ ts: i * 1000, values: { ref: 100, a: 100, b: 100, mkt: m } });
    }
    expect(last).not.toBeNull();
    expect(typeof last!.mktvol).toBe("number");
  });

  it("omits mktvol when no market series is configured", () => {
    const fb = new FeatureBuilder({ refKey: "ref", divA: "a", divB: "b", dispKeys: ["a", "b"], velWindow: 5 });
    let last = null as ReturnType<FeatureBuilder["push"]>;
    for (let i = 0; i < 20; i++) last = fb.push({ ts: i * 1000, values: { ref: 100, a: 100, b: 100 } });
    expect(last).not.toBeNull();
    expect(last!.mktvol).toBeUndefined();
  });
});
