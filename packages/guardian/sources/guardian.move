/// The on-chain half of Seawall: a per-protocol `GuardianPolicy` (shared) that
/// re-derives the Pyth↔DeepBook breach ITSELF on every path and is the sole
/// executor of harm-moves. The off-chain agent is untrusted by construction:
///
///   * `submit` (sender-gated to the registered agent) carries a `ParamRequest`
///     + an advisory score; `poke` (permissionless — keeper AND the vault's
///     inline floor, D5) carries nothing. BOTH delegate to the single `apply_`
///     (D2) — there is no second code path to drift.
///   * L3 FREEZE is contract-ONLY (D1): own measured `div >= threshold_t` OR a
///     structurally unusable book (`BOOK_NOT_OK`). The agent has NO input; the
///     advisory score appears ONLY inside an event emit.
///   * L2 CAUTION: `applied = tighter_of(clamp(agent), clamp(own_tier))` per
///     param — instant tighten (one-way ratchet), clamp-and-log NEVER abort
///     (must-fix #3); a looser ask is rejected.
///   * RELAX is the contract's OWN gated drip: full all-clear window since the
///     last breach + cooldown since the last step + a fresh calm reading,
///     %-of-span steps, capped at baseline, never while frozen — agent silence
///     or agent asks grant nothing (fail-CLOSED).
///   * Only the separate OWNED `GovernanceCap` (must-fix #2: never embedded in
///     the shared object) unfreezes or loosens corridors — the only road
///     toward riskier.
module guardian::guardian;

use deepbook::pool::Pool;
use guardian::constants;
use guardian::divergence::{Self, DivResult};
use pyth::price_info::PriceInfoObject;
use sui::clock::Clock;
use sui::event;

// ── errors ────────────────────────────────────────────────────────────────

/// `submit` sender is not the policy's registered agent.
const ENotRegisteredAgent: u64 = 1;
/// The `GovernanceCap` belongs to a different policy.
const EWrongGovernanceCap: u64 = 2;
/// Corridor must satisfy floor <= baseline <= BPS_DENOM.
const EInvalidCorridor: u64 = 3;
/// Thresholds must satisfy 0 < d_caution < threshold_t, max_age_secs > 0.
const EInvalidThresholds: u64 = 4;
/// feed_id must be the 32 RAW bytes of the Pyth price identifier (not hex text).
const EBadFeedId: u64 = 5;
/// relax_step_frac_bps must be in (0, BPS_DENOM] AND yield a >=1 bps step for
/// every non-degenerate corridor span (else RELAX would silently never progress).
const EInvalidRelaxStep: u64 = 6;
/// coin decimals out of the supported envelope (<= constants::max-decimals) —
/// outside it the divergence pow/mul could overflow on-chain where the TS
/// reference would not, breaking parity.
const EInvalidDecimals: u64 = 7;

// ── event tags ────────────────────────────────────────────────────────────

const PARAM_MAX_LTV: u8 = 0;
const PARAM_BORROW_CAP: u8 = 1;
const FREEZE_CAUSE_DIVERGENCE: u8 = 0;
const FREEZE_CAUSE_BOOK_NOT_OK: u8 = 1;

/// Supported coin-decimal envelope. Real Sui coins are <= 18dp; within this
/// bound the divergence pow(10,|base-quote|)/mul stays well inside u128, so the
/// Move math never aborts where the TS reference returns (parity, must-fix #7).
const MAX_COIN_DECIMALS: u8 = 18;

// ── capabilities & structs ────────────────────────────────────────────────

/// Scoped caps the policy itself holds over its consumer vault (safe to embed
/// in the shared object — must-fix #2; only the human-override cap must live
/// outside). Functionally exercised by the vault in Step 3.
public struct PauseCap has store {}

public struct ParamCap has store {}

/// The DAO/owner override — a separate OWNED object, passed `&GovernanceCap`
/// as the 2nd parameter of every governance fn. The agent physically cannot
/// hold or reach it through the shared policy.
public struct GovernanceCap has key, store {
    id: UID,
    policy_id: ID,
}

