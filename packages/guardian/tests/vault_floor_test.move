/// Layer-1 inline-floor tests for `demo_vault`. The vault's `borrow`/
/// `withdraw_collateral` run the SAME params-less `poke` the keeper calls (D5),
/// which re-derives divergence in-tx and WRITES is_frozen/current; the vault
/// then enforces the freshly-written state, fail-CLOSED. Unit tests can't build
/// `&Pool`/`&PriceInfoObject`, so they drive the enforce half via the
/// `*_with_div_for_testing` overloads with a pre-built DivResult + a policy whose
/// state is set through `guardian::apply_for_testing` (the poke half is proven by
/// the guardian enforcement suite + the Step-2 devInspect).
#[test_only]
module guardian::vault_floor_test;

use guardian::divergence::{Self, DivResult};
use guardian::guardian::{Self, GuardianPolicy, GovernanceCap};
use guardian::demo_vault::{Self, DemoVault};
use sui::balance;
use sui::clock::{Self, Clock};
use sui::test_utils;

const AGENT: address = @0xA9;

// test coin types: BASE = collateral (real Balance), QUOTE = debt denom (phantom)
public struct BASE has drop {}
public struct QUOTE has drop {}

fun feed(): vector<u8> { x"50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266" }
fun pool(): ID { object::id_from_address(@0x9001) }

// policy with base=9 / quote=6 decimals, corridor 5500/7500 + 4000/10000.
fun fresh_policy(clock: &Clock, ctx: &mut TxContext): (GuardianPolicy, GovernanceCap) {
    guardian::new_policy_for_testing(
        AGENT, feed(), pool(),
        5500, 7500, 4000, 10000,
        50_000_000, 10_000_000, 10_000_000, 60,
        9, 6,
        600_000, 600_000, 1000,
        clock, ctx,
    )
}

// 1 "SUI" = 1e9 base minor collateral.
fun vault_with(policy: &GuardianPolicy, coll_base_minor: u64, ctx: &mut TxContext): DemoVault<QUOTE, BASE> {
    demo_vault::new_vault_with_collateral_for_testing<QUOTE, BASE>(
        policy, balance::create_for_testing<BASE>(coll_base_minor), ctx,
    )
}

// calm reading, SUI ≈ $0.74 -> pyth_px_1e9 = 740_000_000.
fun calm_px(): DivResult { divergence::new_div_result_for_testing(500_000, 740_000_000, 1_000_000, 0) }
fun book_bad(): DivResult { divergence::new_div_result_for_testing(0, 740_000_000, 1_000_000, 1) }
fun freeze_div(): DivResult { divergence::new_div_result_for_testing(60_000_000, 740_000_000, 1_000_000, 0) }

fun cleanup(v: DemoVault<QUOTE, BASE>, p: GuardianPolicy, c: GovernanceCap, clock: Clock) {
    test_utils::destroy(v);
    test_utils::destroy(p);
    test_utils::destroy(c);
    clock::destroy_for_testing(clock);
}

// ── collateral valuation anchor ─────────────────────────────────────────────

#[test]
fun collateral_value_anchor() {
    // 1e9 base minor (1 SUI, 9dp) at $0.74 -> 740_000 quote minor (DBUSDC, 6dp).
    assert!(demo_vault::collateral_value_in_quote(1_000_000_000, 740_000_000, 9, 6) == 740_000, 0);
    // 2.5 SUI -> 1_850_000
    assert!(demo_vault::collateral_value_in_quote(2_500_000_000, 740_000_000, 9, 6) == 1_850_000, 1);
    // inverse decimals (base<quote) multiplies
    assert!(demo_vault::collateral_value_in_quote(1_000_000, 740_000_000, 6, 9) == 740_000_000, 2);
}

// ── calm path: both hooks succeed ───────────────────────────────────────────

#[test]
fun calm_borrow_and_withdraw_succeed() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (p, cap) = fresh_policy(&clock, &mut ctx);
    let mut v = vault_with(&p, 1_000_000_000, &mut ctx); // 1 SUI, coll value $0.74

    // borrow 0.5 DBUSDC (500_000 minor): LTV = 500000/740000 = 67.6% < 75% baseline -> ok
    demo_vault::borrow_with_div_for_testing(&mut v, &p, calm_px(), 500_000);
    assert!(demo_vault::debt(&v) == 500_000, 0);

    // withdraw 0.1 SUI (1e8 minor): remaining 0.9 SUI = $0.666; debt 500000/666000 = 75.07% > 75% ... tighten check
    // use a smaller withdraw that stays solvent: withdraw 0.05 SUI -> remaining 0.95 SUI = 703000; 500000/703000=71% ok
    let coin = demo_vault::withdraw_collateral_with_div_for_testing(&mut v, &p, calm_px(), 50_000_000, &mut ctx);
    assert!(demo_vault::collateral(&v) == 950_000_000, 1);
    test_utils::destroy(coin);
    cleanup(v, p, cap, clock);
}

// ── EPolicyMismatch ─────────────────────────────────────────────────────────

#[test, expected_failure(abort_code = demo_vault::EPolicyMismatch)]
fun borrow_wrong_policy_rejected() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (p1, cap1) = fresh_policy(&clock, &mut ctx);
    let (p2, cap2) = fresh_policy(&clock, &mut ctx); // a DIFFERENT policy
    let mut v = vault_with(&p1, 1_000_000_000, &mut ctx);

    demo_vault::borrow_with_div_for_testing(&mut v, &p2, calm_px(), 100_000); // p2 != vault.policy_id

    test_utils::destroy(p2);
    test_utils::destroy(cap2);
    cleanup(v, p1, cap1, clock);
}

