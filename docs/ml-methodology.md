# ML methodology

The off-chain agent scores risk with an unsupervised anomaly detector. Each tick it reads a few market numbers (features) and asks how anomalous the whole current picture is versus the recent "normal" — not each number in isolation, but jointly, accounting for how the features usually move together (their covariance). The weirder the joint picture, the higher a 0-100 score. A high score makes the agent ask the lending protocol to tighten. "Normal" is a live EWMA (recent ticks weigh more); the threshold is calibrated on a calm period so a score near 100 means "more extreme than ~99% of calm-market minutes". The contract-side math, the on-chain re-derivation, and the freeze logic are out of scope here and live with the Move package; backtest numbers live in [ml-backtest.md](./ml-backtest.md).

## How it works

Take a vector of unit-free features. Maintain an EWMA mean and EWMA covariance of that vector so "normal" tracks the recent market. Each tick, measure the squared Mahalanobis distance of the current vector from the mean under that covariance — one number for how far the whole configuration sits from normal, weighted by how features usually co-move. Map that distance to 0-100 by its percentile against a calm reference window. When the score stays high (>= 99 for two ticks), the agent emits a parameter request that asks the protocol to tighten; the contract clamps that request to a safe direction within DAO-set bounds and re-derives the breach on its own on-chain data before acting. The agent's number is advisory only.

## The criteria

The default run uses four features computed from the token under watch; a market-aware run adds a fifth (`mktvol`). Live, two on-chain order-book features (`imb`, `spread`) can extend the vector further. Everything downstream is identical at any size.

| Feature | What it measures | Source | Group -> parameter |
|---------|------------------|--------|--------------------|
| `div` | oracle vs market divergence | Pyth vs DeepBook mid (live) / perp last vs index (backtest) | solvency -> `max_ltv` |
| `divvel` | how fast that divergence is widening | derivative of `div` | solvency -> `max_ltv` |
| `disp` | price disagreement across venues | Coinbase / OKX / Bybit | liquidity -> `borrow_cap` |
| `volvel` | the token's own volatility, accelerating | token price | liquidity -> `borrow_cap` |
| `mktvol` | the market's (BTC) volatility, accelerating | BTC, Binance / CEX | liquidity -> `borrow_cap` (as attribution) |
| `imb`, `spread` | order-book skew + spread | DeepBook L2 / CEX depth | liquidity (live only) |

The exact formulas: `div = 1e4·|ln(p_pyth) − ln(p_cex_median)|` in bps; `divvel = div_t − div_{t−w}`; `disp = 1e4·stdev_i(ln p_i)` over 1m mids across venues, in bps; `volvel = (rv_t − rv_{t−w})/(rv_{t−w}+ε)` with `rv_t = EWMA_30(r²)`, `r = Δln p`, `w ≈ 30`. `mktvol` is `volvel` on a BTC proxy. Every feature is engineered unit-free and roughly stationary so the EWMA covariance stays well-conditioned. The `imb`/`spread` depth features are live-only because free historical L2 depth is not available; they are documented with the backtest material.

## Two axes

The features split into two groups, each driving one parameter on its own.

- `max_ltv ← solvency {div, divvel}` = "can we trust the price?" When the oracle diverges from the market, allow less leverage per position.
- `borrow_cap ← liquidity {disp, volvel, mktvol}` (plus live depth) = "how violent and fragmented is it?" When the asset itself moves hard or the broader market does, cap new borrowing.

Why two parameters and not one number: a low-volatility oracle anomaly (a stablecoin peg break) should tighten only `max_ltv` — the price is suspect but nothing is crashing. A violent price crash should tighten both — a violently-moving collateral genuinely warrants a tighter cap on top of less leverage. A single score could not tell those two situations apart; two independently-calibrated knobs can. `liq_buffer` is deliberately not a third knob (see below).

## The market feature

`mktvol` is the market-context piece, and it sits in the liquidity group as an attribution signal. It tells you which kind of stress you are in: BTC elevated points at a systemic risk-off move, BTC calm points at the asset's own problem. The cross-asset read falls out of the covariance cross-terms between the token's features and the market proxy's — when the token and market move together the joint configuration sits where the calm covariance expects it; when the token moves and the market does not, the cross-terms make it an outlier. So no explicit beta feature is needed.

Two limits on `mktvol`. It tells you which kind of stress; it does not hold `borrow_cap` loose through a crash — an elevated market still tightens the cap. And it is off-chain context, so the contract cannot re-derive a BTC volatility on-chain: `mktvol` shifts only the advisory score and the parameter request, never the contract's own on-chain check.

## Score to action

Map `d²` to 0-100 by percentile. Under a multivariate-normal null `d² ~ χ²(k)`, so the nominal score is `100·F_{χ²,k}(d²_t)`. Engineered features are heavy-tailed and autocorrelated, so empirical `d²` deviates from χ²(k) and the reported score is the calm-window empirical percentile, with χ²(k) noted as the nominal reference. The claim is "score = p means more extreme than p% of calm-market configurations", not a clean χ² probability.

