import { describe, it, expect } from "vitest";
import { asofJoin, candlesToSeries, type Series } from "../src/align";
import { FeatureBuilder } from "../src/features";
import type { Candle } from "@seawall/shared";

describe("asofJoin", () => {
  it("carries the most recent sample and marks stale ones undefined", () => {
    const a: Series = { name: "a", points: [{ ts: 0, value: 1 }, { ts: 100, value: 2 }] };
    const b: Series = { name: "b", points: [{ ts: 0, value: 10 }] };
    const rows = asofJoin([a, b], 0, 200, 50, 60);
    // a's last point is at ts=100, so by T=200 it's 100ms old (> 60) and drops
    expect(rows.map((r) => r.values.a)).toEqual([1, 1, 2, 2, undefined]);
    // b's only point is at ts=0; with maxStale=60 it goes stale after T=60
    expect(rows[0].values.b).toBe(10);
    expect(rows[2].values.b).toBeUndefined(); // T=100, 100-0 > 60
  });

  it("converts candles to a close-price series", () => {
    const candles: Candle[] = [
      { ts: 0, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
      { ts: 60, open: 1.5, high: 2, low: 1, close: 1.8, volume: 12 },
    ];
    const s = candlesToSeries("x", candles);
    expect(s.points).toEqual([{ ts: 0, value: 1.5 }, { ts: 60, value: 1.8 }]);
  });
});

describe("FeatureBuilder", () => {
  it("reads ~0 divergence when prices agree, then spikes when one diverges", () => {
    const fb = new FeatureBuilder({
      refKey: "ref",
      divA: "a",
      divB: "b",
      dispKeys: ["a", "b", "c"],
      velWindow: 5,
    });
    // warm-up: everything at 100
    let last = null as ReturnType<FeatureBuilder["push"]>;
    for (let i = 0; i < 20; i++) {
      last = fb.push({ ts: i * 1000, values: { ref: 100, a: 100, b: 100, c: 100 } });
    }
    expect(last).not.toBeNull();
    expect(last!.div).toBeLessThan(1); // basically zero bps

    // now "a" jumps 3% above the others -> divergence and dispersion appear
    const spike = fb.push({ ts: 21000, values: { ref: 100, a: 103, b: 100, c: 100 } });
    expect(spike).not.toBeNull();
    expect(spike!.div).toBeGreaterThan(250); // ~296 bps for a 3% gap
    expect(spike!.disp).toBeGreaterThan(0);
    expect(spike!.divvel).toBeGreaterThan(0); // divergence widened
  });

  it("returns null until it has enough history", () => {
    const fb = new FeatureBuilder({ refKey: "ref", divA: "a", divB: "b", dispKeys: ["a", "b"], velWindow: 3 });
    expect(fb.push({ ts: 0, values: { ref: 100, a: 100, b: 100 } })).toBeNull();
  });
});
