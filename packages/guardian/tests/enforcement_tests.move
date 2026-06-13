/// Enforcement suite for `guardian::guardian` — encodes the judge-named
/// make-or-break invariants (BUILD_PLAN Step 1 / CLAUDE.md must-fix #3):
///   * FREEZE is contract-ONLY (div >= T OR book-not-ok), agent has no input;
///   * the agent can only ever move params TIGHTER (one-way ratchet) and even
///     that is clamped to the DAO corridor — looser requests are rejected;
///   * applied = tighter_of(clamp(agent), clamp(contract_own_tier));
///   * RELAX is the contract's own gated drip (all-clear window + cooldown +
///     fresh calm reading), %-of-span steps, capped at baseline, never while
///     frozen, never on agent ask;
///   * only `&GovernanceCap` (matching policy) unfreezes / loosens corridors.
///
/// Tests drive `apply_` via the #[test_only] DivResult constructor (unit tests
/// cannot build `&Pool` / `&PriceInfoObject`; the live object path is proven by
/// the Step-2 devInspect gate).
#[test_only]
module guardian::enforcement_tests;

use guardian::divergence::{Self, DivResult};
use guardian::guardian::{Self, GuardianPolicy, GovernanceCap};
use sui::clock::{Self, Clock};
use sui::event;
use sui::test_scenario;
use sui::test_utils;

const AGENT: address = @0xA9;

// Table values (constants_test.move pins them against guardian::constants):
// ltv corridor 5500/7500 (span 2000, relax step 200), cap corridor 4000/10000
// (span 6000, relax step 600), T=5e7, d_caution=1e7, conf_max=1e7,
// window=cooldown=600_000 ms, relax frac 1000 (10% of span).

fun feed(): vector<u8> { x"50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266" }

fun pool(): ID { object::id_from_address(@0x9001) }

fun fresh(clock: &Clock, ctx: &mut TxContext): (GuardianPolicy, GovernanceCap) {
    guardian::new_policy_for_testing(
        AGENT, feed(), pool(),
        5500, 7500, // max_ltv floor/baseline
        4000, 10000, // borrow_cap floor/baseline
        50_000_000, 10_000_000, 10_000_000, 60, // T, d_caution, conf_frac_max, max_age
        9, 6, // decimals
        600_000, 600_000, 1000, // all_clear_window, relax_cooldown, relax_step_frac
        clock, ctx,
    )
}

fun calm(): DivResult { divergence::new_div_result_for_testing(0, 764_000_000, 1_000_000, 0) }

fun at_div(div: u128): DivResult {
    divergence::new_div_result_for_testing(div, 1_000_000_000, 1_000_000, 0)
}

fun book_bad(): DivResult { divergence::new_div_result_for_testing(0, 764_000_000, 1_000_000, 1) }

fun conf_bad(): DivResult { divergence::new_div_result_for_testing(0, 764_000_000, 20_000_000, 0) }

fun conf_at_max(): DivResult {
    divergence::new_div_result_for_testing(0, 764_000_000, 10_000_000, 0)
}

/// Keeper/inline path: params-less evaluation (agent term = baseline).
fun poke_(p: &mut GuardianPolicy, d: DivResult, clock: &Clock) {
    guardian::apply_for_testing(p, d, option::none(), 0, clock);
}

/// Agent path (gate bypassed — the gate itself is tested via submit_for_testing).
fun submit_(p: &mut GuardianPolicy, d: DivResult, ltv: u16, cap: u16, clock: &Clock) {
    guardian::apply_for_testing(
        p, d, option::some(guardian::new_param_request(ltv, cap)), 50, clock,
    );
}

fun assert_params(p: &GuardianPolicy, ltv: u16, cap: u16, code: u64) {
    assert!(guardian::max_ltv_current_bps(p) == ltv, code);
    assert!(guardian::borrow_cap_current_bps(p) == cap, code + 1);
}

