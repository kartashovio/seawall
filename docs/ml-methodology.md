# ML methodology

The ML model scores risk with an unsupervised anomaly detector. Each tick it reads a few market numbers (features) and asks one thing: how strange is the whole current picture compared to what has been normal lately? Not each number on its own, but all of them together, including how they usually move in step. The stranger the picture, the higher a 0-100 score. A high score makes the model ask the lending protocol to tighten its risk settings. (The Move contract that receives that request, re-checks it on its own on-chain data, and enforces it is documented separately; backtest numbers live in [ml-backtest.md](./ml-backtest.md).)

## How it works

Picture a guard who doesn't watch one camera but the whole wall of them at once, and who has learned what a normal evening looks like. Not just normal prices, but the normal relationships: the exchanges usually agree on a price, the gap between the oracle and the market is usually tiny, volatility usually sits in some range.

Every tick the model asks the same question: given everything I've seen lately, how unlikely is the picture right now? The trick is that it watches the combination. It reacts when things that normally agree start disagreeing, even if no single number looks scary on its own. That "how unlikely" turns into the 0-100 score.

When the score stays high, the model hands the protocol a request to tighten. The contract clamps that request to a safe direction and double-checks it against its own on-chain reading before it does anything. The model's number is only advice. The contract has the final say.

## Techniques used

The named pieces, without the reasoning (the "why" is further down):

- Exponentially-weighted moving averages (EWMA) for the running mean and the running covariance, so recent ticks weigh more than old ones.
- A covariance matrix, so the model sees how the features move together, not one at a time.
- The squared Mahalanobis distance, which collapses "how far is the whole picture from normal" into a single number.
- Covariance shrinkage (a fixed ridge) to keep the matrix stable and invertible.
- A chi-squared reference plus an empirical percentile to turn that distance into the 0-100 score.
- A two-tick debounce on the alert.

## Data and lookback

Everything the model uses is recent and rolling. Nothing is trained on years of history.

- Its sense of "normal" comes from roughly the last 100 minutes of market (the EWMA decay is 0.99 on 1-minute bars, which is about that much memory).
- The velocity features compare now against about 30 minutes ago.
- The threshold is calibrated against a recent calm stretch, a few quiet hours.

Live, the model backfills that recent window once at startup, then runs on the live stream tick by tick. It does not re-download long history to operate.

## The criteria

We watch one token at a time. Bitcoin is used only as an index of the overall market mood; every other feature is computed on the token we are actually analyzing. For this hackathon we built and calibrated the model for SUI, to get as close as we could to a working MVP in the time available.

The default run uses four features from the watched token; a market-aware run adds a fifth (`mktvol`, the Bitcoin one). Live, two on-chain order-book features (`imb`, `spread`) can extend the vector further. Everything downstream is identical at any size.

| Feature | What it measures | Source | Group -> parameter |
|---------|------------------|--------|--------------------|
| `div` | oracle vs market divergence | Pyth vs DeepBook mid (live) / perp last vs index (backtest) | solvency -> `max_ltv` |
| `divvel` | how fast that divergence is widening | derivative of `div` | solvency -> `max_ltv` |
| `disp` | price disagreement across venues | Coinbase / OKX / Bybit | liquidity -> `borrow_cap` |
| `volvel` | the token's own volatility, accelerating | token price | liquidity -> `borrow_cap` |
| `mktvol` | the market's (BTC) volatility, accelerating | BTC, Binance / CEX | liquidity -> `borrow_cap` (as attribution) |
| `imb`, `spread` | order-book skew + spread | DeepBook L2 / CEX depth | liquidity (live only) |

The formulas are short. `div = 1e4·|ln(p_pyth) − ln(p_cex_median)|` in bps. `divvel = div_t − div_{t−w}`. `disp = 1e4·stdev_i(ln p_i)` over 1m mids across venues, in bps. `volvel = (rv_t − rv_{t−w})/(rv_{t−w}+ε)` with `rv_t = EWMA_30(r²)`, `r = Δln p`, `w ≈ 30`. `mktvol` is the same `volvel`, computed on the BTC proxy instead of the token.

Every feature is engineered unit-free and roughly stationary so the covariance stays well-conditioned. The `imb`/`spread` depth features are live-only, because free historical order-book depth does not exist; they are covered with the backtest material.

## Two axes

The features split into two groups. Each group drives one parameter, on its own.

`max_ltv ← solvency {div, divvel}` answers "can we trust the price?" When the oracle disagrees with the market, allow less leverage per position.

`borrow_cap ← liquidity {disp, volvel, mktvol}` (plus live depth) answers "how violent and fragmented is it?" When the asset itself moves hard, or the broader market does, cap new borrowing.

Why two parameters instead of one number: a low-volatility oracle anomaly, like a stablecoin peg break, should tighten only `max_ltv`. The price is suspect, but nothing is crashing. A violent price crash should tighten both, because a violently-moving collateral genuinely warrants a tighter cap on top of less leverage. A single score could not tell those two situations apart; two independently-calibrated knobs can.

`liq_buffer` is deliberately not a third knob. It is retroactive, so tightening it could force liquidations on existing users, which makes it DAO-only.

## The market feature

`mktvol` is the market-context piece, and inside the liquidity group it works as an attribution signal. It tells you which kind of stress you are in: BTC elevated points at a systemic, market-wide move; BTC calm points at the asset's own problem.

That read falls out of the covariance cross-terms. When the token and the market move together, the joint configuration sits where the calm covariance expects it; when the token moves and the market does not, the cross-terms make it an outlier. So no explicit beta feature is needed.

