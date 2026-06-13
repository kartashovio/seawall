/// A minimal-but-real lending vault — the DEMO CONSUMER of the guardian, not the
/// product. It exists to make the guardian's protection visible: a live
/// Pyth-priced SUI position whose health the Pyth↔DeepBook divergence visibly
/// threatens.
///
/// Layer-1 inline floor (the always-on, agent-INDEPENDENT loss-preventer, D5):
/// `borrow` and `withdraw_collateral` call the SAME params-less `guardian::poke`
/// the keeper calls — it re-derives divergence in-tx and WRITES is_frozen/current
/// — then the vault enforces the freshly-written state, fail-CLOSED. Every borrow
/// self-evaluates, so the floor protects even with a DEAD agent AND a dead keeper.
///
/// `deposit_collateral`/`repay` are ungated (toward-safe). Only `borrow` and
/// `withdraw_collateral` (the two value-extracting actions) are gated (D6 — we do
/// NOT gate liquidation; freezing it would trap bad debt).
///
/// Demo simplification (documented): debt is a COUNTER in Quote minor units (no
/// Coin<Quote> mint); `borrow_cap` is modeled as a second per-position LTV-style
/// bound (prod = a protocol-wide outstanding cap). `withdraw_collateral` returns
/// real Coin<Base>.
module guardian::demo_vault;

use guardian::constants;
use guardian::divergence::{Self, DivResult};
use guardian::guardian::{Self, GuardianPolicy};
use deepbook::pool::Pool;
use pyth::price_info::PriceInfoObject;
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

/// The policy passed in does not govern this vault.
const EPolicyMismatch: u64 = 1;
/// The guardian re-derived a hard stop (div >= T OR book-not-ok) — fail-CLOSED.
const EFrozen: u64 = 2;
/// Post-action debt would exceed max_ltv_current of the collateral value.
const ELtvExceeded: u64 = 3;
/// Post-action debt would exceed borrow_cap_current of the collateral value.
const EBorrowCapExceeded: u64 = 4;

const ACTION_DEPOSIT: u8 = 0;
const ACTION_BORROW: u8 = 1;
const ACTION_WITHDRAW: u8 = 2;
const ACTION_REPAY: u8 = 3;

/// Base = collateral coin (held as Balance<Base>); Quote = debt denomination
/// (phantom — no Quote coins are held, debt is a counter).
public struct DemoVault<phantom Quote, phantom Base> has key {
    id: UID,
    /// The guardian policy that governs this vault (asserted on every gated op).
    policy_id: ID,
    collateral: Balance<Base>,
    /// Outstanding debt, Quote minor units (counter only).
    debt_quote_minor: u128,
}

public struct VaultAction has copy, drop {
    vault_id: ID,
    action: u8, // 0 deposit / 1 borrow / 2 withdraw / 3 repay
    amount: u128,
    debt_after: u128,
    collateral_after: u64,
    ts_ms: u64,
}

// ── construction + ungated actions ──────────────────────────────────────────

/// Creates and SHARES a vault bound to `policy`.
public fun create_vault<Quote, Base>(policy: &GuardianPolicy, ctx: &mut TxContext) {
    transfer::share_object(DemoVault<Quote, Base> {
        id: object::new(ctx),
        policy_id: object::id(policy),
        collateral: balance::zero<Base>(),
        debt_quote_minor: 0,
    });
}

/// Ungated (toward-safe): adding collateral can only improve health.
public fun deposit_collateral<Quote, Base>(vault: &mut DemoVault<Quote, Base>, c: Coin<Base>) {
    let amount = coin::value(&c);
    balance::join(&mut vault.collateral, coin::into_balance(c));
    event::emit(VaultAction {
        vault_id: object::id(vault),
        action: ACTION_DEPOSIT,
        amount: amount as u128,
        debt_after: vault.debt_quote_minor,
        collateral_after: balance::value(&vault.collateral),
        ts_ms: 0,
    });
}