fun cleanup(p: GuardianPolicy, c: GovernanceCap, clock: Clock) {
    test_utils::destroy(p);
    test_utils::destroy(c);
    clock::destroy_for_testing(clock);
}

// ── L3 freeze: contract-only, two legs (D1) ──────────────────────────────────

#[test]
fun freeze_on_divergence_is_contract_only() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);

    poke_(&mut p, at_div(60_000_000), &clock); // 6% >= T — no agent anywhere
    assert!(guardian::is_paused(&p), 0);
    assert_params(&p, 5500, 4000, 1); // tier 3 -> floor
    assert!(event::events_by_type<guardian::Frozen>().length() == 1, 3);
    cleanup(p, cap, clock);
}

#[test]
fun freeze_on_book_not_ok() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);

    poke_(&mut p, book_bad(), &clock); // one-sided/empty book => freeze (D1)
    assert!(guardian::is_paused(&p), 0);
    assert_params(&p, 5500, 4000, 1);
    assert!(event::events_by_type<guardian::Frozen>().length() == 1, 3);
    cleanup(p, cap, clock);
}

#[test]
fun refreeze_emits_single_frozen_event() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);
    poke_(&mut p, at_div(60_000_000), &clock);
    clock::set_for_testing(&mut clock, 2000);
    poke_(&mut p, at_div(70_000_000), &clock);
    assert!(guardian::is_paused(&p), 0);
    assert!(event::events_by_type<guardian::Frozen>().length() == 1, 1);
    cleanup(p, cap, clock);
}

#[test]
fun benign_request_cannot_block_freeze() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);
    // agent sends an innocuous request alongside a hard breach — freeze anyway
    submit_(&mut p, at_div(60_000_000), 7500, 10000, &clock);
    assert!(guardian::is_paused(&p), 0);
    cleanup(p, cap, clock);
}

// ── L2 CAUTION: ratchet + clamp + tighter_of (must-fix #3) ──────────────────

#[test]
fun agent_tighten_applies_instantly() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 10_000);

    submit_(&mut p, calm(), 6000, 8000, &clock);
    assert_params(&p, 6000, 8000, 0);
    assert!(!guardian::is_paused(&p), 2);
    assert!(guardian::last_change_ms(&p) == 10_000, 3);
    // honored exactly => no clamp/reject noise
    assert!(event::events_by_type<guardian::RequestClamped>().length() == 0, 4);
    assert!(event::events_by_type<guardian::RequestRejected>().length() == 0, 5);
    cleanup(p, cap, clock);
}

#[test]
fun looser_request_rejected_ratchet_holds() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 10_000);
    submit_(&mut p, calm(), 6000, 8000, &clock);

    clock::set_for_testing(&mut clock, 20_000); // inside the quiet window: no relax possible
    submit_(&mut p, calm(), 7000, 9000, &clock); // tries to LOOSEN both params
    assert_params(&p, 6000, 8000, 0); // one-way ratchet: unchanged
    assert!(event::events_by_type<guardian::RequestRejected>().length() == 2, 2);
    cleanup(p, cap, clock);
}

#[test]
fun overtighten_clamped_to_corridor_floor() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);

    submit_(&mut p, calm(), 1000, 1000, &clock); // below both floors
    assert_params(&p, 5500, 4000, 0); // clamped to floor, never below
    assert!(event::events_by_type<guardian::RequestClamped>().length() == 2, 2);
    cleanup(p, cap, clock);
}

#[test]
fun tighter_of_contract_vs_agent_wins() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);

    // div 2% => contract tier-1 targets 6834/8000; agent asks 6000/9000.
    // ltv: agent tighter (6000 < 6834) -> 6000; cap: contract tighter (8000 < 9000) -> 8000.
    submit_(&mut p, at_div(20_000_000), 6000, 9000, &clock);
    assert_params(&p, 6000, 8000, 0);
    // cap request was modified (9000 asked, 8000 applied) -> clamped, not rejected
    assert!(event::events_by_type<guardian::RequestClamped>().length() == 1, 2);
    assert!(event::events_by_type<guardian::RequestRejected>().length() == 0, 3);
    cleanup(p, cap, clock);
}

