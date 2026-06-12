/// Placeholder Move-side parity test (Step 0). Pins the on-chain Constants
/// getters to their literal values and the internal bps==percent*100 relationship,
/// mirroring the TS `constants-parity.test.ts`. Step 1 adds the divergence + the
/// enforcement test suites.
#[test_only]
module guardian::constants_test;

use guardian::constants;

#[test]
fun corridor_values_and_bps_relationship() {
    // exact literals (must match @seawall/shared)
    assert!(constants::max_ltv_floor_bps() == 5500, 0);
    assert!(constants::max_ltv_baseline_bps() == 7500, 1);
    assert!(constants::borrow_cap_floor_bps() == 4000, 2);
    assert!(constants::borrow_cap_baseline_bps() == 10000, 3);

    // corridor sanity: floor (tightest) <= baseline (loosest), both within [0, BPS_DENOM]
    assert!(constants::max_ltv_floor_bps() <= constants::max_ltv_baseline_bps(), 4);
    assert!(constants::borrow_cap_floor_bps() <= constants::borrow_cap_baseline_bps(), 5);
    assert!(constants::max_ltv_baseline_bps() <= constants::bps_denom(), 6);
    assert!(constants::borrow_cap_baseline_bps() <= constants::bps_denom(), 7);
}

#[test]
fun divergence_thresholds_ordered() {
    // FREEZE threshold must sit strictly above the CAUTION onset (D5/correctness #7).
    assert!(constants::t_freeze() > constants::d_caution(), 8);
    assert!(constants::price_scale() == 1_000_000_000, 9);
    // 5% and 1% expressed as 1e9 fractions
    assert!(constants::t_freeze() == 50_000_000, 10);
    assert!(constants::d_caution() == 10_000_000, 11);
}

#[test]
fun score_bands_ordered() {
    assert!(constants::score_lo() < constants::score_hi(), 12);
    assert!(constants::score_hi() <= constants::alert_score(), 13);
    assert!(constants::signal_normal() != constants::signal_book_not_ok(), 14);
}

// Pins every remaining on-chain row to its exact literal so an accidental edit
// on EITHER side (here or constants-parity.test.ts) fails a test — making the
// "single source of truth" guarantee cover the WHOLE table (Step-0 review).
#[test]
fun full_table_literals() {
    assert!(constants::conf_frac_max() == 10_000_000, 15);
    assert!(constants::max_age_secs() == 60, 16);
    assert!(constants::ticks() == 1, 17);
    assert!(constants::keeper_tick_ms() == 300_000, 18);
    assert!(constants::agent_heartbeat_ms() == 300_000, 19);
    assert!(constants::relax_cooldown_ms() == 600_000, 20);
    assert!(constants::all_clear_window_ms() == 600_000, 21);
    assert!(constants::relax_step_frac_bps() == 1000, 22);
    assert!(constants::base_decimals() == 9, 23);
    assert!(constants::quote_decimals() == 6, 24);
    assert!(constants::submit_score() == 99, 25);
    // coin-decimal factor (must-fix #7, sign-corrected): base>=quote => 10^(base-quote)=1000
    assert!(constants::base_decimals() >= constants::quote_decimals(), 26);
}
