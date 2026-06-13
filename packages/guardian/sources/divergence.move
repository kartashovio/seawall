/// On-chain re-derivation of the Pyth↔DeepBook divergence — the judge-named
/// make-or-break: the contract reads BOTH raw sources itself and re-derives the
/// breach; it never takes the agent's word for anything.
///
/// Layout: `compute_divergence` is a PURE scalar function (no objects) so unit
/// tests exercise the math directly; `read_divergence` is the object wrapper
/// that pulls the raw inputs out of `&Pool` (abort-free level2 read — NEVER
/// `mid_price`, which aborts on an empty book) and `&PriceInfoObject` (fresh
/// same-PTB Pyth, staleness checked internally in SECONDS, must-fix #1/#7).
///
/// The math is mirrored bit-for-bit in TS (`@seawall/shared` divergence.ts);
/// the shared fixture is `packages/shared/test/vectors.json` and the Move twin
/// of those vectors is `tests/divergence_tests.move`. All division FLOORS
/// (std::u128::mul_div upcasts to u256), multiply-then-divide on both sides.
module guardian::divergence;

use deepbook::pool::Pool;
use guardian::constants;
use pyth::i64;
use pyth::price;
use pyth::price_identifier;
use pyth::price_info::{Self, PriceInfoObject};
use pyth::pyth;
use sui::clock::Clock;

/// The PriceInfoObject passed in is not the feed this policy is bound to.
const EWrongFeed: u64 = 1;
/// Pyth expo must be negative (every real price feed; positive expo would
/// silently change the normalization math, so it hard-aborts).
const EExpoNotNegative: u64 = 2;
/// Pyth price is zero (raw or after 1e9 normalization) — divergence undefined,
/// abort rather than divide by zero. Fail-CLOSED on the inline path.
const EZeroPrice: u64 = 3;
/// The DeepBook pool passed in is not the one this policy is bound to. THE
/// trust-min linchpin: without this, a caller could substitute a fake-calm or
/// empty junk pool and either suppress a real freeze (fail-OPEN) or grief-freeze
/// the policy. The contract must re-derive the breach from ITS OWN canonical
/// book, never a caller-chosen one.
const EWrongPool: u64 = 4;
/// Pyth expo magnitude exceeds the accepted bound (constants::max_expo_mag()).
/// Guards the on-chain `expo_mag as u8` cast / pow against truncation+overflow
/// and keeps abort-parity with the TS reference.
const EExpoTooLarge: u64 = 5;

/// One on-chain reading of both sources, normalized. `copy + drop` so the
/// vault can consume it in the same PTB (single price read, no TOCTOU).
public struct DivResult has copy, drop {
    /// |pyth − dbk| / pyth as a fraction @ 1e9; 0 when the book is unusable
    /// (the freeze leg keys on `signal`, never on a benign-looking 0).
    div: u128,
    /// Normalized Pyth price @ 1e9 — the vault values collateral with this.
    pyth_px_1e9: u128,
    /// Pyth confidence / price as a fraction @ 1e9 (oracle-health gate).
    conf_frac: u128,
    /// constants::signal_normal() | constants::signal_book_not_ok().
    signal: u8,
}

public fun div(d: &DivResult): u128 { d.div }

public fun pyth_px_1e9(d: &DivResult): u128 { d.pyth_px_1e9 }

public fun conf_frac(d: &DivResult): u128 { d.conf_frac }

public fun signal(d: &DivResult): u8 { d.signal }

/// DeepBook level2 best-bid/ask midpoint -> Pyth-comparable 1e9 scale.
/// Coin-decimal factor (must-fix #7, SIGN-CORRECTED): base >= quote multiplies
/// by 10^(base−quote) — ×10^3 for SUI(9)/DBUSDC(6); raw mid 764000 -> $0.764.
public fun dbk_mid_1e9(bid_best: u64, ask_best: u64, base_decimals: u8, quote_decimals: u8): u128 {
    let mid_raw = ((bid_best as u128) + (ask_best as u128)) / 2;
    if (base_decimals >= quote_decimals) {
        mid_raw * std::u128::pow(10, base_decimals - quote_decimals)
    } else {
        mid_raw / std::u128::pow(10, quote_decimals - base_decimals)
    }
}