#[test]
fun contract_own_tighten_three_tiers() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);

    // tier boundaries over [1e7, 5e7): t2 at 23_333_333, t3 at 36_666_666
    clock::set_for_testing(&mut clock, 1000);
    poke_(&mut p, at_div(20_000_000), &clock); // tier 1
    assert_params(&p, 6834, 8000, 0); // baseline - span*1/3
    clock::set_for_testing(&mut clock, 2000);
    poke_(&mut p, at_div(30_000_000), &clock); // tier 2
    assert_params(&p, 6167, 6000, 2); // baseline - span*2/3
    clock::set_for_testing(&mut clock, 3000);
    poke_(&mut p, at_div(40_000_000), &clock); // tier 3 — still BELOW T
    assert_params(&p, 5500, 4000, 4); // floor
    assert!(!guardian::is_paused(&p), 6); // tier 3 tighten is NOT a freeze
    cleanup(p, cap, clock);
}

#[test]
fun conf_breach_tightens_tier1_and_marks_breach() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);

    poke_(&mut p, conf_bad(), &clock); // conf 2% > 1% max, div 0
    assert_params(&p, 6834, 8000, 0); // oracle-health => at least tier 1
    assert!(!guardian::is_paused(&p), 2); // conf NEVER freezes
    assert!(guardian::last_breach_ms(&p) == 1000, 3); // blocks relax
    cleanup(p, cap, clock);
}

#[test]
fun conf_exactly_at_max_is_not_breach() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);

    poke_(&mut p, conf_at_max(), &clock); // strict >: boundary is healthy
    assert_params(&p, 7500, 10000, 0);
    assert!(guardian::last_breach_ms(&p) == 0, 2);
    cleanup(p, cap, clock);
}

// ── RELAX: gated drip, %-of-span, capped, never frozen/asked ────────────────

#[test]
fun relax_blocked_inside_all_clear_window() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);

    clock::set_for_testing(&mut clock, 1_000_000);
    poke_(&mut p, at_div(20_000_000), &clock); // breach -> 6834/8000
    clock::set_for_testing(&mut clock, 1_500_000); // 500k < 600k window
    poke_(&mut p, calm(), &clock);
    assert_params(&p, 6834, 8000, 0); // no relax yet
    cleanup(p, cap, clock);
}

#[test]
fun relax_steps_after_window_with_cooldown() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);

    clock::set_for_testing(&mut clock, 1_000_000);
    poke_(&mut p, at_div(20_000_000), &clock); // 6834/8000, last_breach=1e6

    clock::set_for_testing(&mut clock, 1_700_000); // 700k since breach >= window
    poke_(&mut p, calm(), &clock);
    assert_params(&p, 7034, 8600, 0); // ONE step: +200 / +600 (10% of span)
    assert!(guardian::last_relax_ms(&p) == 1_700_000, 2);

    clock::set_for_testing(&mut clock, 1_750_000); // 50k < cooldown
    poke_(&mut p, calm(), &clock);
    assert_params(&p, 7034, 8600, 3); // second step blocked

    clock::set_for_testing(&mut clock, 2_300_000); // cooldown elapsed
    poke_(&mut p, calm(), &clock);
    assert_params(&p, 7234, 9200, 5);
    cleanup(p, cap, clock);
}

#[test]
fun relax_caps_at_baseline() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);

    clock::set_for_testing(&mut clock, 1_000_000);
    poke_(&mut p, at_div(20_000_000), &clock); // 6834/8000

    let mut t = 1_700_000;
    let mut i = 0;
    while (i < 8) {
        clock::set_for_testing(&mut clock, t);
        poke_(&mut p, calm(), &clock);
        t = t + 600_000;
        i = i + 1;
    };
    assert_params(&p, 7500, 10000, 0); // fully reopened, NEVER past baseline
    cleanup(p, cap, clock);
}

