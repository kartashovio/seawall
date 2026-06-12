/// Single on-chain mirror of the Constants table (BUILD_PLAN.md). Every value
/// here is also pinned in TS at `@seawall/shared` (constants.ts) and bound by the
/// parity tests — gauge bands, agent thresholds, and this module must never drift.
///
/// These are exposed as `public fun` getters (not bare `const`) so other guardian
/// modules and the cross-package callers import the SYMBOL, never a literal.
///
/// Units recap:
///   *_bps          : basis points, u16 (percent * 100); corridor for max_ltv / borrow_cap
///   PRICE_SCALE     : u128 1e9 fixed-point == DeepBook FLOAT_SCALING
///   D_CAUTION/T_*   : u128 fraction @ 1e9 (1e7 = 1.0%)
///   *_MS            : milliseconds (u64)
///   *_secs          : seconds (u64)
///   *_DECIMALS      : coin decimals (u8) — SUI=9 / DBUSDC=6, must-fix #7
module guardian::constants;

// --- parameter corridors (bps, u16) — DAO/consumer-set on-chain ---
const MAX_LTV_FLOOR_BPS: u16 = 5500;       // 55%
const MAX_LTV_BASELINE_BPS: u16 = 7500;    // 75%
const BORROW_CAP_FLOOR_BPS: u16 = 4000;    // 40%
const BORROW_CAP_BASELINE_BPS: u16 = 10000; // 100%

// --- fixed-point divergence scale (u128 @ 1e9) ---
const PRICE_SCALE: u128 = 1_000_000_000;   // == DeepBook FLOAT_SCALING

// --- divergence thresholds (u128 fraction @ 1e9) ---
const D_CAUTION: u128 = 10_000_000;        // 1.0% — L2 CAUTION onset / RELAX gate
const T_FREEZE: u128 = 50_000_000;         // 5.0% — L3 contract-only FREEZE (must be > D_CAUTION)
const CONF_FRAC_MAX: u128 = 10_000_000;    // 1.0% — oracle-health / loss-of-signal gate

// --- oracle + book read params ---
const MAX_AGE_SECS: u64 = 60;              // Pyth get_price_no_older_than (must-fix #7, SECONDS)
const TICKS: u64 = 1;                      // get_level2_ticks_from_mid(1, clock); either side empty => BOOK_NOT_OK => freeze

// --- cadences (ms, u64) ---
const KEEPER_TICK_MS: u64 = 300_000;       // 5 min keeper loop
const AGENT_HEARTBEAT_MS: u64 = 300_000;   // 5 min agent heartbeat
const RELAX_COOLDOWN_MS: u64 = 600_000;    // 10 min min gap between relax steps
const ALL_CLEAR_WINDOW_MS: u64 = 600_000;  // 10 min quiet span before relax begins

// --- relax step: FRACTION of each corridor's span, in bps (10000 = 100%) ---
// DECIDED 2026-06-12 (%-of-span, matches "~10%/10min"). apply_ computes per param:
//   step_bps = mul_div(baseline_bps - floor_bps, RELAX_STEP_FRAC_BPS, BPS_DENOM)
//   => max_ltv 200 bps/step, borrow_cap 600 bps/step (both reopen in ~10 steps).
const RELAX_STEP_FRAC_BPS: u16 = 1000;

// --- coin decimals (u8) — SUI / DBUSDC (must-fix #7) ---
// Coin-decimal factor (SIGN-CORRECTED): base >= quote => scale a DeepBook level2
// price by 10^(BASE_DECIMALS - QUOTE_DECIMALS) = 10^3 = 1000 to match Pyth I64+expo.
const BASE_DECIMALS: u8 = 9;
const QUOTE_DECIMALS: u8 = 6;

// --- LTV math denominator (u16) ---
const BPS_DENOM: u16 = 10_000;

// --- score bands (u8) — gauge + score->param dead-band/floor ---
const SCORE_LO: u8 = 60;
const SCORE_HI: u8 = 95;
const ALERT_SCORE: u8 = 99;                // measurement marker, NOT the send gate
const SUBMIT_SCORE: u8 = 99;               // agent anti-spam throttle

// --- book-signal tags (u8) ---
const SIGNAL_NORMAL: u8 = 0;
const SIGNAL_BOOK_NOT_OK: u8 = 1;          // empty/one-sided book => freeze (D1)

public fun max_ltv_floor_bps(): u16 { MAX_LTV_FLOOR_BPS }
public fun max_ltv_baseline_bps(): u16 { MAX_LTV_BASELINE_BPS }
public fun borrow_cap_floor_bps(): u16 { BORROW_CAP_FLOOR_BPS }
public fun borrow_cap_baseline_bps(): u16 { BORROW_CAP_BASELINE_BPS }
public fun price_scale(): u128 { PRICE_SCALE }
public fun d_caution(): u128 { D_CAUTION }
public fun t_freeze(): u128 { T_FREEZE }
public fun conf_frac_max(): u128 { CONF_FRAC_MAX }
public fun max_age_secs(): u64 { MAX_AGE_SECS }
public fun ticks(): u64 { TICKS }
public fun keeper_tick_ms(): u64 { KEEPER_TICK_MS }
public fun agent_heartbeat_ms(): u64 { AGENT_HEARTBEAT_MS }
public fun relax_cooldown_ms(): u64 { RELAX_COOLDOWN_MS }
public fun all_clear_window_ms(): u64 { ALL_CLEAR_WINDOW_MS }
public fun relax_step_frac_bps(): u16 { RELAX_STEP_FRAC_BPS }
public fun base_decimals(): u8 { BASE_DECIMALS }
public fun quote_decimals(): u8 { QUOTE_DECIMALS }
public fun bps_denom(): u16 { BPS_DENOM }
public fun score_lo(): u8 { SCORE_LO }
public fun score_hi(): u8 { SCORE_HI }
public fun alert_score(): u8 { ALERT_SCORE }
public fun submit_score(): u8 { SUBMIT_SCORE }
public fun signal_normal(): u8 { SIGNAL_NORMAL }
public fun signal_book_not_ok(): u8 { SIGNAL_BOOK_NOT_OK }
