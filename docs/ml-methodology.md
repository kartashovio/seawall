# ML methodology

The off-chain agent scores risk with an unsupervised anomaly detector. This document covers the detector itself: the feature vector, the EWMA-adaptive Mahalanobis core, the 0-100 score, and how that score maps to a parameter request the contract clamps. The contract-side math, the on-chain re-derivation, and the freeze logic are out of scope here and live with the Move package. Backtest numbers live in [ml-backtest.md](./ml-backtest.md).

## Scope

The model covers the oracle and price-anomaly class only. It detects when an oracle price, the market it claims to track, and the venues quoting that market stop agreeing in a way the calm-market history says is improbable. It does not cover key or governance compromise, contract logic bugs, or credit quality. Human override and DAO-unfreeze are contract-side, behind a `&GovernanceCap`-gated function, and out of this document.

## Feature vector

The detector is flexible. It takes a configurable list of features rather than a fixed set, instantiates a covariance of the matching size, and the rest of the math is unchanged. Two configurations matter in practice.

The default is four features computed from the token under watch. A market-aware run adds one more, a market-proxy feature, for five. Everything downstream (EWMA, Mahalanobis, contributions, score, parameter map) is identical at either size.

Every feature is engineered unit-free and roughly stationary so the EWMA covariance stays well-conditioned.

- `div`, oracle-vs-market divergence: `1e4 · |ln(p_pyth) − ln(p_cex_median)|`, in bps. Live this is Pyth versus the DeepBook mid; in backtest it substitutes a real oracle-vs-execution proxy, stated openly in the backtest doc.
- `divvel`, divergence velocity: `div_t − div_{t−w}`. A widening gap matters more than a wide-but-stable one, and tracking the change kills decimals-offset false positives.
- `disp`, cross-venue dispersion: `1e4 · stdev_i(ln p_i)` over 1m mid/close across the quoting venues, in bps.
- `volvel`, realized-vol velocity: `rv_t = EWMA_30(r²)` with `r = Δln p`, then `volvel_t = (rv_t − rv_{t−w})/(rv_{t−w}+ε)`, `w ≈ 30`. This one fires first in a flash crash.

Optional market-context feature (the fifth, added in a market-aware run):

- `mktvol`, market volatility velocity: `volvel` computed on a market proxy (BTC) instead of the token. Same formula, same window, applied to the proxy's price series. It is off-chain context only. The contract cannot re-derive a BTC volatility on-chain, so `mktvol` shifts only the advisory score and the parameter request; it never enters the contract's own on-chain check.

Live, two more on-chain liquidity features (`imb` depth imbalance, `spread` effective spread) can extend the vector further. Those are live-only because free historical L2 depth is not available, and they are documented with the backtest material rather than here.

## Model

Pure TypeScript, no heavy dependencies beyond a small Cholesky solve and a regularized incomplete gamma. O(k²) per tick. Let `x_t ∈ ℝ^k`, with k set by the configured feature list.

EWMA mean: `μ_t = λ·μ_{t−1} + (1−λ)·x_t`.

EWMA covariance: `Σ_t = λ_c·Σ_{t−1} + (1−λ_c)·(x_t − μ_{t−1})(x_t − μ_{t−1})ᵀ`. The update uses the pre-update mean `μ_{t−1}`, so there is no look-ahead. Stored flat and symmetric.

Shrinkage and diagonal loading: `Σ̃ = (1−δ)·Σ_t + δ·(tr(Σ_t)/k)·I` with δ = 0.15 fixed, plus `ε·I`. This is a fixed ridge, Ledoit-Wolf-style but with δ constant, not the full data-driven Ledoit-Wolf estimator.

Squared Mahalanobis distance: `d²_t = (x_t − μ_t)ᵀ Σ̃⁻¹ (x_t − μ_t)`, computed by Cholesky `Σ̃ = LLᵀ`, solving `L y = (x − μ)` then `d² = yᵀy`.