#[test]
fun calm_never_unfreezes_and_frozen_blocks_relax() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);

    clock::set_for_testing(&mut clock, 1000);
    poke_(&mut p, at_div(60_000_000), &clock); // freeze + floor

    clock::set_for_testing(&mut clock, 700_000);
    poke_(&mut p, calm(), &clock);
    clock::set_for_testing(&mut clock, 1_400_000);
    poke_(&mut p, calm(), &clock);

    assert!(guardian::is_paused(&p), 0); // calm market does NOT unfreeze — DAO only
    assert_params(&p, 5500, 4000, 1); // and params stay at floor (no drip while frozen)
    cleanup(p, cap, clock);
}

// ── Governance: owned cap, 2nd-param rule (must-fix #2) ─────────────────────

#[test]
fun governance_unfreeze_resets_quiet_window() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);

    clock::set_for_testing(&mut clock, 1000);
    poke_(&mut p, at_div(60_000_000), &clock); // freeze

    clock::set_for_testing(&mut clock, 1_400_000);
    guardian::governance_unfreeze(&mut p, &cap, &clock);
    assert!(!guardian::is_paused(&p), 0);
    assert!(event::events_by_type<guardian::Unfrozen>().length() == 1, 1);

    clock::set_for_testing(&mut clock, 1_500_000); // only 100k after unfreeze
    poke_(&mut p, calm(), &clock);
    assert_params(&p, 5500, 4000, 2); // quiet window restarted at unfreeze: no relax

    clock::set_for_testing(&mut clock, 2_100_000); // 700k after unfreeze
    poke_(&mut p, calm(), &clock);
    assert_params(&p, 5700, 4600, 4); // drip resumes from floor
    cleanup(p, cap, clock);
}

#[test, expected_failure(abort_code = guardian::EWrongGovernanceCap)]
fun wrong_policy_governance_cap_rejected() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p1, cap1) = fresh(&clock, &mut ctx);
    let (p2, cap2) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);
    poke_(&mut p1, at_div(60_000_000), &clock);

    guardian::governance_unfreeze(&mut p1, &cap2, &clock); // cap of ANOTHER policy

    test_utils::destroy(p2);
    test_utils::destroy(cap1);
    cleanup(p1, cap2, clock);
}

#[test]
fun governance_set_corridor_clamps_current() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);
    submit_(&mut p, calm(), 1000, 1000, &clock); // tighten to floors 5500/4000

    // DAO raises both floors — current must follow into the new corridor
    guardian::governance_set_corridor(&mut p, &cap, 6000, 7500, 5000, 10000, &clock);
    assert_params(&p, 6000, 5000, 0);
    assert!(guardian::max_ltv_floor_bps(&p) == 6000, 2);
    assert!(guardian::borrow_cap_floor_bps(&p) == 5000, 3);
    cleanup(p, cap, clock);
}

#[test, expected_failure(abort_code = guardian::EInvalidCorridor)]
fun governance_set_corridor_invalid_rejected() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    guardian::governance_set_corridor(&mut p, &cap, 8000, 7500, 4000, 10000, &clock);
    cleanup(p, cap, clock);
}

#[test]
fun governance_rotate_agent_updates() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    guardian::governance_rotate_agent(&mut p, &cap, @0xB0B, &clock);
    assert!(guardian::registered_agent(&p) == @0xB0B, 0);
    cleanup(p, cap, clock);
}

// ── submit sender gate (registered-agent anti-spam) ─────────────────────────

#[test]
fun submit_gate_accepts_registered_agent() {
    let mut sc = test_scenario::begin(AGENT);
    let clock = clock::create_for_testing(sc.ctx());
    let (mut p, cap) = fresh(&clock, sc.ctx());
    guardian::submit_for_testing(
        &mut p, calm(), guardian::new_param_request(6000, 8000), 42, &clock, sc.ctx(),
    );
    assert_params(&p, 6000, 8000, 0);
    test_utils::destroy(p);
    test_utils::destroy(cap);
    clock::destroy_for_testing(clock);
    sc.end();
}

