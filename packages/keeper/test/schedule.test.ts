import { describe, it, expect } from "vitest";
import { nextDeadlineMs } from "../src/schedule";

describe("nextDeadlineMs — drift-free grid (recomputed from a fixed epoch)", () => {
  it("returns the next grid point strictly after now", () => {
    expect(nextDeadlineMs(0, 1000, 0)).toBe(1000);
    expect(nextDeadlineMs(999, 1000, 0)).toBe(1000);
    expect(nextDeadlineMs(1000, 1000, 0)).toBe(2000); // exactly on a deadline → next one
    expect(nextDeadlineMs(1500, 1000, 0)).toBe(2000);
  });
  it("honors a non-zero epoch (no drift accumulation across many periods)", () => {
    expect(nextDeadlineMs(1050, 1000, 50)).toBe(2050);
    expect(nextDeadlineMs(1_000_050, 1000, 50)).toBe(1_000_050 + 1000);
  });
  it("a long-running keeper stays aligned (period 300s)", () => {
    const p = 300_000;
    // after ~10h the deadline is still an exact multiple of the period from epoch
    const t = 37 * p + 12_345;
    expect((nextDeadlineMs(t, p, 0) - 0) % p).toBe(0);
    expect(nextDeadlineMs(t, p, 0)).toBe(38 * p);
  });
});