/// Ungated (toward-safe): repaying can only improve health. Clamps at 0.
public fun repay<Quote, Base>(vault: &mut DemoVault<Quote, Base>, amount: u128) {
    let paid = if (amount >= vault.debt_quote_minor) vault.debt_quote_minor else amount;
    vault.debt_quote_minor = vault.debt_quote_minor - paid;
    event::emit(VaultAction {
        vault_id: object::id(vault),
        action: ACTION_REPAY,
        amount: paid,
        debt_after: vault.debt_quote_minor,
        collateral_after: balance::value(&vault.collateral),
        ts_ms: 0,
    });
}

// ── gated actions (Layer-1 inline floor) ────────────────────────────────────

/// Borrow `amount_quote_minor` against the collateral. Same-PTB Pyth: the caller
/// posts `updatePriceFeeds` then calls this with the fresh `pio`.
public fun borrow<Quote, Base>(
    vault: &mut DemoVault<Quote, Base>,
    policy: &mut GuardianPolicy,
    pio: &PriceInfoObject,
    pool: &Pool<Base, Quote>,
    clock: &Clock,
    amount_quote_minor: u128,
) {
    let d = inline_poke(vault, policy, pio, pool, clock);
    let new_debt = vault.debt_quote_minor + amount_quote_minor;
    enforce_solvency(policy, &d, new_debt, balance::value(&vault.collateral));
    vault.debt_quote_minor = new_debt;
    emit_action(vault, ACTION_BORROW, amount_quote_minor, clock);
}

/// Withdraw `amount_base_minor` of collateral, returning a real Coin<Base>.
/// Enforced against the REMAINING collateral with the CURRENT debt.
public fun withdraw_collateral<Quote, Base>(
    vault: &mut DemoVault<Quote, Base>,
    policy: &mut GuardianPolicy,
    pio: &PriceInfoObject,
    pool: &Pool<Base, Quote>,
    clock: &Clock,
    amount_base_minor: u64,
    ctx: &mut TxContext,
): Coin<Base> {
    let d = inline_poke(vault, policy, pio, pool, clock);
    let remaining = balance::value(&vault.collateral) - amount_base_minor; // aborts if > balance
    enforce_solvency(policy, &d, vault.debt_quote_minor, remaining);
    let out = coin::from_balance(balance::split(&mut vault.collateral, amount_base_minor), ctx);
    emit_action(vault, ACTION_WITHDRAW, amount_base_minor as u128, clock);
    out
}

/// The inline floor's shared preamble: assert this policy governs the vault, then
/// run the params-less keeper-identical `poke` (re-derives divergence + writes
/// is_frozen/current). Returns the reading so collateral is valued with the SAME
/// price (no second Pyth read, no TOCTOU).
fun inline_poke<Quote, Base>(
    vault: &DemoVault<Quote, Base>,
    policy: &mut GuardianPolicy,
    pio: &PriceInfoObject,
    pool: &Pool<Base, Quote>,
    clock: &Clock,
): DivResult {
    assert!(object::id(policy) == vault.policy_id, EPolicyMismatch);
    guardian::poke(policy, pio, pool, clock)
}

/// Fail-CLOSED gate: abort on freeze, else cross-multiply LTV + borrow-cap checks
/// against the freshly-written corridor (no division — dodges rounding, G9).
fun enforce_solvency(policy: &GuardianPolicy, d: &DivResult, debt: u128, coll_base_minor: u64) {
    assert!(!guardian::is_paused(policy), EFrozen);
    let coll_value = collateral_value_in_quote(
        coll_base_minor,
        divergence::pyth_px_1e9(d),
        guardian::base_decimals(policy),
        guardian::quote_decimals(policy),
    );
    let bps = constants::bps_denom() as u128;
    assert!(debt * bps <= (guardian::max_ltv_current_bps(policy) as u128) * coll_value, ELtvExceeded);
    assert!(debt * bps <= (guardian::borrow_cap_current_bps(policy) as u128) * coll_value, EBorrowCapExceeded);
}