/// What the agent asks for. Targets only — the contract clamps direction and
/// magnitude; the ML score->param map lives entirely off-chain (must-fix #3).
public struct ParamRequest has copy, drop {
    max_ltv_target_bps: u16,
    borrow_cap_target_bps: u16,
}

/// One guardian instance: per-protocol state + DAO-set corridor + bookkeeping.
/// "One code, many states" — the package is published once; every consumer
/// protocol shares its own `GuardianPolicy` (no registry, no fan-out).
public struct GuardianPolicy has key {
    id: UID,
    owner: address,
    /// `submit` sender-gate (anti-spam; the clamp still bounds any payload).
    registered_agent: address,
    /// 32 RAW bytes of the Pyth price identifier; asserted on EVERY read.
    feed_id: vector<u8>,
    /// The ONE canonical DeepBook pool this policy re-derives divergence from.
    /// Asserted on EVERY read (divergence::read_divergence) so neither the
    /// permissionless `poke` caller nor the agent can substitute a junk book —
    /// the contract always reads its OWN source. Pins the concrete typed pool.
    expected_pool_id: ID,
    // corridor: floor (tightest) <= current <= baseline (loosest); floor and
    // baseline are DAO-set ON-CHAIN state the agent can never touch — without
    // this corridor "bounded / only-push-safer" would be meaningless.
    max_ltv_floor_bps: u16,
    max_ltv_baseline_bps: u16,
    max_ltv_current_bps: u16,
    borrow_cap_floor_bps: u16,
    borrow_cap_baseline_bps: u16,
    borrow_cap_current_bps: u16,
    // own-read thresholds (fractions @ 1e9)
    threshold_t: u128,
    d_caution: u128,
    conf_frac_max: u128,
    max_age_secs: u64,
    base_decimals: u8,
    quote_decimals: u8,
    // L3 state
    paused: bool,
    // relax gating state (D3): both windows enforced on-chain
    last_breach_ms: u64,
    last_relax_ms: u64,
    all_clear_window_ms: u64,
    relax_cooldown_ms: u64,
    /// One drip step = this fraction of each param's span (1e4 = 100%).
    relax_step_frac_bps: u16,
    // liveness bookkeeping (D4)
    last_check_ms: u64,
    last_change_ms: u64,
    epoch: u64,
    pause_cap: PauseCap,
    param_cap: ParamCap,
}

// ── events ────────────────────────────────────────────────────────────────

public struct PolicyCreated has copy, drop {
    policy_id: ID,
    owner: address,
    registered_agent: address,
    ts_ms: u64,
}

/// Emitted on EVERY `apply_` (heartbeat). `advisory_score` is display-only —
/// this emit is the ONLY place it ever appears (grep-gate, must-fix #3).
public struct RiskEvaluated has copy, drop {
    policy_id: ID,
    had_request: bool,
    advisory_score: u8,
    div_own: u128,
    conf_frac: u128,
    signal: u8,
    paused: bool,
    max_ltv_current_bps: u16,
    borrow_cap_current_bps: u16,
    /// The effective agent term (the raw ask; == baseline on `poke`).
    max_ltv_requested_bps: u16,
    borrow_cap_requested_bps: u16,
    epoch: u64,
    ts_ms: u64,
}

/// The request was modified toward safety (out-of-corridor or the contract's
/// own target was tighter). param: 0 = max_ltv, 1 = borrow_cap.
public struct RequestClamped has copy, drop {
    policy_id: ID,
    param: u8,
    requested_bps: u16,
    applied_bps: u16,
    ts_ms: u64,
}

/// The request tried to LOOSEN — one-way ratchet refused it. The "malicious
/// agent refused" money shot on the dashboard.
public struct RequestRejected has copy, drop {
    policy_id: ID,
    param: u8,
    requested_bps: u16,
    applied_bps: u16,
    ts_ms: u64,
}

/// cause: 0 = own divergence >= T, 1 = book structurally unusable (D1).
public struct Frozen has copy, drop {
    policy_id: ID,
    div: u128,
    cause: u8,
    ts_ms: u64,
}

public struct Unfrozen has copy, drop {
    policy_id: ID,
    ts_ms: u64,
}