An alert fires when the score is at or above 99 for two consecutive ticks; the debounce keeps single-tick noise from tripping it. The score then maps to a corridor fraction `f ∈ [0,1]`, with `target_p = floor_p + f(score)·(baseline_p − floor_p)`:

- below 60: dead-band, nothing moves
- 60-95: a logistic ramp
- above 95: saturates at the floor

Corridors are `max_ltv` [55%, 75%] and `borrow_cap` [40%, 100%], set on-chain by the DAO. Each group is calibrated separately, so the two parameters move independently. The map is tighten-only — it only ever moves toward the floor; RELAX is contract-only on a sustained all-clear. `liq_buffer` is excluded from the map entirely: it is retroactive, so tightening it could force liquidations and harm existing users, which makes it DAO-only.

The ratchet is enforced twice. Agent side: `request = min(target_now, last_applied)`, so it never even asks to loosen mid-episode. Contract side (authoritative): clamp to [floor, baseline], reject any looser-than-current component, take `tighter_of(agent_target, contract_own_target)`. The 0-100 score rides along as an advisory event field; the contract acts on the clamped `ParamRequest` and its own on-chain re-derivation, never on the number.

## The math, briefly

`x_t ∈ ℝ^k`, k set by the configured feature list. Pure TypeScript, O(k²) per tick, no heavy dependencies beyond a Cholesky solve and a regularized incomplete gamma.

- EWMA mean: `μ_t = λ·μ_{t−1} + (1−λ)·x_t`.
- EWMA covariance: `Σ_t = λ_c·Σ_{t−1} + (1−λ_c)·(x_t − μ_{t−1})(x_t − μ_{t−1})ᵀ`, updated against the pre-update mean `μ_{t−1}` so there is no look-ahead.
- Shrinkage + ridge: `Σ̃ = (1−δ)·Σ_t + δ·(tr(Σ_t)/k)·I` with δ = 0.15 fixed, plus `ε·I`. Fixed shrinkage, Ledoit-Wolf-style but with δ constant, not the data-driven estimator.
- Squared Mahalanobis distance: `d²_t = (x_t − μ_t)ᵀ Σ̃⁻¹ (x_t − μ_t)`, via Cholesky `Σ̃ = LLᵀ`, solving `L y = (x − μ)` then `d² = yᵀy`.
- Per-feature contribution: `z = Σ̃⁻¹(x − μ)`, `c_i = (x_i − μ_i)·z_i`, with `Σ_i c_i = d²` exactly. A negative `c_i` is a correlation-surprise term (the Kritzman-Li signal); clamp at 0 for display, keep it signed in the event log.
- Calibration: chi-squared CDF is the nominal score, but the reported score is the empirical calm-percentile, since χ²(k) over-fires on heavy-tailed features.

Prior art, named honestly. Mahalanobis-of-returns is the Kritzman-Li Financial Turbulence Index (Kritzman and Li, FAJ 66(5), 2010); the EWMA covariance is RiskMetrics (J.P. Morgan, 1996). The novelty is the application — oracle-vs-CLOB-vs-CEX divergence as a real-time breaker — plus the on-chain enforcement, not the estimator.

## Why it's built this way

- Covariance/Mahalanobis, not per-feature thresholds, catches the joint anomaly: things that usually agree pulling apart, even when no single number looks alarming. An if-statement per feature can't see that.
- EWMA plus empirical calibration gives a live "normal" that tracks the recent market and an honest ~1% false-alarm rate by construction.
- The component split (covariance sub-blocks) yields two knobs from the two risk axes, each calibrated on its own data, so `max_ltv` and `borrow_cap` move independently.
- Tighten-only, advisory score, and the contract re-deriving the breach on its own on-chain data mean the agent is never trusted: it can only make things safer within DAO-set bounds, and the contract decides on its own reading.
- Unsupervised, no labels, so it generalizes to a crash type it has never seen.

## Scope

Oracle and price-anomaly class only. It detects when an oracle price, the market it claims to track, and the venues quoting that market stop agreeing in a way the calm-market history says is improbable. It does not cover key or governance compromise, contract logic bugs, or credit quality. Human override and DAO-unfreeze are contract-side behind a `&GovernanceCap`-gated function. Caveats to keep in mind: backtests are 1-minute bars against a live agent that ticks every few seconds; depth features (`imb`, `spread`) are live-only; reported lead times are in-sample case studies.

Bottom line: a live, unsupervised joint-anomaly detector that turns oracle-vs-market disagreement into a 0-100 score and a tighten-only parameter request the contract clamps and re-checks on its own data, so the agent can only ever make the protocol safer within DAO-set bounds.
