/// Move side of the divergence parity suite. Pins THE SAME literals as the
/// canonical fixture `packages/shared/test/vectors.json` (Move cannot read
/// JSON) — change a number there, change it here, or one side's tests fail.
/// Together with `shared/test/divergence.test.ts` this proves the TS reference
/// and the on-chain math are bit-for-bit identical (BUILD_PLAN Step 1/2, GATE 1).
#[test_only]
module guardian::divergence_tests;

use guardian::divergence;

// ── canonical vectors ────────────────────────────────────────────────────────

#[test]
fun v0_equal_prices_zero_div() {
    let (div, px, conf, sig) = divergence::compute_divergence(
        76_400_000, true, 8, 76_400, // pyth 0.764 @ expo -8, conf 0.000764
        760_000, 768_000, false, false, // two-sided book, mid 764000
        9, 6,
    );
    assert!(div == 0, 0);
    assert!(px == 764_000_000, 1);
    assert!(conf == 1_000_000, 2);
    assert!(sig == 0, 3);
}

#[test]
fun v2_one_sided_book_not_ok() {
    let (div, px, conf, sig) = divergence::compute_divergence(
        76_400_000, true, 8, 76_400,
        0, 768_000, true, false, // bid side empty
        9, 6,
    );
    assert!(div == 0, 0);
    assert!(px == 764_000_000, 1);
    assert!(conf == 1_000_000, 2);
    assert!(sig == 1, 3); // BOOK_NOT_OK
}

#[test]
fun v2b_both_empty_book_not_ok() {
    let (div, _px, _conf, sig) = divergence::compute_divergence(
        76_400_000, true, 8, 76_400,
        0, 0, true, true,
        9, 6,
    );
    assert!(div == 0, 0);
    assert!(sig == 1, 1);
}

#[test]
fun v3_freeze_boundary_exact_5pct() {
    let (div, px, conf, sig) = divergence::compute_divergence(
        100_000_000, true, 8, 100_000, // pyth 1.000 @ expo -8
        948_000, 952_000, false, false, // mid 950000 -> 0.95
        9, 6,
    );
    assert!(div == 50_000_000, 0); // exactly T_FREEZE — >= freezes
    assert!(px == 1_000_000_000, 1);
    assert!(conf == 1_000_000, 2);
    assert!(sig == 0, 3);
}

#[test]
fun v3b_floor_truncation_discriminator() {
    // pyth = 1.000000001 @ expo -9; raw ratio 50000000.95 / conf 999999.999 —
    // BOTH must floor (a rounding impl on either side fails here).
    let (div, px, conf, sig) = divergence::compute_divergence(
        1_000_000_001, true, 9, 1_000_000,
        948_000, 952_000, false, false,
        9, 6,
    );
    assert!(div == 50_000_000, 0);
    assert!(px == 1_000_000_001, 1);
    assert!(conf == 999_999, 2);
    assert!(sig == 0, 3);
}

#[test]
fun v4_conf_exactly_at_max_not_breach() {
    let (div, px, conf, sig) = divergence::compute_divergence(
        76_400_000, true, 8, 764_000, // conf 1.0% of price exactly
        760_000, 768_000, false, false,
        9, 6,
    );
    assert!(div == 0, 0);
    assert!(px == 764_000_000, 1);
    assert!(conf == 10_000_000, 2); // == CONF_FRAC_MAX; gate is strict > (not a breach)
    assert!(sig == 0, 3);
}

#[test]
fun v5_mid_floor_truncation() {
    let (div, _px, _conf, sig) = divergence::compute_divergence(
        76_400_000, true, 8, 76_400,
        760_000, 768_001, false, false, // sum odd -> mid floors to 764000
        9, 6,
    );
    assert!(div == 0, 0);
    assert!(sig == 0, 1);
}

#[test]
fun v6_two_percent_caution_tier1() {
    let (div, px, _conf, sig) = divergence::compute_divergence(
        100_000_000, true, 8, 100_000,
        978_000, 982_000, false, false, // mid 980000 -> 0.98
        9, 6,
    );
    assert!(div == 20_000_000, 0); // 2.0%
    assert!(px == 1_000_000_000, 1);
    assert!(sig == 0, 2);
}

#[test]
fun v7_book_above_oracle_abs_diff_branch() {
    // dbk(1.000) > pyth(0.95): the upward-depeg direction every other vector
    // misses; also a fresh floor discriminator (52631578.94 -> 52631578).
    let (div, px, conf, sig) = divergence::compute_divergence(
        95_000_000, true, 8, 95_000,
        998_000, 1_002_000, false, false, // mid 1000000 -> 1.000
        9, 6,
    );
    assert!(div == 52_631_578, 0);
    assert!(px == 950_000_000, 1);
    assert!(conf == 1_000_000, 2);
    assert!(sig == 0, 3);
}

// ── coin-decimal factor (must-fix #7, sign-corrected) ───────────────────────

#[test]
fun m1_sign_anchor_base_ge_quote_x1000() {
    assert!(divergence::dbk_mid_1e9(760_000, 768_000, 9, 6) == 764_000_000, 0);
}

#[test]
fun m2_inverse_quote_gt_base_div1000() {
    assert!(divergence::dbk_mid_1e9(760_000, 768_000, 6, 9) == 764, 0);
}

#[test]
fun m3_equal_decimals_identity() {
    assert!(divergence::dbk_mid_1e9(760_000, 768_000, 9, 9) == 764_000, 0);
}

#[test]
fun m4_quote_gt_base_floor_discriminator() {
    // midRaw = (760000+769998)/2 = 764999; /10^(9-6) = /1000 -> 764 (FLOOR,
    // not round-half which would give 765). Exercises the divide-leg floor.
    assert!(divergence::dbk_mid_1e9(760_000, 769_998, 6, 9) == 764, 0);
}

// ── error vectors ────────────────────────────────────────────────────────────

#[test, expected_failure(abort_code = divergence::EExpoNotNegative)]
fun e1_expo_not_negative_rejected() {
    divergence::compute_divergence(
        76_400_000, false, 8, 76_400,
        760_000, 768_000, false, false,
        9, 6,
    );
}

#[test, expected_failure(abort_code = divergence::EZeroPrice)]
fun e2_zero_price_rejected() {
    divergence::compute_divergence(
        0, true, 8, 76_400,
        760_000, 768_000, false, false,
        9, 6,
    );
}

#[test, expected_failure(abort_code = divergence::EZeroPrice)]
fun e3_price_floors_to_zero_rejected() {
    divergence::compute_divergence(
        5, true, 18, 1, // 5e9/1e18 floors to 0
        760_000, 768_000, false, false,
        9, 6,
    );
}

#[test, expected_failure(abort_code = divergence::EExpoTooLarge)]
fun e4_expo_too_large_rejected() {
    divergence::compute_divergence(
        76_400_000, true, 19, 76_400, // expo_mag 19 > MAX_EXPO_MAG(18)
        760_000, 768_000, false, false,
        9, 6,
    );
}