public struct CorridorChanged has copy, drop {
    policy_id: ID,
    max_ltv_floor_bps: u16,
    max_ltv_baseline_bps: u16,
    borrow_cap_floor_bps: u16,
    borrow_cap_baseline_bps: u16,
    ts_ms: u64,
}

public struct AgentRotated has copy, drop {
    policy_id: ID,
    old_agent: address,
    new_agent: address,
    ts_ms: u64,
}

// ── construction ──────────────────────────────────────────────────────────

public fun new_param_request(max_ltv_target_bps: u16, borrow_cap_target_bps: u16): ParamRequest {
    ParamRequest { max_ltv_target_bps, borrow_cap_target_bps }
}

/// Creates and SHARES a policy; returns the owned `GovernanceCap` to the
/// caller's PTB (transfer it explicitly — composable Sui pattern).
public fun create_policy(
    registered_agent: address,
    feed_id: vector<u8>,
    expected_pool_id: ID,
    max_ltv_floor_bps: u16,
    max_ltv_baseline_bps: u16,
    borrow_cap_floor_bps: u16,
    borrow_cap_baseline_bps: u16,
    threshold_t: u128,
    d_caution: u128,
    conf_frac_max: u128,
    max_age_secs: u64,
    base_decimals: u8,
    quote_decimals: u8,
    all_clear_window_ms: u64,
    relax_cooldown_ms: u64,
    relax_step_frac_bps: u16,
    clock: &Clock,
    ctx: &mut TxContext,
): GovernanceCap {
    let (policy, cap) = new_policy_(
        registered_agent, feed_id, expected_pool_id,
        max_ltv_floor_bps, max_ltv_baseline_bps,
        borrow_cap_floor_bps, borrow_cap_baseline_bps,
        threshold_t, d_caution, conf_frac_max, max_age_secs,
        base_decimals, quote_decimals,
        all_clear_window_ms, relax_cooldown_ms, relax_step_frac_bps,
        clock, ctx,
    );
    transfer::share_object(policy);
    cap
}

fun new_policy_(
    registered_agent: address,
    feed_id: vector<u8>,
    expected_pool_id: ID,
    max_ltv_floor_bps: u16,
    max_ltv_baseline_bps: u16,
    borrow_cap_floor_bps: u16,
    borrow_cap_baseline_bps: u16,
    threshold_t: u128,
    d_caution: u128,
    conf_frac_max: u128,
    max_age_secs: u64,
    base_decimals: u8,
    quote_decimals: u8,
    all_clear_window_ms: u64,
    relax_cooldown_ms: u64,
    relax_step_frac_bps: u16,
    clock: &Clock,
    ctx: &mut TxContext,
): (GuardianPolicy, GovernanceCap) {
    assert_corridor(max_ltv_floor_bps, max_ltv_baseline_bps);
    assert_corridor(borrow_cap_floor_bps, borrow_cap_baseline_bps);
    // thresholds are fractions @ 1e9; bound the top at 100% (price_scale) so the
    // tier arithmetic (`span * 2`) and any future fraction math stay well inside
    // u128 — a policy can never be created into an un-freezable/bricked state.
    assert!(
        d_caution > 0
            && threshold_t > d_caution
            && threshold_t <= constants::price_scale()
            && conf_frac_max > 0
            && conf_frac_max <= constants::price_scale()
            && max_age_secs > 0,
        EInvalidThresholds,
    );
    assert!(feed_id.length() == 32, EBadFeedId);
    assert!(
        base_decimals <= MAX_COIN_DECIMALS && quote_decimals <= MAX_COIN_DECIMALS,
        EInvalidDecimals,
    );
    // relax fraction in (0, 100%]; AND every non-degenerate corridor span must
    // yield a >= 1 bps step, else RELAX would floor to 0 and silently never
    // reopen the corridor.
    assert!(relax_step_frac_bps > 0 && relax_step_frac_bps <= constants::bps_denom(), EInvalidRelaxStep);
    assert!(
        relax_step_ok(max_ltv_floor_bps, max_ltv_baseline_bps, relax_step_frac_bps)
            && relax_step_ok(borrow_cap_floor_bps, borrow_cap_baseline_bps, relax_step_frac_bps),
        EInvalidRelaxStep,
    );

    let now = clock.timestamp_ms();
    let id = object::new(ctx);
    let policy_id = object::uid_to_inner(&id);
    let policy = GuardianPolicy {
        id,
        owner: ctx.sender(),
        registered_agent,
        feed_id,
        expected_pool_id,
        max_ltv_floor_bps,
        max_ltv_baseline_bps,
        max_ltv_current_bps: max_ltv_baseline_bps,
        borrow_cap_floor_bps,
        borrow_cap_baseline_bps,
        borrow_cap_current_bps: borrow_cap_baseline_bps,
        threshold_t,
        d_caution,
        conf_frac_max,
        max_age_secs,
        base_decimals,
        quote_decimals,
        paused: false,
        // no all-clear history exists before creation -> quiet window starts now
        last_breach_ms: now,
        last_relax_ms: now,
        all_clear_window_ms,
        relax_cooldown_ms,
        relax_step_frac_bps,
        last_check_ms: now,
        last_change_ms: now,
        epoch: 0,
        pause_cap: PauseCap {},
        param_cap: ParamCap {},
    };
    let cap = GovernanceCap { id: object::new(ctx), policy_id };
    event::emit(PolicyCreated {
        policy_id,
        owner: policy.owner,
        registered_agent,
        ts_ms: now,
    });
    (policy, cap)
}

