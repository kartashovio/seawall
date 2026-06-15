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
4. **Score = the χ²(k) CDF of d² with a calm dead-zone** (live + mainnet observatory).
   d² is referred to its null distribution χ²(k); the bottom 90% (the calm body) maps
   to **0**, and the score lifts only into the χ²(k) tail — so a calm market reads ~0
   **by construction**, self-calibrating off the EWMA-adaptive covariance with **no
   frozen reference to rot**. Heavy tails are handled not by a fitted reference but by
   (a) the adaptive cov absorbing the calm bulk and (b) the dead-zone reading only the
   tail — validated by the measured **~1% single-tick calm false-alarm** rate. 0–100.
   The **backtest** instead maps d² to its empirical percentile within each episode's
   own calm window (a fresh per-replay reference); the two agree at the tail, where
   χ²-score ≥ 90 ⇔ percentile ≥ 99, so the published lead times below are unchanged.
   The dashboard gauge shows the live score; `99` is a *measurement marker*, not the
   send gate.
5. **Two axes, two knobs.** solvency `{div,divvel}` → `max_ltv`; liquidity
   `{disp,volvel,mktvol}` → `borrow_cap`. A de-peg (mispriced, not crashing) moves
   only `max_ltv`; a violent crash moves both. `liq_buffer` is deliberately NOT a
   knob (retroactive → DAO-only).

The **joint-anomaly** property is the point: the model trips when things that
normally agree start disagreeing, *even if every single feature is sub-threshold*
on its own (the dashboard's Scene-2 beat).

## Measured results (backtest, free/keyless data, 1-min)

Five real crashes replayed minute-by-minute (target collateral, BTC as the market
proxy), plus calm windows as false-alarm checks. **One reproducible metric** (run
`npx tsx src/backtest.ts all`): the *confirmed alarm* = the calibrated score in the
top **1%** of that episode's calm window (`≥99`) for **two consecutive ticks**, timed
against an INDEPENDENTLY-measured −5% / 30-min price drawdown.

| Event | Shape | Confirmed-alarm lead (`≥99`, 2-tick) | Driver | Calm FP (single-tick) |
|---|---|---|---|---|
| Oct 10 2025 — SUI liquidation cascade | systemic, fast | −17 min (coincident) | liquidity (disp 91%) | 0.98% |
| Aug 5 2024 — yen-carry unwind | systemic, fast | −3 min (coincident) | liquidity (disp 69%) | 1.00% |
| Feb 2–3 2025 — tariff selloff | macro slow-drift | **+320 min (5.3 h early)** | solvency (divvel 57%) | 1.00% |
| Mar 11 2023 — USDC de-peg / SVB | depeg slow-drift | **+379 min (6.3 h early)** | solvency (div 55%) | 1.01% |
| May 22 2025 — Cetus exploit (SUI) | idiosyncratic, fast | −1 min (coincident) | solvency (div 73%) | 1.04% |

**Early vs coincident — and why (stated honestly).** The two **slow-drift** events
fire **hours before** the visible crash: divergence/dispersion build while price is
still calm. The three **fast** crashes are **coincident** — a violent simultaneous
move gives no informational head-start (price falls as fast as the features), so the
alarm lands *with* the drop. We report the negative leads as-is rather than switch to
a softer threshold to manufacture a positive number: the graded-CAUTION parameter
*does* reach floor earlier still (the score crosses the `≥95` tighten band first —
e.g. +90 min on the cascade), but that band also exceeds ~5% in calm — acceptable for
a **bounded, reversible** CAUTION nudge, **not** a figure to headline. The hard alarm
is the `≥99` / 2-tick column above, held to ~1% calm false-alarm.

**Driver discrimination (the measured payoff).** The SAME model routes the response
by *what* broke: **systemic** crashes (Oct, Aug — SUI falls with BTC) are
liquidity/dispersion-led → `borrow_cap`; **idiosyncratic / de-peg** events (Feb, USDC,
Cetus — the asset breaks while BTC is calm, `mktvol`≈0) are divergence-led → `max_ltv`.
The cleanest split is USDC (a mispricing, not a crash): `max_ltv` to floor while
`borrow_cap` **held at baseline**. Cetus (SUI −11.6% on the exploit, BTC +0.09%) is the
SUI-native showcase — both params floor under the violent dump, but the driver is
unmistakably solvency (div **73%**, the strongest of all five).

**Measured error rate:** ~**1% single-tick** calm false-alarm by construction
(`ALERT_PCT=99`); the 2-tick debounce removes most. Honest dents: the USDC calm
window's 10 sustained episodes overlap the real early-SVB instability (arguably early
true detections — left intact, not trimmed to flatter the number); and **Cetus earns
its place on discrimination, not magnitude** — its raw d² is modest (the dump hit the
Cetus DEX, not the CEX basis/dispersion we measure) and its lead is coincident, so we
pitch it as the correct-knob-routing proof, not a heroic catch. The hours-ahead
early-warning claim rests on the two slow-drift events (n=2).

## Honest lines

- **No free historical order-book depth exists.** Backtests use divergence +
  volatility on free kline/Pyth history; the `imb`/`spread` depth features are
  **live-only**, demoed with an honest caveat.
- **Backtest divergence vs live divergence.** Backtests proxy `div` with
  perp-last-vs-index / oracle-vs-CEX-median (what's historically available); **live,
  `div` keys on Pyth↔DeepBook** — the exact signal the contract re-derives on-chain.
- **Live warm-up + testnet caveat.** After a (re)start the model needs **~45 min** of
  continuous live operation to warm up — MEASURED on the prod journal as ~31 min
  filling the velocity window (score reads 0, no false alarm) then a few minutes for
  the EWMA covariance to re-center on the live Pyth↔DeepBook domain. The dashboard
  surfaces a *calibrating/calibrated* badge and the agent **withholds autonomous
  tightening until warm** (a cold-start transient must not ratchet params; scripted
  scenes bypass it). Once warm, the deep **mainnet** pool reads calm (score ~0 at
  ~1–3 bps divergence — verified live); testnet's thin DBUSDC pool sits ~0.3–0.5% off
  Pyth (a real, persistent oracle↔CLOB offset the agent *correctly* flags), so its
  live calm score stays jumpy by nature. The model logic (ratchet/gate/clamp) is
  unaffected. The demo's dramatic beats are scene-injected.
- **The LLM is an explainer only** — human-readable rationale, never on the
  tx/decision path.
- **Scope:** the oracle/price-anomaly class only — not key/governance compromise,
  logic bugs, or credit quality.

Run the backtests: `pnpm backtest` (harness `packages/agent/src/backtest-lib.ts`,
events `packages/agent/src/events.ts`).
