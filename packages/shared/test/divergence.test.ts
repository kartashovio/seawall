// Runs the canonical vectors.json fixture through the TS reference
// implementation of the on-chain divergence math. The Move side
// (guardian/tests/divergence_tests.move) pins the SAME literals — together they
// prove the formula is bit-for-bit identical on both sides (BUILD_PLAN Step 1/2,
// GATE 1). Every division here must FLOOR (pure BigInt), matching
// std::u128::mul_div.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  computeDivergence,
  dbkMid1e9,
  mulDiv,
  pow10,
  type DivInput,
} from "../src/divergence";
import { SIGNAL_BOOK_NOT_OK, SIGNAL_NORMAL, T_FREEZE, CONF_FRAC_MAX } from "../src/constants";

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "vectors.json"), "utf8"),
);

interface RawVector {
  name: string;
  priceMag: string;
  expoIsNeg: boolean;
  expoMag: string;
  confMag: string;
  bidBest: string;
  askBest: string;
  bidEmpty: boolean;
  askEmpty: boolean;
  baseDecimals: number;
  quoteDecimals: number;
  expect?: { div: string; pythPx1e9: string; confFrac: string; signal: number };
  throws?: string;
}

function toInput(v: RawVector): DivInput {
  return {
    priceMag: BigInt(v.priceMag),
    expoIsNeg: v.expoIsNeg,
    expoMag: BigInt(v.expoMag),
    confMag: BigInt(v.confMag),
    bidBest: BigInt(v.bidBest),
    askBest: BigInt(v.askBest),
    bidEmpty: v.bidEmpty,
    askEmpty: v.askEmpty,
    baseDecimals: v.baseDecimals,
    quoteDecimals: v.quoteDecimals,
  };
}

describe("computeDivergence — canonical vectors (TS reference)", () => {
  for (const v of fixture.vectors as RawVector[]) {
    it(v.name, () => {
      const r = computeDivergence(toInput(v));
      expect(r.div).toBe(BigInt(v.expect!.div));
      expect(r.pythPx1e9).toBe(BigInt(v.expect!.pythPx1e9));
      expect(r.confFrac).toBe(BigInt(v.expect!.confFrac));
      expect(r.signal).toBe(v.expect!.signal);
    });
  }

  for (const v of fixture.errorVectors as RawVector[]) {
    it(v.name, () => {
      expect(() => computeDivergence(toInput(v))).toThrowError(v.throws!);
    });
  }
});

describe("dbkMid1e9 — coin-decimal factor (must-fix #7, sign-corrected)", () => {
  for (const m of fixture.midVectors as Array<{
    name: string;
    bidBest: string;
    askBest: string;
    baseDecimals: number;
    quoteDecimals: number;
    expect: string;
  }>) {
    it(m.name, () => {
      expect(dbkMid1e9(BigInt(m.bidBest), BigInt(m.askBest), m.baseDecimals, m.quoteDecimals)).toBe(
        BigInt(m.expect),
      );
    });
  }
});

describe("primitives mirror std::u128 semantics", () => {
  it("mulDiv floors (multiply-then-divide, no rounding)", () => {
    expect(mulDiv(50_000_001n, 1_000_000_000n, 1_000_000_001n)).toBe(50_000_000n);
    expect(mulDiv(7n, 3n, 2n)).toBe(10n); // (7*3)/2 = 10.5 -> 10
  });
  it("pow10", () => {
    expect(pow10(0)).toBe(1n);
    expect(pow10(3)).toBe(1000n);
    expect(pow10(9n)).toBe(1_000_000_000n);
  });
});

describe("fixture sanity against the constants table", () => {
  it("V3 lands exactly on T_FREEZE and V4 exactly on CONF_FRAC_MAX (boundary semantics: div uses >=, conf uses strict >)", () => {
    const v3 = (fixture.vectors as RawVector[]).find((v) => v.name.startsWith("V3_"))!;
    expect(BigInt(v3.expect!.div)).toBe(T_FREEZE);
    const v4 = (fixture.vectors as RawVector[]).find((v) => v.name.startsWith("V4_"))!;
    expect(BigInt(v4.expect!.confFrac)).toBe(CONF_FRAC_MAX);
  });
  it("signals match the shared tags", () => {
    expect(SIGNAL_NORMAL).toBe(0);
    expect(SIGNAL_BOOK_NOT_OK).toBe(1);
  });
});