// ── entries: TWO call modes, ONE apply_ (D2) ──────────────────────────────

/// Agent path: fresh same-PTB Pyth + a clamped param request + the advisory
/// score (event-only). Sender-gated to the registered agent.
public fun submit<Base, Quote>(
    policy: &mut GuardianPolicy,
    pio: &PriceInfoObject,
    pool: &Pool<Base, Quote>,
    clock: &Clock,
    req: ParamRequest,
    advisory_score: u8,
    ctx: &TxContext,
) {
    let d = read_div_(policy, pio, pool, clock);
    submit_impl(policy, &d, req, advisory_score, clock, ctx);
}

/// Permissionless params-less path — the keeper's tick AND the vault's inline
/// floor (D5) are byte-identical calls. Safe to expose because every write is
/// monotone-toward-safe; returns the reading so the vault can value collateral
/// with the SAME price (no second read, no TOCTOU).
public fun poke<Base, Quote>(
    policy: &mut GuardianPolicy,
    pio: &PriceInfoObject,
    pool: &Pool<Base, Quote>,
    clock: &Clock,
): DivResult {
    let d = read_div_(policy, pio, pool, clock);
    apply_(policy, &d, option::none(), 0, clock);
    d
}

fun read_div_<Base, Quote>(
    policy: &GuardianPolicy,
    pio: &PriceInfoObject,
    pool: &Pool<Base, Quote>,
    clock: &Clock,
): DivResult {
    divergence::read_divergence(
        pool, pio, clock,
        &policy.feed_id, policy.expected_pool_id, policy.max_age_secs,
        policy.base_decimals, policy.quote_decimals,
    )
}

fun submit_impl(
    policy: &mut GuardianPolicy,
    d: &DivResult,
    req: ParamRequest,
    advisory_score: u8,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == policy.registered_agent, ENotRegisteredAgent);
    apply_(policy, d, option::some(req), advisory_score, clock);
}

// ── the single state-transition function ──────────────────────────────────