/// Pure scalar core — the exact twin of TS `computeDivergence`.
/// Returns (div, pyth_px_1e9, conf_frac, signal), all units as in `DivResult`.
public fun compute_divergence(
    price_mag: u64,
    expo_is_neg: bool,
    expo_mag: u64,
    conf_mag: u64,
    bid_best: u64,
    ask_best: u64,
    bid_empty: bool,
    ask_empty: bool,
    base_decimals: u8,
    quote_decimals: u8,
): (u128, u128, u128, u8) {
    assert!(expo_is_neg, EExpoNotNegative);
    assert!(expo_mag <= constants::max_expo_mag(), EExpoTooLarge);
    assert!(price_mag > 0, EZeroPrice);

    let scale = std::u128::pow(10, expo_mag as u8);
    let pyth_px_1e9 = std::u128::mul_div(price_mag as u128, constants::price_scale(), scale);
    assert!(pyth_px_1e9 > 0, EZeroPrice);

    let conf_1e9 = std::u128::mul_div(conf_mag as u128, constants::price_scale(), scale);
    let conf_frac = std::u128::mul_div(conf_1e9, constants::price_scale(), pyth_px_1e9);

    if (bid_empty || ask_empty) {
        return (0, pyth_px_1e9, conf_frac, constants::signal_book_not_ok())
    };

    let dbk_1e9 = dbk_mid_1e9(bid_best, ask_best, base_decimals, quote_decimals);
    let div = std::u128::mul_div(
        std::u128::diff(pyth_px_1e9, dbk_1e9),
        constants::price_scale(),
        pyth_px_1e9,
    );
    (div, pyth_px_1e9, conf_frac, constants::signal_normal())
}

/// Object wrapper: assert BOTH source identities (the Pyth feed AND the
/// DeepBook pool), read fresh Pyth (same PTB, `get_price_no_older_than` does
/// the seconds-based staleness check itself), read the book abort-free, and run
/// the pure core.
public fun read_divergence<Base, Quote>(
    pool: &Pool<Base, Quote>,
    pio: &PriceInfoObject,
    clock: &Clock,
    expected_feed_id: &vector<u8>,
    expected_pool_id: ID,
    max_age_secs: u64,
    base_decimals: u8,
    quote_decimals: u8,
): DivResult {
    // Pool-id assert (the trust-min linchpin): the breach MUST be re-derived
    // from the policy's OWN canonical book, never a caller-substituted one. An
    // object id uniquely fixes the concrete typed Pool<Base,Quote>, so this also
    // pins the correct type args. Both source asserts run BEFORE any read.
    assert!(object::id(pool) == expected_pool_id, EWrongPool);

    // Feed-id assert (must-fix #1 — the official sample omits this).
    let info = price_info::get_price_info_from_price_info_object(pio);
    let pid = price_info::get_price_identifier(&info);
    assert!(price_identifier::get_bytes(&pid) == *expected_feed_id, EWrongFeed);

    // Fresh Pyth; aborts if older than max_age_secs (fail-CLOSED, must-fix #7).
    let p = pyth::get_price_no_older_than(pio, clock, max_age_secs);
    let price_i64 = price::get_price(&p);
    let expo_i64 = price::get_expo(&p);
    let expo_is_neg = i64::get_is_negative(&expo_i64);
    let expo_mag = if (expo_is_neg) {
        i64::get_magnitude_if_negative(&expo_i64)
    } else {
        i64::get_magnitude_if_positive(&expo_i64)
    };
    // A negative PRICE is a broken feed — fail closed via the zero check
    // (get_magnitude_if_positive aborts inside Pyth if negative).
    let price_mag = i64::get_magnitude_if_positive(&price_i64);

    // Abort-free book read (1 tick per side); empty vector == missing side.
    let (bid_p, _bid_q, ask_p, _ask_q) =
        pool.get_level2_ticks_from_mid(constants::ticks(), clock);
    let bid_empty = vector::is_empty(&bid_p);
    let ask_empty = vector::is_empty(&ask_p);
    let bid_best = if (bid_empty) 0 else bid_p[0];
    let ask_best = if (ask_empty) 0 else ask_p[0];

    let (div, pyth_px_1e9, conf_frac, signal) = compute_divergence(
        price_mag, expo_is_neg, expo_mag, price::get_conf(&p),
        bid_best, ask_best, bid_empty, ask_empty,
        base_decimals, quote_decimals,
    );
    DivResult { div, pyth_px_1e9, conf_frac, signal }
}

/// Test-only constructor so enforcement tests can drive `apply_` without
/// constructing `&Pool`/`&PriceInfoObject` (impossible in unit tests).
#[test_only]
public fun new_div_result_for_testing(
    div: u128,
    pyth_px_1e9: u128,
    conf_frac: u128,
    signal: u8,
): DivResult {
    DivResult { div, pyth_px_1e9, conf_frac, signal }
}