#[test, expected_failure(abort_code = guardian::ENotRegisteredAgent)]
fun submit_gate_rejects_unregistered_sender() {
    let mut sc = test_scenario::begin(@0xBAD);
    let clock = clock::create_for_testing(sc.ctx());
    let (mut p, cap) = fresh(&clock, sc.ctx());
    guardian::submit_for_testing(
        &mut p, calm(), guardian::new_param_request(6000, 8000), 42, &clock, sc.ctx(),
    );
    test_utils::destroy(p);
    test_utils::destroy(cap);
    clock::destroy_for_testing(clock);
    sc.end();
}

// ── create_policy validation ────────────────────────────────────────────────

#[test, expected_failure(abort_code = guardian::EInvalidCorridor)]
fun create_policy_rejects_bad_corridor() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (p, cap) = guardian::new_policy_for_testing(
        AGENT, feed(), pool(), 8000, 7500, 4000, 10000, // ltv floor > baseline
        50_000_000, 10_000_000, 10_000_000, 60, 9, 6, 600_000, 600_000, 1000,
        &clock, &mut ctx,
    );
    cleanup(p, cap, clock);
}

#[test, expected_failure(abort_code = guardian::EInvalidThresholds)]
fun create_policy_rejects_bad_thresholds() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (p, cap) = guardian::new_policy_for_testing(
        AGENT, feed(), pool(), 5500, 7500, 4000, 10000,
        10_000_000, 50_000_000, 10_000_000, 60, 9, 6, 600_000, 600_000, 1000, // T <= d_caution
        &clock, &mut ctx,
    );
    cleanup(p, cap, clock);
}

#[test, expected_failure(abort_code = guardian::EBadFeedId)]
fun create_policy_rejects_bad_feed_len() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (p, cap) = guardian::new_policy_for_testing(
        AGENT, x"50c67b", pool(), 5500, 7500, 4000, 10000, // 3 bytes, not 32
        50_000_000, 10_000_000, 10_000_000, 60, 9, 6, 600_000, 600_000, 1000,
        &clock, &mut ctx,
    );
    cleanup(p, cap, clock);
}

#[test, expected_failure(abort_code = guardian::EInvalidRelaxStep)]
fun create_policy_rejects_bad_relax_step() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (p, cap) = guardian::new_policy_for_testing(
        AGENT, feed(), pool(), 5500, 7500, 4000, 10000,
        50_000_000, 10_000_000, 10_000_000, 60, 9, 6, 600_000, 600_000, 10_001, // > 100% of span
        &clock, &mut ctx,
    );
    cleanup(p, cap, clock);
}

#[test, expected_failure(abort_code = guardian::EInvalidDecimals)]
fun create_policy_rejects_bad_decimals() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (p, cap) = guardian::new_policy_for_testing(
        AGENT, feed(), pool(), 5500, 7500, 4000, 10000,
        50_000_000, 10_000_000, 10_000_000, 60, 19, 6, 600_000, 600_000, 1000, // base 19 > 18
        &clock, &mut ctx,
    );
    cleanup(p, cap, clock);
}

#[test, expected_failure(abort_code = guardian::EInvalidThresholds)]
fun create_policy_rejects_threshold_above_full_scale() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (p, cap) = guardian::new_policy_for_testing(
        AGENT, feed(), pool(), 5500, 7500, 4000, 10000,
        2_000_000_000, 10_000_000, 10_000_000, 60, 9, 6, 600_000, 600_000, 1000, // T > price_scale
        &clock, &mut ctx,
    );
    cleanup(p, cap, clock);
}

