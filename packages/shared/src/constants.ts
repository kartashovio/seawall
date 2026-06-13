// Model and policy parameters, kept in one place — the SINGLE SOURCE OF TRUTH.
// The dashboard gauge bands, the agent thresholds, and the on-chain Move logic
// (`guardian::constants`) all read from here, so they can't drift apart. The
// on-chain block below is mirrored 1:1 in `guardian/sources/constants.move` and
// bound by `test/constants-parity.test.ts` + the Move `constants_test.move`.
//
// `[CHOSEN]` = a sane demo placeholder; recalibrate against the live book /
// backtest and update THIS TABLE ONLY.

// ───────────────────────── off-chain ML model (no on-chain twin) ─────────────

// EWMA smoothing for the running mean and covariance (RiskMetrics-style). 0.99
// is the SINGLE λ pair used in BOTH the live agent and the backtests/methodology
// (minor #11) — these are the constructor defaults; every Detector also passes
// them explicitly, so live and backtest are identical.
export const LAMBDA_MEAN = 0.99;
export const LAMBDA_COV = 0.99;

// Fixed ridge on the covariance so the Cholesky stays positive-definite.
export const SHRINKAGE = 0.15;
export const EPS = 1e-9;

// Score -> parameter mapping. Score is 0-100. Below SCORE_LO we don't tighten at
// all (dead-band so noise doesn't thrash the params); at/above SCORE_HI the
// params sit at their floor. In between it's a logistic.
export const SCORE_LO = 60;
export const SCORE_MID = 80;
export const SCORE_HI = 95;
export const LOGISTIC_GAMMA = 0.15;

// Measurement marker (score >= ALERT_SCORE for two ticks) used to time detection
// in backtests — NOT the send gate. SUBMIT_SCORE is the agent's anti-spam
// throttle on top of the tighten-or-heartbeat send condition (NOT the condition).
export const ALERT_SCORE = 99;
export const SUBMIT_SCORE = 99;

// @deprecated — superseded by ALERT_SCORE; retained so nothing silently breaks.
export const TAU = 90;

// Parameter corridors as [floor, baseline] in PERCENT (what the ML reads). The
// DAO / consuming protocol sets these on-chain; the agent can only move "current"
// toward the floor, never past the baseline.
export const MAX_LTV = { floor: 55, baseline: 75 } as const;
export const BORROW_CAP = { floor: 40, baseline: 100 } as const;

// ───────────────────────── on-chain mirror (guardian::constants) ─────────────
// Every symbol below has a Move getter of the same value. Keep them in lockstep.

// Corridors in basis points (u16) = percent * 100 — the on-chain representation.
export const MAX_LTV_BPS = { floor: 5500, baseline: 7500 } as const;
export const BORROW_CAP_BPS = { floor: 4000, baseline: 10000 } as const;

// Fixed-point divergence scale (u128 @ 1e9) == DeepBook FLOAT_SCALING.
export const PRICE_SCALE = 1_000_000_000n;

// Divergence thresholds as 1e9 fractions (1e7 = 1.0%).
export const D_CAUTION = 10_000_000n; //  1.0% — L2 CAUTION onset / RELAX gate     [CHOSEN]
export const T_FREEZE = 50_000_000n; //   5.0% — L3 contract-only FREEZE (> D_CAUTION)
export const CONF_FRAC_MAX = 10_000_000n; // 1.0% — oracle-health / loss-of-signal [CHOSEN]

// Oracle + book read params.
export const MAX_AGE_SECS = 60; // Pyth get_price_no_older_than, SECONDS (must-fix #7)
export const TICKS = 1; //          get_level2_ticks_from_mid(1, clock)

// Max Pyth expo magnitude accepted by compute_divergence. Real feeds sit at
// ~|8|; this is the safety bound used in BOTH the TS and Move math so they
// abort IDENTICALLY on an absurd expo (Move would otherwise silently truncate
// `expo_mag as u8` and overflow pow(10, >=39)). Parity-critical -> on the table.
export const MAX_EXPO_MAG = 18;

// Cadences (ms).
export const KEEPER_TICK_MS = 300_000; //     5 min keeper loop
export const AGENT_HEARTBEAT_MS = 300_000; // 5 min agent heartbeat
// Off-chain agent cadences (no on-chain twin). The DETECTOR advances on a 60s
// grid (matches the 1-min warmup/calibration history so EWMA + velocity carry
// over); the agent may POLL sources faster for SSE liveness. RESUBMIT_COOLDOWN
// throttles back-to-back tighten submits (anti-spam on the tighter condition,
// NOT the send condition itself).
export const AGENT_GRID_MS = 60_000; //       1 min detector grid (== warmup bar)
export const RESUBMIT_COOLDOWN_MS = 60_000; // min gap between tighten submits
export const RELAX_COOLDOWN_MS = 600_000; //  10 min min gap between relax steps (on-chain)
export const ALL_CLEAR_WINDOW_MS = 600_000; // 10 min quiet span before relax begins

// One drip step toward baseline = a FRACTION of each corridor's span, in bps
// (10000 = 100%). DECIDED 2026-06-12: per-corridor %-of-span, matching the
// architecture's "~10%/10min" — NOT a flat absolute step (which would reopen
// max_ltv in 2 steps but borrow_cap in 6). Step 1 apply_ computes per param:
//   step_bps = mul_div(baseline_bps - floor_bps, RELAX_STEP_FRAC_BPS, BPS_DENOM)
//   => max_ltv: 10% of 2000 = 200 bps ; borrow_cap: 10% of 6000 = 600 bps
// so both fully reopen in ~10 steps of 10 min. [CHOSEN fraction]
export const RELAX_STEP_FRAC_BPS = 1000; // 10.00% of span

// Coin decimals (SUI / DBUSDC). Coin-decimal factor (must-fix #7, SIGN-CORRECTED):
// since BASE_DECIMALS >= QUOTE_DECIMALS, a DeepBook level2 price is scaled by
// 10^(BASE_DECIMALS - QUOTE_DECIMALS) = 10^3 = 1000 to match Pyth's I64+expo.
// The V0/V1 parity vectors (dbk_1e9 == 764_000_000) are the binding test (Step 2).
export const BASE_DECIMALS = 9;
export const QUOTE_DECIMALS = 6;

// LTV math denominator.
export const BPS_DENOM = 10_000;

// Book-signal tags.
export const SIGNAL_NORMAL = 0;
export const SIGNAL_BOOK_NOT_OK = 1; // empty/one-sided book => freeze (D1)
