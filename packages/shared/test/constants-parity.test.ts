// Parity guard for the single source of truth. Asserts the TS percent corridors
// and their bps mirror agree, the threshold ordering holds, and the score bands
// are sane. The Move side pins the SAME literals in
// `guardian/sources/.../constants_test.move`; together they keep TS and Move from
// drifting. If you change a value, change it in BOTH constants.ts AND
// constants.move — these tests will fail until they match.
import { describe, it, expect } from "vitest";
import {
  MAX_LTV,
  BORROW_CAP,
  MAX_LTV_BPS,
  BORROW_CAP_BPS,
  PRICE_SCALE,
  D_CAUTION,
  T_FREEZE,
  CONF_FRAC_MAX,
  BPS_DENOM,
  SCORE_LO,
  SCORE_HI,
  ALERT_SCORE,
  SUBMIT_SCORE,
  LAMBDA_MEAN,
  LAMBDA_COV,
  MAX_AGE_SECS,
  MAX_EXPO_MAG,
  TICKS,
  KEEPER_TICK_MS,
  AGENT_HEARTBEAT_MS,
  RELAX_COOLDOWN_MS,
  ALL_CLEAR_WINDOW_MS,
  RELAX_STEP_FRAC_BPS,
  BASE_DECIMALS,
  QUOTE_DECIMALS,
  SIGNAL_NORMAL,
  SIGNAL_BOOK_NOT_OK,
} from "../src/constants";

describe("constants parity (TS <-> Move)", () => {
  it("percent corridors equal their bps mirror (percent * 100)", () => {
    expect(MAX_LTV.floor * 100).toBe(MAX_LTV_BPS.floor);
    expect(MAX_LTV.baseline * 100).toBe(MAX_LTV_BPS.baseline);
    expect(BORROW_CAP.floor * 100).toBe(BORROW_CAP_BPS.floor);
    expect(BORROW_CAP.baseline * 100).toBe(BORROW_CAP_BPS.baseline);
  });

  it("matches the exact literals pinned in constants_test.move", () => {
    expect(MAX_LTV_BPS).toEqual({ floor: 5500, baseline: 7500 });
    expect(BORROW_CAP_BPS).toEqual({ floor: 4000, baseline: 10000 });
    expect(PRICE_SCALE).toBe(1_000_000_000n);
    expect(T_FREEZE).toBe(50_000_000n);
    expect(D_CAUTION).toBe(10_000_000n);
    expect(CONF_FRAC_MAX).toBe(10_000_000n);
  });

  // Every remaining on-chain row is pinned to its exact literal here AND in
  // constants_test.move, so an accidental edit to EITHER side fails a test. This
  // is what makes "single source of truth, bound by the parity test" literally
  // true for the WHOLE table (Step-0 review, medium finding).
  it("pins every remaining on-chain row to its exact literal (full table machine-bound)", () => {
    expect(MAX_AGE_SECS).toBe(60);
    expect(MAX_EXPO_MAG).toBe(18);
    expect(TICKS).toBe(1);
    expect(KEEPER_TICK_MS).toBe(300_000);
    expect(AGENT_HEARTBEAT_MS).toBe(300_000);
    expect(RELAX_COOLDOWN_MS).toBe(600_000);
    expect(ALL_CLEAR_WINDOW_MS).toBe(600_000);
    expect(RELAX_STEP_FRAC_BPS).toBe(1000);
    expect(BASE_DECIMALS).toBe(9);
    expect(QUOTE_DECIMALS).toBe(6);
    expect(SIGNAL_NORMAL).toBe(0);
    expect(SIGNAL_BOOK_NOT_OK).toBe(1);
    // cross-check the coin-decimal factor implied by the decimals (must-fix #7,
    // sign-corrected): base>=quote => 10^(base-quote) = 10^3 = 1000
    expect(10 ** (BASE_DECIMALS - QUOTE_DECIMALS)).toBe(1000);
  });

  it("corridors are ordered floor <= baseline and within [0, BPS_DENOM]", () => {
    for (const c of [MAX_LTV_BPS, BORROW_CAP_BPS]) {
      expect(c.floor).toBeLessThanOrEqual(c.baseline);
      expect(c.floor).toBeGreaterThanOrEqual(0);
      expect(c.baseline).toBeLessThanOrEqual(BPS_DENOM);
    }
  });

  it("FREEZE threshold sits strictly above the CAUTION onset", () => {
    expect(T_FREEZE).toBeGreaterThan(D_CAUTION);
  });

  it("score bands are ordered and the markers are 99", () => {
    expect(SCORE_LO).toBeLessThan(SCORE_HI);
    expect(SCORE_HI).toBeLessThanOrEqual(ALERT_SCORE);
    expect(ALERT_SCORE).toBe(99);
    expect(SUBMIT_SCORE).toBe(99);
  });

  it("mean tracks fast, covariance is slower by design (live == backtest)", () => {
    expect(LAMBDA_MEAN).toBe(0.99);
    expect(LAMBDA_COV).toBe(0.996);
    expect(LAMBDA_COV).toBeGreaterThan(LAMBDA_MEAN);
  });
});