Per-feature contribution: `z = Σ̃⁻¹(x − μ)`, `c_i = (x_i − μ_i)·z_i`, and `Σ_i c_i = d²` exactly. Bar height is `c_i/d²`. A negative `c_i` is a correlation-surprise term (the Kritzman-Li signal); clamp at 0 for display, keep it signed in the event log. This drives the joint-anomaly demo beat, where no single feature dominates yet the joint configuration is improbable.

### Score

Map d² to 0-100. Under a multivariate-normal null `d² ~ χ²(k)`, so the nominal score is `100 · F_{χ²,k}(d²_t)`. Engineered features are heavy-tailed and autocorrelated, so the empirical d² deviates from χ²(k). The reported gauge bands are calm-period empirical percentiles, with χ²(k) noted as the nominal reference. The claim is "score = p means more extreme than p% of calm-market configurations, empirically calibrated," not a clean χ² probability.

An alert fires when the score is at or above 99 for two consecutive ticks. The debounce keeps single-tick noise from tripping it.

### Prior art

The estimator is not new. Mahalanobis-of-returns is the Kritzman-Li Financial Turbulence Index (Kritzman and Li, FAJ 66(5), 2010); the EWMA covariance is RiskMetrics (J.P. Morgan, 1996). What is new is the application, oracle-vs-CLOB-vs-CEX divergence as a real-time breaker, plus the on-chain enforcement. The math is borrowed and named as such.

## Score to parameters

The agent emits a parameter target that the contract clamps. The score maps to a fraction `f ∈ [0,1]` of each corridor, where f=1 is the loosest baseline and f=0 the tightest floor: `target_p = floor_p + f(score)·(baseline_p − floor_p)`. The shape is a dead-band plus logistic, so noise below the dead-band produces no change and the response saturates at the floor for extreme scores. Corridors are `max_ltv` [55%, 75%] and `borrow_cap` [40%, 100%].

`liq_buffer` is deliberately excluded from this map. It is retroactive, so tightening it could force liquidations and harm existing users, which makes it DAO-only.

### Component split

The features divide into two groups, and each group drives one parameter. This is what lets the model separate idiosyncratic stress from systemic stress.

- `max_ltv ← solvency {div, divvel}`. These measure the token's own oracle-vs-market gap and how fast it is widening. The token moving while the broader market is calm points at an oracle or manipulation problem specific to that asset, so the response is to tighten loan-to-value on that collateral.
- `borrow_cap ← liquidity {disp, volvel, mktvol}` (plus the live depth features). Cross-venue dispersion, the token's own vol velocity, and the market proxy's vol velocity together describe how stressed and thin the broader environment is. When the token falls alongside the market, that is systemic risk-off rather than an asset-specific oracle fault, so the response is to cap new borrowing rather than mark one collateral down.

`mktvol` is what carries the systemic signal into the liquidity group. The cross-asset discrimination falls out of the covariance cross-terms between the token's features and the market proxy's, so no explicit beta feature is needed: when the token and the market move together, the joint configuration sits where the calm covariance expects it; when the token moves and the market does not, the cross-terms make that an outlier. Because `mktvol` is off-chain context, it only shifts the advisory score and the clamped parameter request, never the contract's own on-chain re-derivation.

### Ratchet

The ratchet is enforced twice for redundancy. On the agent side, `request = min(target_now, last_applied)`, so it never even asks to loosen mid-episode; RELAX is contract-only on a sustained all-clear. On the contract side, which is authoritative, it clamps to [floor, baseline], rejects any looser-than-current component, and takes `tighter_of(agent_target, contract_own_target)`.

The 0-100 score rides along as an advisory event field. The contract acts on the clamped `ParamRequest` and its own on-chain re-derivation, never on the number, so "its score is never trusted" is literally true.

## On the freeze

When describing the contract, the FREEZE is contract-only, sitting on top of the three-layer design. The agent does not modulate the freeze threshold. The model in this document supplies the graded CAUTION request and the advisory score; the hard freeze is the contract's own on-chain check.