/// Collateral value in Quote minor units, using the guardian's fresh `pyth_px_1e9`
/// (Base priced in USD/Quote @ 1e9) and the coin-decimal factor:
///   value = coll_base_minor * price / PRICE_SCALE * 10^(quote_dec - base_dec)
/// base_dec >= quote_dec => divide; else multiply. Single floor (conservative —
/// rounds collateral value DOWN, i.e. stricter LTV).
public fun collateral_value_in_quote(
    coll_base_minor: u64,
    pyth_px_1e9: u128,
    base_dec: u8,
    quote_dec: u8,
): u128 {
    if (base_dec >= quote_dec) {
        std::u128::mul_div(
            coll_base_minor as u128,
            pyth_px_1e9,
            constants::price_scale() * std::u128::pow(10, base_dec - quote_dec),
        )
    } else {
        std::u128::mul_div(
            (coll_base_minor as u128) * std::u128::pow(10, quote_dec - base_dec),
            pyth_px_1e9,
            constants::price_scale(),
        )
    }
}

fun emit_action<Quote, Base>(vault: &DemoVault<Quote, Base>, action: u8, amount: u128, clock: &Clock) {
    event::emit(VaultAction {
        vault_id: object::id(vault),
        action,
        amount,
        debt_after: vault.debt_quote_minor,
        collateral_after: balance::value(&vault.collateral),
        ts_ms: clock.timestamp_ms(),
    });
}

// ── read surface ─────────────────────────────────────────────────────────────

public fun debt<Quote, Base>(vault: &DemoVault<Quote, Base>): u128 { vault.debt_quote_minor }

public fun collateral<Quote, Base>(vault: &DemoVault<Quote, Base>): u64 {
    balance::value(&vault.collateral)
}

public fun policy_id<Quote, Base>(vault: &DemoVault<Quote, Base>): ID { vault.policy_id }

// ── test-only: drive the enforce half without &Pool/&PriceInfoObject ─────────

#[test_only]
public fun new_vault_with_collateral_for_testing<Quote, Base>(
    policy: &GuardianPolicy,
    coll: Balance<Base>,
    ctx: &mut TxContext,
): DemoVault<Quote, Base> {
    DemoVault<Quote, Base> {
        id: object::new(ctx),
        policy_id: object::id(policy),
        collateral: coll,
        debt_quote_minor: 0,
    }
}

/// Mirrors `borrow` exactly EXCEPT the poke (caller supplies the DivResult, and
/// the policy's is_paused/current state is set via guardian::apply_for_testing).
#[test_only]
public fun borrow_with_div_for_testing<Quote, Base>(
    vault: &mut DemoVault<Quote, Base>,
    policy: &GuardianPolicy,
    d: DivResult,
    amount_quote_minor: u128,
) {
    assert!(object::id(policy) == vault.policy_id, EPolicyMismatch);
    let new_debt = vault.debt_quote_minor + amount_quote_minor;
    enforce_solvency(policy, &d, new_debt, balance::value(&vault.collateral));
    vault.debt_quote_minor = new_debt;
}

#[test_only]
public fun withdraw_collateral_with_div_for_testing<Quote, Base>(
    vault: &mut DemoVault<Quote, Base>,
    policy: &GuardianPolicy,
    d: DivResult,
    amount_base_minor: u64,
    ctx: &mut TxContext,
): Coin<Base> {
    assert!(object::id(policy) == vault.policy_id, EPolicyMismatch);
    let remaining = balance::value(&vault.collateral) - amount_base_minor;
    enforce_solvency(policy, &d, vault.debt_quote_minor, remaining);
    coin::from_balance(balance::split(&mut vault.collateral, amount_base_minor), ctx)
}