fun apply_(
    policy: &mut GuardianPolicy,
    d: &DivResult,
    req: Option<ParamRequest>,
    advisory_score: u8,
    clock: &Clock,
) {
    let now = clock.timestamp_ms();
    let pid = object::id(policy);
    let div = divergence::div(d);
    let conf_frac = divergence::conf_frac(d);
    let signal = divergence::signal(d);
    let book_not_ok = signal == constants::signal_book_not_ok();
    let conf_breach = conf_frac > policy.conf_frac_max; // strict >: boundary is healthy
    let mut changed = false;

    // L3 FREEZE — contract-only (D1): the spec's two legs verbatim, derived
    // 100% from the contract's own reading. The agent has no role here.
    if (!policy.paused && (div >= policy.threshold_t || book_not_ok)) {
        policy.paused = true;
        changed = true;
        event::emit(Frozen {
            policy_id: pid,
            div,
            cause: if (book_not_ok) FREEZE_CAUSE_BOOK_NOT_OK else FREEZE_CAUSE_DIVERGENCE,
            ts_ms: now,
        });
    };

    // Contract-own tighten target (agent-independent coarse safety net):
    // deterministic monotone map severity -> param vector, discrete 3 tiers.
    let tier = own_tier(div, conf_breach, book_not_ok, policy.d_caution, policy.threshold_t);
    let c_ltv = tier_target(policy.max_ltv_floor_bps, policy.max_ltv_baseline_bps, tier);
    let c_cap = tier_target(policy.borrow_cap_floor_bps, policy.borrow_cap_baseline_bps, tier);

    // Agent term; None => baseline ("выполняем без него") so the params-less
    // path simply has no agent opinion — the contract's own target governs.
    let had_request = req.is_some();
    let (a_ltv, a_cap) = if (had_request) {
        let r = req.borrow();
        (r.max_ltv_target_bps, r.borrow_cap_target_bps)
    } else {
        (policy.max_ltv_baseline_bps, policy.borrow_cap_baseline_bps)
    };

    // ONE relax gate evaluated up-front for BOTH params — a per-param check
    // would let the first param's step reset the cooldown and starve the
    // second (order dependence). Requires: not frozen, full quiet window since
    // the last breach, cooldown since the last step, and a fresh calm reading.
    let relax_ok = !policy.paused
        && now - policy.last_breach_ms >= policy.all_clear_window_ms
        && now - policy.last_relax_ms >= policy.relax_cooldown_ms
        && div < policy.d_caution
        && !book_not_ok
        && !conf_breach;

    let before_ltv = policy.max_ltv_current_bps;
    let before_cap = policy.borrow_cap_current_bps;
    let (new_ltv, relaxed_ltv) = combine_param(
        before_ltv, policy.max_ltv_floor_bps, policy.max_ltv_baseline_bps,
        a_ltv, c_ltv, relax_ok, policy.relax_step_frac_bps,
    );
    let (new_cap, relaxed_cap) = combine_param(
        before_cap, policy.borrow_cap_floor_bps, policy.borrow_cap_baseline_bps,
        a_cap, c_cap, relax_ok, policy.relax_step_frac_bps,
    );
    if (new_ltv != before_ltv) {
        policy.max_ltv_current_bps = new_ltv;
        changed = true;
    };
    if (new_cap != before_cap) {
        policy.borrow_cap_current_bps = new_cap;
        changed = true;
    };
    if (relaxed_ltv || relaxed_cap) {
        policy.last_relax_ms = now;
    };

    // Clamp-and-log, never abort (must-fix #3): surface every modification of
    // an actual agent request.
    if (had_request) {
        emit_request_outcome(pid, PARAM_MAX_LTV, a_ltv, before_ltv, new_ltv, now);
        emit_request_outcome(pid, PARAM_BORROW_CAP, a_cap, before_cap, new_cap, now);
    };

    // Breach bookkeeping AFTER the relax gate (same-call safety is independent
    // of order: relax_ok already requires the CURRENT reading to be calm).
    if (div >= policy.d_caution || book_not_ok || conf_breach) {
        policy.last_breach_ms = now;
    };

    policy.last_check_ms = now; // ALWAYS — the liveness heartbeat (D4)
    if (changed) {
        policy.last_change_ms = now;
    };
    policy.epoch = policy.epoch + 1;

    event::emit(RiskEvaluated {
        policy_id: pid,
        had_request,
        advisory_score, // the ONLY use of the score anywhere in this package
        div_own: div,
        conf_frac,
        signal,
        paused: policy.paused,
        max_ltv_current_bps: policy.max_ltv_current_bps,
        borrow_cap_current_bps: policy.borrow_cap_current_bps,
        max_ltv_requested_bps: a_ltv,
        borrow_cap_requested_bps: a_cap,
        epoch: policy.epoch,
        ts_ms: now,
    });
}