#[test, expected_failure(abort_code = guardian::EInvalidRelaxStep)]
fun create_policy_rejects_relax_step_flooring_to_zero() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    // span 2000 (ltv) * frac 4 / 10000 = 0 -> step floors to 0, RELAX would stall
    let (p, cap) = guardian::new_policy_for_testing(
        AGENT, feed(), pool(), 5500, 7500, 4000, 10000,
        50_000_000, 10_000_000, 10_000_000, 60, 9, 6, 600_000, 600_000, 4,
        &clock, &mut ctx,
    );
    cleanup(p, cap, clock);
}

#[test]
fun policy_stores_expected_pool_id() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (p, cap) = fresh(&clock, &mut ctx);
    assert!(guardian::expected_pool_id(&p) == pool(), 0);
    cleanup(p, cap, clock);
}

// ── liveness bookkeeping (D4) ────────────────────────────────────────────────

#[test]
fun heartbeat_epoch_last_check_last_change() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);

    clock::set_for_testing(&mut clock, 5000);
    poke_(&mut p, calm(), &clock); // calm no-op tick
    assert!(guardian::last_check_ms(&p) == 5000, 0); // heartbeat ALWAYS advances
    assert!(guardian::last_change_ms(&p) == 0, 1); // nothing changed
    assert!(guardian::epoch(&p) == 1, 2);

    clock::set_for_testing(&mut clock, 6000);
    poke_(&mut p, at_div(20_000_000), &clock); // tier-1 tighten
    assert!(guardian::last_check_ms(&p) == 6000, 3);
    assert!(guardian::last_change_ms(&p) == 6000, 4); // change recorded
    assert!(guardian::epoch(&p) == 2, 5);
    assert!(event::events_by_type<guardian::RiskEvaluated>().length() == 2, 6); // every apply emits
    cleanup(p, cap, clock);
}

// ── new behavior pinned this round (review fixes) ───────────────────────────

#[test]
fun unfreeze_when_not_paused_is_noop() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1_000_000);
    poke_(&mut p, at_div(20_000_000), &clock); // breach -> last_breach=1e6, params 6834/8000
    let lb = guardian::last_breach_ms(&p);

    clock::set_for_testing(&mut clock, 1_400_000);
    guardian::governance_unfreeze(&mut p, &cap, &clock); // policy is NOT paused
    assert!(event::events_by_type<guardian::Unfrozen>().length() == 0, 0); // no phantom event
    assert!(guardian::last_breach_ms(&p) == lb, 1); // quiet window NOT disturbed
    assert!(guardian::last_change_ms(&p) == 1_000_000, 2); // unchanged by the no-op
    cleanup(p, cap, clock);
}

#[test]
fun loosen_at_baseline_is_rejected_not_clamped() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx); // current == baseline 7500/10000
    clock::set_for_testing(&mut clock, 1000);

    submit_(&mut p, calm(), 8000, 12000, &clock); // both ABOVE baseline (loosen attempt)
    assert_params(&p, 7500, 10000, 0); // unchanged
    // the clamped value would equal current here — the OLD `clamped > before`
    // rule mislabeled this CLAMPED; classify by the raw ask => REJECTED.
    assert!(event::events_by_type<guardian::RequestRejected>().length() == 2, 2);
    assert!(event::events_by_type<guardian::RequestClamped>().length() == 0, 3);
    cleanup(p, cap, clock);
}

// ── coverage gaps closed (review) ───────────────────────────────────────────

