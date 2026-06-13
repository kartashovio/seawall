// TS reference implementation of the on-chain divergence math
// (guardian/sources/divergence.move). BIT-FOR-BIT parity is the contract:
// pure BigInt, every division floors, multiply-then-divide order — exactly
// std::u128::mul_div (u256 upcast, round-down). The shared fixture is
// test/vectors.json; the Move tests pin the same literals.
//
// Formula (BUILD_PLAN D7, units u128 @ 1e9):
//   pyth1e9  = mulDiv(priceMag, PRICE_SCALE, 10^expoMag)      // expo must be negative
//   conf1e9  = mulDiv(confMag,  PRICE_SCALE, 10^expoMag)      // same expo as price (must-fix #7)
//   confFrac = mulDiv(conf1e9,  PRICE_SCALE, pyth1e9)
//   midRaw   = (bid + ask) / 2                                 // floor; both sides non-empty
//   dbk1e9   = base >= quote ? midRaw * 10^(base-quote)        // coin-decimal factor,
//                            : midRaw / 10^(quote-base)        // SIGN-CORRECTED (×10^3 for SUI/DBUSDC)
//   div      = mulDiv(|pyth1e9 - dbk1e9|, PRICE_SCALE, pyth1e9)
//   empty/one-sided book => signal = BOOK_NOT_OK, div = 0 (the freeze leg keys on signal, D1)
import { MAX_EXPO_MAG, PRICE_SCALE, SIGNAL_BOOK_NOT_OK, SIGNAL_NORMAL } from "./constants";

export interface DivInput {
  priceMag: bigint; // Pyth price magnitude (I64 asserted non-negative upstream)
  expoIsNeg: boolean; // Pyth expo sign — MUST be negative (asserted here)
  expoMag: bigint; // Pyth expo magnitude
  confMag: bigint; // Pyth confidence (u64), same expo as price
  bidBest: bigint; // DeepBook best bid, raw FLOAT_SCALING units (0 if bidEmpty)
  askBest: bigint; // DeepBook best ask, raw FLOAT_SCALING units (0 if askEmpty)
  bidEmpty: boolean;
  askEmpty: boolean;
  baseDecimals: number; // SUI = 9
  quoteDecimals: number; // DBUSDC = 6
}

export interface DivOutput {
  div: bigint; // |pyth - dbk| / pyth, fraction @ 1e9
  pythPx1e9: bigint; // normalized Pyth price @ 1e9 (the vault values collateral with it)
  confFrac: bigint; // conf / price, fraction @ 1e9
  signal: number; // SIGNAL_NORMAL | SIGNAL_BOOK_NOT_OK
}

// std::u128::mul_div twin: floor((x * y) / z). BigInt division already floors
// for non-negative operands, which is all we ever pass.
export function mulDiv(x: bigint, y: bigint, z: bigint): bigint {
  return (x * y) / z;
}

export function pow10(n: number | bigint): bigint {
  return 10n ** BigInt(n);
}

// DeepBook level2 price -> Pyth-comparable 1e9 scale (must-fix #7,
// SIGN-CORRECTED): base >= quote multiplies by 10^(base-quote).
export function dbkMid1e9(
  bidBest: bigint,
  askBest: bigint,
  baseDecimals: number,
  quoteDecimals: number,
): bigint {
  const midRaw = (bidBest + askBest) / 2n;
  return baseDecimals >= quoteDecimals
    ? midRaw * pow10(baseDecimals - quoteDecimals)
    : midRaw / pow10(quoteDecimals - baseDecimals);
}

function diff(a: bigint, b: bigint): bigint {
  return a > b ? a - b : b - a;
}

export function computeDivergence(i: DivInput): DivOutput {
  if (!i.expoIsNeg) throw new Error("EXPO_NOT_NEGATIVE");
  // Bound the expo so Move's `expo_mag as u8` / pow(10, expoMag) can't silently
  // truncate or overflow where this (unbounded BigInt) reference would not —
  // keeps the two impls aborting on exactly the same inputs.
  if (i.expoMag > BigInt(MAX_EXPO_MAG)) throw new Error("EXPO_TOO_LARGE");
  if (i.priceMag === 0n) throw new Error("ZERO_PRICE");

  const scale = pow10(i.expoMag);
  const pythPx1e9 = mulDiv(i.priceMag, PRICE_SCALE, scale);
  if (pythPx1e9 === 0n) throw new Error("ZERO_PRICE");

  const conf1e9 = mulDiv(i.confMag, PRICE_SCALE, scale);
  const confFrac = mulDiv(conf1e9, PRICE_SCALE, pythPx1e9);

  if (i.bidEmpty || i.askEmpty) {
    return { div: 0n, pythPx1e9, confFrac, signal: SIGNAL_BOOK_NOT_OK };
  }

  const dbk = dbkMid1e9(i.bidBest, i.askBest, i.baseDecimals, i.quoteDecimals);
  const div = mulDiv(diff(pythPx1e9, dbk), PRICE_SCALE, pythPx1e9);
  return { div, pythPx1e9, confFrac, signal: SIGNAL_NORMAL };
}