/// Severity tiers over [d_caution, threshold_t): 1 covers the first third,
/// 2 the second, 3 the last third and beyond. Oracle-health breach (conf) is
/// at least tier 1; an unusable book maxes severity (it also froze in L3).
fun own_tier(div: u128, conf_breach: bool, book_not_ok: bool, d_caution: u128, threshold_t: u128): u8 {
    let span = threshold_t - d_caution;
    let mut tier: u8 = if (div >= d_caution + span * 2 / 3) {
        3
    } else if (div >= d_caution + span / 3) {
        2
    } else if (div >= d_caution) {
        1
    } else {
        0
    };
    if (book_not_ok) {
        tier = 3;
    } else if (conf_breach && tier < 1) {
        tier = 1;
    };
    tier
}

/// tier 0 -> baseline; tier 3 -> floor exactly; 1/2 -> thirds of the span.
fun tier_target(floor: u16, baseline: u16, tier: u8): u16 {
    let span = (baseline as u64) - (floor as u64);
    ((baseline as u64) - span * (tier as u64) / 3) as u16
}

fun clamp_u16(x: u16, lo: u16, hi: u16): u16 {
    std::u16::max(lo, std::u16::min(x, hi))
}

/// The per-param combine: `tighter_of(clamp(agent), clamp(own))` with instant
/// tighten and gated drip-relax. Returns (new_current, relax_step_taken).
fun combine_param(
    current: u16,
    floor: u16,
    baseline: u16,
    agent_raw: u16,
    contract_target: u16,
    relax_ok: bool,
    relax_step_frac_bps: u16,
): (u16, bool) {
    let a = clamp_u16(agent_raw, floor, baseline);
    let c = clamp_u16(contract_target, floor, baseline);
    let target = std::u16::min(a, c); // tighter_of (lower bps = safer)
    if (target < current) {
        // INSTANT tighten — the one-way ratchet's fast direction
        (target, false)
    } else if (target > current && relax_ok) {
        // gated drip toward baseline: one %-of-span step, never past target
        let span = (baseline as u64) - (floor as u64);
        let step = (span * (relax_step_frac_bps as u64) / (constants::bps_denom() as u64)) as u16;
        let next = std::u16::min(std::u16::min(current + step, target), baseline);
        (next, next != current)
    } else {
        (current, false)
    }
}

/// No event when the ask was honored verbatim. REJECTED when the RAW ask was
/// looser than the pre-call current (a one-way-ratchet refusal — true even when
/// current is already at baseline, where the clamped value would equal current
/// and hide the loosen attempt). CLAMPED otherwise (the ask was pulled toward
/// safety: below floor, or the contract's own target was tighter).
fun emit_request_outcome(pid: ID, param: u8, requested: u16, before: u16, applied: u16, now: u64) {
    if (requested == applied) return;
    if (requested > before) {
        event::emit(RequestRejected {
            policy_id: pid, param, requested_bps: requested, applied_bps: applied, ts_ms: now,
        });
    } else {
        event::emit(RequestClamped {
            policy_id: pid, param, requested_bps: requested, applied_bps: applied, ts_ms: now,
        });
    }
}

// ── governance (the ONLY road toward riskier; must-fix #2) ────────────────

fun assert_cap(policy: &GuardianPolicy, cap: &GovernanceCap) {
    assert!(cap.policy_id == object::id(policy), EWrongGovernanceCap);
}

fun assert_corridor(floor: u16, baseline: u16) {
    assert!(floor <= baseline && baseline <= constants::bps_denom(), EInvalidCorridor);
}

/// A drip step is acceptable iff the corridor is degenerate (nothing to relax)
/// OR the per-param step floors to at least 1 bps — same arithmetic as
/// `combine_param`, checked once at creation so RELAX can never silently stall.
fun relax_step_ok(floor: u16, baseline: u16, relax_step_frac_bps: u16): bool {
    let span = (baseline as u64) - (floor as u64);
    span == 0 || span * (relax_step_frac_bps as u64) / (constants::bps_denom() as u64) >= 1
}