// ── EFrozen (both causes) ───────────────────────────────────────────────────

#[test, expected_failure(abort_code = demo_vault::EFrozen)]
fun borrow_aborts_when_frozen_by_divergence() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh_policy(&clock, &mut ctx);
    let mut v = vault_with(&p, 1_000_000_000, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);
    guardian::apply_for_testing(&mut p, freeze_div(), option::none(), 0, &clock); // div>=T -> paused

    demo_vault::borrow_with_div_for_testing(&mut v, &p, calm_px(), 100_000); // frozen -> EFrozen
    cleanup(v, p, cap, clock);
}

#[test, expected_failure(abort_code = demo_vault::EFrozen)]
fun borrow_aborts_when_frozen_by_book_not_ok() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh_policy(&clock, &mut ctx);
    let mut v = vault_with(&p, 1_000_000_000, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);
    guardian::apply_for_testing(&mut p, book_bad(), option::none(), 0, &clock); // book-not-ok -> paused

    demo_vault::borrow_with_div_for_testing(&mut v, &p, calm_px(), 100_000);
    cleanup(v, p, cap, clock);
}

#[test, expected_failure(abort_code = demo_vault::EFrozen)]
fun withdraw_aborts_when_frozen() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh_policy(&clock, &mut ctx);
    let mut v = vault_with(&p, 1_000_000_000, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);
    guardian::apply_for_testing(&mut p, freeze_div(), option::none(), 0, &clock);

    let coin = demo_vault::withdraw_collateral_with_div_for_testing(&mut v, &p, calm_px(), 1, &mut ctx);
    test_utils::destroy(coin);
    cleanup(v, p, cap, clock);
}

// ── ELtvExceeded (max_ltv binds first) ──────────────────────────────────────

#[test, expected_failure(abort_code = demo_vault::ELtvExceeded)]
fun borrow_exceeding_max_ltv_rejected() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (p, cap) = fresh_policy(&clock, &mut ctx); // max_ltv 7500, borrow_cap 10000
    let mut v = vault_with(&p, 1_000_000_000, &mut ctx); // coll $0.74

    // borrow 0.6 DBUSDC: 600000*10000=6e9 > 7500*740000=5.55e9 (max_ltv FAIL),
    // but 6e9 <= 10000*740000=7.4e9 (cap ok) -> max_ltv binds -> ELtvExceeded
    demo_vault::borrow_with_div_for_testing(&mut v, &p, calm_px(), 600_000);
    cleanup(v, p, cap, clock);
}

#[test, expected_failure(abort_code = demo_vault::ELtvExceeded)]
fun withdraw_breaking_ltv_rejected() {
    let mut ctx = tx_context::dummy();
    let clock = clock::create_for_testing(&mut ctx);
    let (p, cap) = fresh_policy(&clock, &mut ctx);
    let mut v = vault_with(&p, 1_000_000_000, &mut ctx);
    // safe borrow first (50% LTV)
    demo_vault::borrow_with_div_for_testing(&mut v, &p, calm_px(), 370_000);
    // withdraw 0.6 SUI -> remaining 0.4 SUI = $0.296; 370000/296000 = 125% > 75% -> ELtvExceeded
    let coin = demo_vault::withdraw_collateral_with_div_for_testing(&mut v, &p, calm_px(), 600_000_000, &mut ctx);
    test_utils::destroy(coin);
    cleanup(v, p, cap, clock);
}

// ── EBorrowCapExceeded (cap binds when tightened below max_ltv) ──────────────

#[test, expected_failure(abort_code = demo_vault::EBorrowCapExceeded)]
fun borrow_exceeding_borrow_cap_rejected() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh_policy(&clock, &mut ctx);
    let mut v = vault_with(&p, 1_000_000_000, &mut ctx);
    clock::set_for_testing(&mut clock, 1000);
    // tighten to floor: max_ltv 5500, borrow_cap 4000 (cap now tighter than ltv)
    guardian::apply_for_testing(&mut p, freeze_div_below_T(), option::none(), 0, &clock);

    // borrow 0.35 DBUSDC: 350000*10000=3.5e9 <= 5500*740000=4.07e9 (max_ltv ok),
    // but 3.5e9 > 4000*740000=2.96e9 (cap FAIL) -> EBorrowCapExceeded
    demo_vault::borrow_with_div_for_testing(&mut v, &p, calm_px(), 350_000);
    cleanup(v, p, cap, clock);
}

// div in [d_caution, T): tier-3 tighten to floor, NOT frozen.
fun freeze_div_below_T(): DivResult { divergence::new_div_result_for_testing(40_000_000, 740_000_000, 1_000_000, 0) }

// ── ungated actions (deposit/repay) never gated ─────────────────────────────

#[test]
fun deposit_and_repay_are_ungated_even_when_frozen() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    let (mut p, cap) = fresh_policy(&clock, &mut ctx);
    let mut v = vault_with(&p, 1_000_000_000, &mut ctx);
    demo_vault::borrow_with_div_for_testing(&mut v, &p, calm_px(), 400_000);
    clock::set_for_testing(&mut clock, 1000);
    guardian::apply_for_testing(&mut p, freeze_div(), option::none(), 0, &clock); // frozen

    // deposit MORE collateral and repay debt — both toward-safe, must NOT abort while frozen
    demo_vault::deposit_collateral(&mut v, sui::coin::from_balance(balance::create_for_testing<BASE>(500_000_000), &mut ctx));
    assert!(demo_vault::collateral(&v) == 1_500_000_000, 0);
    demo_vault::repay(&mut v, 150_000);
    assert!(demo_vault::debt(&v) == 250_000, 1);
    cleanup(v, p, cap, clock);
}
