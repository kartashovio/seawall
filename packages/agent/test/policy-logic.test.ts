import { describe, it, expect } from "vitest";
import { MAX_LTV_BPS, BORROW_CAP_BPS } from "@seawall/shared";
import { toBps, clampToCorridor, computeRequest, decideRequest, shouldSend } from "../src/policy-logic";

describe("toBps — percent → on-chain bps", () => {
  it("scales by 100 and rounds", () => {
    expect(toBps({ maxLtv: 55, borrowCap: 40 })).toEqual({ maxLtv: 5500, borrowCap: 4000 });
    expect(toBps({ maxLtv: 68.34, borrowCap: 80 })).toEqual({ maxLtv: 6834, borrowCap: 8000 });
  });
});

describe("clampToCorridor — never outside [floor, baseline]", () => {
  it("clamps below floor up and above baseline down", () => {
    expect(clampToCorridor({ maxLtv: 1000, borrowCap: 1000 })).toEqual({
      maxLtv: MAX_LTV_BPS.floor,
      borrowCap: BORROW_CAP_BPS.floor,
    });
    expect(clampToCorridor({ maxLtv: 99999, borrowCap: 99999 })).toEqual({
      maxLtv: MAX_LTV_BPS.baseline,
      borrowCap: BORROW_CAP_BPS.baseline,
    });
  });
  it("passes an in-corridor value through", () => {
    expect(clampToCorridor({ maxLtv: 6000, borrowCap: 8000 })).toEqual({ maxLtv: 6000, borrowCap: 8000 });
  });
});

describe("computeRequest — score → clamped bps target", () => {
  it("calm (low score) targets baseline; high score targets floor", () => {
    expect(computeRequest(0, 0)).toEqual({ maxLtv: MAX_LTV_BPS.baseline, borrowCap: BORROW_CAP_BPS.baseline });
    expect(computeRequest(100, 100)).toEqual({ maxLtv: MAX_LTV_BPS.floor, borrowCap: BORROW_CAP_BPS.floor });
  });
  it("drives the two params independently (solvency→maxLtv, liquidity→borrowCap)", () => {
    const r = computeRequest(100, 0); // solvency high, liquidity calm
    expect(r.maxLtv).toBe(MAX_LTV_BPS.floor);
    expect(r.borrowCap).toBe(BORROW_CAP_BPS.baseline);
  });
});

describe("decideRequest — one-way ratchet vs the on-chain applied baseline (correctness #16)", () => {
  const applied = { maxLtv: 7000, borrowCap: 9000 };
  it("a tighter computed target is proposed and flagged tighter", () => {
    const { req, tighter } = decideRequest({ maxLtv: 6000, borrowCap: 8000 }, applied);
    expect(req).toEqual({ maxLtv: 6000, borrowCap: 8000 });
    expect(tighter).toBe(true);
  });
  it("a looser computed target is NEVER proposed (ratchet) — req stays at applied, not tighter", () => {
    const { req, tighter } = decideRequest({ maxLtv: 7500, borrowCap: 10000 }, applied);
    expect(req).toEqual(applied); // never proposes looser than what's applied
    expect(tighter).toBe(false);
  });
  it("mixed: tighten one, hold the other", () => {
    const { req, tighter } = decideRequest({ maxLtv: 6500, borrowCap: 10000 }, applied);
    expect(req).toEqual({ maxLtv: 6500, borrowCap: 9000 });
    expect(tighter).toBe(true);
  });
});

describe("shouldSend — tighter-OR-heartbeat with a resubmit throttle", () => {
  const opts = { heartbeatMs: 300_000, resubmitCooldownMs: 60_000 };
  it("tighter + cooldown elapsed → send", () => {
    expect(shouldSend(true, 100_000, 0, opts)).toBe(true);
  });
  it("tighter but inside the resubmit cooldown → hold", () => {
    expect(shouldSend(true, 30_000, 0, opts)).toBe(false);
  });
  it("calm (not tighter), heartbeat elapsed → send", () => {
    expect(shouldSend(false, 300_000, 0, opts)).toBe(true);
  });
  it("calm, no heartbeat yet → 0 tx (steady-state)", () => {
    expect(shouldSend(false, 120_000, 0, opts)).toBe(false);
  });
});