/// The human override (ST1 must-have #4). Absolute: a persisting breach simply
/// re-freezes on the next evaluation. Stricter-than-spec: the quiet window
/// restarts at the unfreeze, so the corridor reopens gradually afterwards.
public fun governance_unfreeze(policy: &mut GuardianPolicy, cap: &GovernanceCap, clock: &Clock) {
    assert_cap(policy, cap);
    // True no-op when not paused: no phantom Unfrozen event in the action log,
    // and the relax quiet window is NOT disturbed (resetting last_breach_ms on a
    // no-op call would silently postpone a legitimate in-progress reopening).
    if (!policy.paused) return;
    let now = clock.timestamp_ms();
    policy.paused = false;
    policy.last_change_ms = now;
    // Stricter-than-spec: restart the quiet window at the unfreeze so the
    // corridor reopens gradually afterwards (only on a real unfreeze).
    policy.last_breach_ms = now;
    event::emit(Unfrozen { policy_id: object::id(policy), ts_ms: now });
}

/// DAO re-anchors the corridor; `current` is clamped into the new bounds
/// (this is deliberately the one place a param can move looser instantly —
/// by the cap owner, never the agent).
public fun governance_set_corridor(
    policy: &mut GuardianPolicy,
    cap: &GovernanceCap,
    max_ltv_floor_bps: u16,
    max_ltv_baseline_bps: u16,
    borrow_cap_floor_bps: u16,
    borrow_cap_baseline_bps: u16,
    clock: &Clock,
) {
    assert_cap(policy, cap);
    assert_corridor(max_ltv_floor_bps, max_ltv_baseline_bps);
    assert_corridor(borrow_cap_floor_bps, borrow_cap_baseline_bps);
    let now = clock.timestamp_ms();
    policy.max_ltv_floor_bps = max_ltv_floor_bps;
    policy.max_ltv_baseline_bps = max_ltv_baseline_bps;
    policy.max_ltv_current_bps =
        clamp_u16(policy.max_ltv_current_bps, max_ltv_floor_bps, max_ltv_baseline_bps);
    policy.borrow_cap_floor_bps = borrow_cap_floor_bps;
    policy.borrow_cap_baseline_bps = borrow_cap_baseline_bps;
    policy.borrow_cap_current_bps =
        clamp_u16(policy.borrow_cap_current_bps, borrow_cap_floor_bps, borrow_cap_baseline_bps);
    policy.last_change_ms = now;
    event::emit(CorridorChanged {
        policy_id: object::id(policy),
        max_ltv_floor_bps,
        max_ltv_baseline_bps,
        borrow_cap_floor_bps,
        borrow_cap_baseline_bps,
        ts_ms: now,
    });
}

public fun governance_rotate_agent(
    policy: &mut GuardianPolicy,
    cap: &GovernanceCap,
    new_agent: address,
    clock: &Clock,
) {
    assert_cap(policy, cap);
    let now = clock.timestamp_ms();
    let old_agent = policy.registered_agent;
    policy.registered_agent = new_agent;
    policy.last_change_ms = now;
    event::emit(AgentRotated {
        policy_id: object::id(policy),
        old_agent,
        new_agent,
        ts_ms: now,
    });
}

// ── read surface (Step-3 vault + dashboard bind to these) ─────────────────

public fun is_paused(policy: &GuardianPolicy): bool { policy.paused }

public fun max_ltv_current_bps(policy: &GuardianPolicy): u16 { policy.max_ltv_current_bps }

public fun borrow_cap_current_bps(policy: &GuardianPolicy): u16 { policy.borrow_cap_current_bps }

public fun max_ltv_floor_bps(policy: &GuardianPolicy): u16 { policy.max_ltv_floor_bps }

public fun max_ltv_baseline_bps(policy: &GuardianPolicy): u16 { policy.max_ltv_baseline_bps }

public fun borrow_cap_floor_bps(policy: &GuardianPolicy): u16 { policy.borrow_cap_floor_bps }

public fun borrow_cap_baseline_bps(policy: &GuardianPolicy): u16 { policy.borrow_cap_baseline_bps }

public fun registered_agent(policy: &GuardianPolicy): address { policy.registered_agent }

public fun owner(policy: &GuardianPolicy): address { policy.owner }

public fun feed_id(policy: &GuardianPolicy): vector<u8> { policy.feed_id }

