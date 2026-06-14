# METHODOLOGY — the AI risk model (judge-facing summary)

This is the must-have-#2 deliverable: what the score is, how it's computed, what
it was tested on, and where we draw honest lines. The deep write-ups are
[`ml-methodology.md`](./ml-methodology.md) (full model) and
[`ml-backtest.md`](./ml-backtest.md) (every backtest, every caveat).

## What it is — and the prior art, owned

A streaming, **unsupervised** multivariate anomaly detector. Each tick it asks one
question over a feature *vector*: how unlikely is the whole current picture vs
recent normal — not each number alone, but their joint configuration.

The estimator is **named prior art; we do not claim to have invented it:**

- **Squared Mahalanobis distance over financial features = the Kritzman-Li
  Financial Turbulence Index** (2010).
- **EWMA mean + covariance = RiskMetrics** (J.P. Morgan, 1996).

**Our novelty is the application + the enforcement, not the estimator:** using the
**oracle↔CLOB (Pyth↔DeepBook) divergence** as a real-time circuit-breaker signal,
and enforcing it **trust-minimized on-chain** (the contract re-derives the breach
itself; the agent can only push safer). The score is *advice*; the Move contract
has the final say and never trusts the number.

## How the score is computed (glass-box)

1. **Features (unit-free, ~stationary)** — `div` (oracle vs market divergence, bps),
   `divvel` (its velocity), `disp` (cross-venue dispersion), `volvel` (token
   realized-vol velocity), `mktvol` (BTC vol velocity). Live adds order-book
   `imb`/`spread`. Formulas in `ml-methodology.md`.
2. **EWMA mean + covariance** (λ = 0.99 on 1-min bars ≈ 100-min memory), **shrinkage**
   ridge to stay invertible.
3. **d² = (x−μ)ᵀ Σ⁻¹ (x−μ)** via Cholesky; the per-feature contributions `xᵢ·(Σ⁻¹(x−μ))ᵢ`
   sum to d² exactly — that's the dashboard's contribution bars (you can see *which*
   feature drove the score).
4. **Score = empirical percentile of d² vs a recent calm window** (χ²(k) is the
   nominal reference; real features are heavy-tailed, so we calibrate to calm
   percentiles). 0–100. The dashboard gauge shows this; `99` is a *measurement
   marker*, not the send gate.
5. **Two axes, two knobs.** solvency `{div,divvel}` → `max_ltv`; liquidity
   `{disp,volvel,mktvol}` → `borrow_cap`. A de-peg (mispriced, not crashing) moves
   only `max_ltv`; a violent crash moves both. `liq_buffer` is deliberately NOT a
   knob (retroactive → DAO-only).

The **joint-anomaly** property is the point: the model trips when things that
normally agree start disagreeing, *even if every single feature is sub-threshold*
on its own (the dashboard's Scene-2 beat).

## Measured results (backtest, free/keyless data, 1-min)

Four real crashes replayed minute-by-minute (SUI collateral, BTC as market proxy),
plus calm windows as false-alarm checks. **In all four, the driving knob floored
*before* the visible price drop:**

| Event | Lead (driving knob floored vs −5% bar) | Driver | Calm FP (single-tick) |
|---|---|---|---|
| Oct 10 2025 — SUI liquidation cascade | ~90 min ahead (`borrow_cap`) | liquidity (disp 91%) | 0.98% |
| Aug 5 2024 — yen carry unwind | ~49 min ahead (`borrow_cap`) | liquidity (disp 69%, BTC ~3.6× calm) | 1.00% |
| Feb 2–3 2025 — tariff selloff | ~5.3 h ahead (`max_ltv`) | solvency (divvel 57%) | 1.00% |
| Mar 11 2023 — USDC de-peg (post-SVB) | ~7.5 h ahead (`max_ltv` only; `borrow_cap` held at baseline) | solvency (div 55%) | 1.01% |

**Measured error rate:** the calibrator is tuned to a **~1% single-tick false-alarm
rate** on calm windows; a 2-tick debounce removes most of those. Honest dents are
reported in `ml-backtest.md` (e.g. the stricter "99-for-2-ticks" alert lands *at*
the two vertical flash crashes, not ahead — the protective *parameters* were
already floored; and the USDC calm window's 10 sustained episodes overlap the real
early-SVB instability and are arguably early true detections — we left the window
intact rather than trim to flatter the number).

## Honest lines

- **No free historical order-book depth exists.** Backtests use divergence +
  volatility on free kline/Pyth history; the `imb`/`spread` depth features are
  **live-only**, demoed with an honest caveat.
- **Backtest divergence vs live divergence.** Backtests proxy `div` with
  perp-last-vs-index / oracle-vs-CEX-median (what's historically available); **live,
  `div` keys on Pyth↔DeepBook** — the exact signal the contract re-derives on-chain.
- **Live calibration caveat (testnet).** The warmup calm baseline is primed on
  cross-venue history; testnet's thin DBUSDC pool sits ~0.3–0.5% off Pyth (a real,
  persistent oracle↔CLOB offset the agent *correctly* flags), so the live calm score
  reads hot on testnet. The model logic (ratchet/gate/clamp) is unaffected; on a deep
  mainnet pool the calm score sits low. The demo's dramatic beats are scene-injected.
- **The LLM is an explainer only** — human-readable rationale, never on the
  tx/decision path.
- **Scope:** the oracle/price-anomaly class only — not key/governance compromise,
  logic bugs, or credit quality.

Run the backtests: `pnpm backtest` (harness `packages/agent/src/backtest-lib.ts`,
events `packages/agent/src/events.ts`).