#[test]
fun advisory_score_never_influences_state() {
    // The judge make-or-break ("its number is never trusted") as an EXECUTABLE
    // witness: identical sequence on two policies, score 0 vs 255, every state
    // field must match. A regression branching on the score fails here.
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut lo, cap_lo) = fresh(&clock, &mut ctx);
    let (mut hi, cap_hi) = fresh(&clock, &mut ctx);
    let req = guardian::new_param_request(6000, 8000);

    clock::set_for_testing(&mut clock, 10_000);
    guardian::apply_for_testing(&mut lo, at_div(20_000_000), option::some(req), 0, &clock);
    guardian::apply_for_testing(&mut hi, at_div(20_000_000), option::some(req), 255, &clock);
    clock::set_for_testing(&mut clock, 1_000_000);
    guardian::apply_for_testing(&mut lo, calm(), option::none(), 0, &clock);
    guardian::apply_for_testing(&mut hi, calm(), option::none(), 255, &clock);

    assert!(guardian::is_paused(&lo) == guardian::is_paused(&hi), 0);
    assert!(guardian::max_ltv_current_bps(&lo) == guardian::max_ltv_current_bps(&hi), 1);
    assert!(guardian::borrow_cap_current_bps(&lo) == guardian::borrow_cap_current_bps(&hi), 2);
    assert!(guardian::last_breach_ms(&lo) == guardian::last_breach_ms(&hi), 3);
    assert!(guardian::last_relax_ms(&lo) == guardian::last_relax_ms(&hi), 4);
    assert!(guardian::last_change_ms(&lo) == guardian::last_change_ms(&hi), 5);
    assert!(guardian::epoch(&lo) == guardian::epoch(&hi), 6);

    test_utils::destroy(lo);
    test_utils::destroy(hi);
    test_utils::destroy(cap_lo);
    test_utils::destroy(cap_hi);
    clock::destroy_for_testing(clock);
}

#[test]
fun freeze_cause_payloads_and_book_precedence() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);

    poke_(&mut p, at_div(60_000_000), &clock); // divergence freeze
    let fz = event::events_by_type<guardian::Frozen>();
    assert!(fz.length() == 1, 0);
    assert!(guardian::frozen_cause(&fz[0]) == 0, 1); // FREEZE_CAUSE_DIVERGENCE
    assert!(guardian::frozen_div(&fz[0]) == 60_000_000, 2);
    cleanup(p, cap, clock);
}

#[test]
fun freeze_cause_book_not_ok_takes_precedence_over_divergence() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);

    // both legs true at once (only reachable via the test ctor — read_divergence
    // forces div=0 on a bad book): book-not-ok must win the cause field.
    let both = divergence::new_div_result_for_testing(60_000_000, 1_000_000_000, 1_000_000, 1);
    poke_(&mut p, both, &clock);
    let fz = event::events_by_type<guardian::Frozen>();
    assert!(fz.length() == 1, 0);
    assert!(guardian::frozen_cause(&fz[0]) == 1, 1); // FREEZE_CAUSE_BOOK_NOT_OK
    cleanup(p, cap, clock);
}

#[test]
fun request_clamped_payload_fields() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);

    // div 2% -> contract cap target 8000; agent asks cap 9000 -> clamped to 8000.
    submit_(&mut p, at_div(20_000_000), 6000, 9000, &clock);
    let ev = event::events_by_type<guardian::RequestClamped>();
    assert!(ev.length() == 1, 0);
    let (param, requested, applied) = guardian::clamped_fields(&ev[0]);
    assert!(param == 1, 1); // PARAM_BORROW_CAP
    assert!(requested == 9000, 2);
    assert!(applied == 8000, 3);
    cleanup(p, cap, clock);
}