Two limits on `mktvol`. It tells you which kind of stress, but it does not hold `borrow_cap` loose through a crash; an elevated market still tightens the cap. And it is off-chain context, so the contract cannot re-derive a BTC volatility on-chain. `mktvol` shifts only the advisory score and the request, never the contract's own check.

## Score to action

The distance `d²` becomes a 0-100 score by its percentile. Under a Gaussian null `d² ~ χ²(k)`, so the textbook score would be the chi-squared CDF. Real features are heavy-tailed, so the empirical `d²` drifts off chi-squared, and the reported score is instead the percentile against the calm window. Score = p means "more extreme than p% of calm-market configurations", with chi-squared kept only as the nominal reference.

An alert fires when the score is at or above 99 for two consecutive ticks. The debounce throws away single-tick noise.

The score then maps to a fraction `f ∈ [0,1]` of each corridor, with `target = floor + f(score)·(baseline − floor)`:

- below 60: a dead-band, nothing moves
- 60 to 95: a logistic ramp
- above 95: it sits at the floor

So the parameters start tightening from a score of 60 and are fully tightened by 95. They do not wait for the 99 alert. That alert is just a marker we use to time detection and count false alarms; it is not the gate that moves the parameters.

Corridors are `max_ltv` [55%, 75%] and `borrow_cap` [40%, 100%], set on-chain by the DAO. Each group is calibrated on its own, so the two parameters move independently. The map is tighten-only: it only ever moves toward the floor, and loosening (RELAX) is the contract's job, on a sustained all-clear.

The ratchet is enforced twice. On the model side, `request = min(target_now, last_applied)`, so it never even asks to loosen mid-episode. On the contract side, which is authoritative, the contract clamps to [floor, baseline], rejects any looser-than-current component, and takes `tighter_of(model_target, contract_own_target)`. The 0-100 score rides along only as an advisory event field; the contract acts on the clamped request and its own on-chain re-derivation, never on the number.

## The math, briefly

`x_t ∈ ℝ^k`, with k set by the feature list. Pure TypeScript, O(k²) per tick, nothing heavier than a Cholesky solve and a regularized incomplete gamma.

- EWMA mean: `μ_t = λ·μ_{t−1} + (1−λ)·x_t`.
- EWMA covariance: `Σ_t = λ_c·Σ_{t−1} + (1−λ_c)·(x_t − μ_{t−1})(x_t − μ_{t−1})ᵀ`, updated against the pre-update mean `μ_{t−1}` so there is no look-ahead.
- Shrinkage and ridge: `Σ̃ = (1−δ)·Σ_t + δ·(tr(Σ_t)/k)·I` with δ = 0.15 fixed, plus `ε·I`. Fixed shrinkage, Ledoit-Wolf-style but with δ constant, not the data-driven estimator.
- Squared Mahalanobis distance: `d²_t = (x_t − μ_t)ᵀ Σ̃⁻¹ (x_t − μ_t)`, via Cholesky `Σ̃ = LLᵀ`, solving `L y = (x − μ)` then `d² = yᵀy`.
- Per-feature contribution: `z = Σ̃⁻¹(x − μ)`, `c_i = (x_i − μ_i)·z_i`, with `Σ_i c_i = d²` exactly. A negative `c_i` is a correlation-surprise term; clamp it at 0 for display, keep it signed in the log.

Prior art, named honestly. Mahalanobis-of-returns is the Kritzman-Li Financial Turbulence Index (Kritzman and Li, FAJ 66(5), 2010). The EWMA covariance is RiskMetrics (J.P. Morgan, 1996). What is new is the application, oracle-vs-CLOB-vs-CEX divergence as a real-time breaker, plus the on-chain enforcement. The estimator is borrowed and named as such.

## Why it's built this way

The covariance and the Mahalanobis distance are the point. A per-feature threshold (a stack of `if` statements) only sees one number at a time; it cannot catch the case where things that usually agree pull apart while each one stays in its own normal range. The joint view can.

The EWMA plus the empirical calibration give a "normal" that tracks the current market and a threshold you can check rather than trust: about 1% of calm minutes cross it by construction, not by hope. A plain chi-squared threshold would over-fire on real, heavy-tailed features.

The component split gives two knobs from two risk axes, each calibrated on its own sub-distance, so the model can tighten leverage and borrow capacity for different reasons.

Tighten-only, an advisory score, and a contract that re-derives the breach mean the model is never trusted. It can only move things safer, within DAO-set bounds, and the contract decides on its own on-chain data. The market context is off-chain, so it never enters that on-chain decision.

It is unsupervised, with no labels and no training set, so it generalizes to a crash type it has never seen.

## Scope

The model covers the oracle and price-anomaly class only. It does not catch key or governance compromise, contract logic bugs, or credit quality. Human override and DAO-unfreeze are contract-side, behind a `&GovernanceCap`-gated function, and out of this document.

## Next iterations

The model is tuned for SUI right now. Pointing it at another token is not a one-line config change. The right next step is to rebuild the feature set per token and re-calibrate the settings for that token's own behaviour: the EWMA decay, the calm window, the alert threshold, and the corridors. Every collateral has its own "normal", and the model should be fit to it one at a time.

## Bottom line

The model measures how strange the whole market picture is at once, splits that strangeness into two questions, "can we trust the price?" (which moves `max_ltv`) and "how violent is it?" (which moves `borrow_cap`), uses Bitcoin to tell its own trouble from the market's, and can only ever propose a safer setting within bounds the DAO sets and the contract re-checks.