public fun expected_pool_id(policy: &GuardianPolicy): ID { policy.expected_pool_id }

public fun max_age_secs(policy: &GuardianPolicy): u64 { policy.max_age_secs }

public fun conf_frac_max(policy: &GuardianPolicy): u128 { policy.conf_frac_max }

public fun threshold_t(policy: &GuardianPolicy): u128 { policy.threshold_t }

public fun d_caution(policy: &GuardianPolicy): u128 { policy.d_caution }

public fun last_check_ms(policy: &GuardianPolicy): u64 { policy.last_check_ms }

public fun last_change_ms(policy: &GuardianPolicy): u64 { policy.last_change_ms }

public fun last_breach_ms(policy: &GuardianPolicy): u64 { policy.last_breach_ms }

public fun last_relax_ms(policy: &GuardianPolicy): u64 { policy.last_relax_ms }

public fun epoch(policy: &GuardianPolicy): u64 { policy.epoch }

public fun governance_cap_policy_id(cap: &GovernanceCap): ID { cap.policy_id }

// ── test-only surface (unit tests cannot build &Pool / &PriceInfoObject) ──

#[test_only]
public fun new_policy_for_testing(
    registered_agent: address,
    feed_id: vector<u8>,
    expected_pool_id: ID,
    max_ltv_floor_bps: u16,
    max_ltv_baseline_bps: u16,
    borrow_cap_floor_bps: u16,
    borrow_cap_baseline_bps: u16,
    threshold_t: u128,
    d_caution: u128,
    conf_frac_max: u128,
    max_age_secs: u64,
    base_decimals: u8,
    quote_decimals: u8,
    all_clear_window_ms: u64,
    relax_cooldown_ms: u64,
    relax_step_frac_bps: u16,
    clock: &Clock,
    ctx: &mut TxContext,
): (GuardianPolicy, GovernanceCap) {
    new_policy_(
        registered_agent, feed_id, expected_pool_id,
        max_ltv_floor_bps, max_ltv_baseline_bps,
        borrow_cap_floor_bps, borrow_cap_baseline_bps,
        threshold_t, d_caution, conf_frac_max, max_age_secs,
        base_decimals, quote_decimals,
        all_clear_window_ms, relax_cooldown_ms, relax_step_frac_bps,
        clock, ctx,
    )
}

// Event-field getters (module-private fields → tests can't read them directly).
// These pin the EVENT PAYLOADS (Frozen.cause, Request* bps, RiskEvaluated
// fields) the dashboard + agent ratchet baseline bind to.
#[test_only]
public fun frozen_div(e: &Frozen): u128 { e.div }
#[test_only]
public fun frozen_cause(e: &Frozen): u8 { e.cause }
#[test_only]
public fun clamped_fields(e: &RequestClamped): (u8, u16, u16) {
    (e.param, e.requested_bps, e.applied_bps)
}
#[test_only]
public fun rejected_fields(e: &RequestRejected): (u8, u16, u16) {
    (e.param, e.requested_bps, e.applied_bps)
}
#[test_only]
public fun risk_evaluated_fields(e: &RiskEvaluated): (bool, u8, u128, u8, bool, u16, u16, u16, u16) {
    (
        e.had_request,
        e.advisory_score,
        e.div_own,
        e.signal,
        e.paused,
        e.max_ltv_current_bps,
        e.borrow_cap_current_bps,
        e.max_ltv_requested_bps,
        e.borrow_cap_requested_bps,
    )
}

#[test_only]
public fun apply_for_testing(
    policy: &mut GuardianPolicy,
    d: DivResult,
    req: Option<ParamRequest>,
    advisory_score: u8,
    clock: &Clock,
) {
    apply_(policy, &d, req, advisory_score, clock)
}

/// Exercises the REAL sender gate (same `submit_impl` as `submit`).
#[test_only]
public fun submit_for_testing(
    policy: &mut GuardianPolicy,
    d: DivResult,
    req: ParamRequest,
    advisory_score: u8,
    clock: &Clock,
    ctx: &TxContext,
) {
    submit_impl(policy, &d, req, advisory_score, clock, ctx)
}