#[test, expected_failure(abort_code = guardian::ENotRegisteredAgent)]
fun old_agent_rejected_after_rotation() {
    let mut sc = test_scenario::begin(AGENT);
    let mut clock = clock::create_for_testing(sc.ctx());
    let (mut p, cap) = fresh(&clock, sc.ctx());
    clock::set_for_testing(&mut clock, 1000);
    guardian::governance_rotate_agent(&mut p, &cap, @0xB0B, &clock);
    // still in AGENT's tx context: the rotated-out key must no longer pass
    guardian::submit_for_testing(
        &mut p, calm(), guardian::new_param_request(6000, 8000), 1, &clock, sc.ctx(),
    );
    test_utils::destroy(p);
    test_utils::destroy(cap);
    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
fun new_agent_accepted_after_rotation() {
    let mut sc = test_scenario::begin(AGENT);
    let mut clock = clock::create_for_testing(sc.ctx());
    let (mut p, cap) = fresh(&clock, sc.ctx());
    clock::set_for_testing(&mut clock, 1000);
    guardian::governance_rotate_agent(&mut p, &cap, @0xB0B, &clock);

    sc.next_tx(@0xB0B);
    guardian::submit_for_testing(
        &mut p, calm(), guardian::new_param_request(6000, 8000), 1, &clock, sc.ctx(),
    );
    assert_params(&p, 6000, 8000, 0); // new agent's tighten applied
    test_utils::destroy(p);
    test_utils::destroy(cap);
    clock::destroy_for_testing(clock);
    sc.end();
}

#[test]
fun corridor_narrowed_below_current_clamps_down() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx); // current at baseline 7500/10000
    clock::set_for_testing(&mut clock, 1000);

    // DAO lowers BOTH baselines below current -> governance-initiated instant tighten
    guardian::governance_set_corridor(&mut p, &cap, 5500, 7000, 4000, 9000, &clock);
    assert_params(&p, 7000, 9000, 0); // clamped DOWN into the new corridor
    cleanup(p, cap, clock);
}

#[test]
fun sub_caution_divergence_is_calm() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);

    poke_(&mut p, at_div(5_000_000), &clock); // 0.5% < d_caution(1%)
    assert_params(&p, 7500, 10000, 0); // no tighten (tier 0)
    assert!(!guardian::is_paused(&p), 2);
    assert!(guardian::last_breach_ms(&p) == 0, 3); // NOT a breach (>= comparison)
    cleanup(p, cap, clock);
}

#[test]
fun div_exactly_at_d_caution_is_tier1() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);

    poke_(&mut p, at_div(10_000_000), &clock); // exactly d_caution -> tier 1 (>=)
    assert_params(&p, 6834, 8000, 0);
    assert!(guardian::last_breach_ms(&p) == 1000, 2); // breach bumped at the boundary
    cleanup(p, cap, clock);
}

#[test]
fun mixed_request_one_tighter_one_looser() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);

    clock::set_for_testing(&mut clock, 10_000);
    submit_(&mut p, calm(), 6000, 8000, &clock); // establish current 6000/8000

    clock::set_for_testing(&mut clock, 20_000); // inside quiet window (no relax)
    submit_(&mut p, calm(), 5800, 9000, &clock); // ltv TIGHTER, cap LOOSER, same ask
    assert_params(&p, 5800, 8000, 0); // ltv tightened per-param; cap ratchet held
    assert!(event::events_by_type<guardian::RequestRejected>().length() == 1, 2); // cap only
    assert!(event::events_by_type<guardian::RequestClamped>().length() == 0, 3); // ltv honored, silent
    let ev = event::events_by_type<guardian::RequestRejected>();
    let (param, requested, applied) = guardian::rejected_fields(&ev[0]);
    assert!(param == 1 && requested == 9000 && applied == 8000, 4);
    cleanup(p, cap, clock);
}

#[test]
fun exact_floor_ask_and_repeat_are_silent() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh(&clock, &mut ctx);

    clock::set_for_testing(&mut clock, 1000);
    submit_(&mut p, calm(), 5500, 4000, &clock); // ask EXACTLY the floor -> honored verbatim
    assert_params(&p, 5500, 4000, 0);
    assert!(event::events_by_type<guardian::RequestClamped>().length() == 0, 2);
    assert!(event::events_by_type<guardian::RequestRejected>().length() == 0, 3);

    clock::set_for_testing(&mut clock, 2000);
    submit_(&mut p, calm(), 5500, 4000, &clock); // ask == current -> no change, silent
    assert_params(&p, 5500, 4000, 4);
    assert!(event::events_by_type<guardian::RequestClamped>().length() == 0, 5);
    assert!(event::events_by_type<guardian::RequestRejected>().length() == 0, 6);
    assert!(guardian::epoch(&p) == 2, 7); // both ticks still counted
    cleanup(p, cap, clock);
}
