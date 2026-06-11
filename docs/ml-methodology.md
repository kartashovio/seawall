# How the risk model works

Seawall is an autonomous risk guardian for Sui lending. An off-chain agent watches several price and liquidity sources, scores how anomalous the market looks, and turns that score into a tighten-only request for a protocol's risk parameters. The agent never decides anything on-chain: it hands the contract a fresh signed price and a clamped request, and a Move policy object re-derives the breach from its own on-chain reading and is the only thing that acts.

## Inputs and outputs

Each tick the agent emits a 0-100 risk score and two lending parameters, `max_ltv` (%) and `borrow_cap` (%). The score rides along as an advisory event field for the dashboard, never on the logic path. The two parameters are the request to the contract, both tighten-only: the agent can only move them lower, never loosen.

A third parameter, `liq_buffer`, the agent deliberately does not touch. Tightening a liquidation buffer is retroactive: raising it can push existing positions underwater and force liquidations on users who did nothing wrong. "Safer for the protocol" is not "safer for users" there. So `liq_buffer` stays DAO-only, no agent path.

## Data sources

Everything the model reads is free and keyless: no paid feeds, no API keys.

| Source | What it gives | History |
|---|---|---|
| Binance public archive (`data.binance.vision`) | USD-M futures mark/index/last 1-minute klines; spot 1-second klines. Static files, no geo-block. | Futures klines from ~Jan 2023; spot 1s back to ~May 2022 |
| Coinbase, OKX, Bybit public REST | 1-minute spot candles, keyless, paged | exchange-dependent |
| Pyth | hermes-beta for the live testnet feed; Benchmarks for mainnet history (price + confidence) | history from ~Oct 2023 |
| DeepBook (live) | order-book mid and L2 depth, read on-chain | live only |

Order-book depth is not freely archived anywhere, so the two depth-derived features are live-only and the reproducible backtest runs on the four features with free history.

## The features

A six-element vector. Four are computable from free historical data and are what the backtest uses; the other two need a live order book (tagged below).

- `disp`: cross-venue price dispersion, in bps. `1e4 * stdev` of `ln(price)` across venues at that minute.
- `div`: oracle/market divergence, in bps. `1e4 * |ln(a) - ln(b)|`. In the backtest, `a`/`b` are the Binance perp last vs the composite index, or a price vs a $1 peg for a stablecoin. Live, Pyth vs the DeepBook mid.
- `divvel`: divergence velocity. `div` now minus `div` one window ago (about 30 ticks). Catches a divergence opening, not just one already wide.
- `volvel`: volatility velocity. Log growth of an EWMA of squared log-returns (span ~30). Symmetric, reacting to acceleration in either direction.
- `imb` (live only): order-book depth imbalance, `(bidDepth - askDepth) / (bidDepth + askDepth)`, in `[-1, 1]`.
- `spread` (live only): effective spread, `1e4 * (ask - bid) / mid`.

## The model

A streaming estimator, not a learned model: no training, no labels, no GPU. The agent keeps a running EWMA mean and EWMA covariance of the feature vector. The covariance update uses the pre-update mean, so a new observation never defines the "normal" it is compared against (no look-ahead). Default EWMA decay is 0.97/0.94; the 1-minute backtests use 0.99, since RiskMetrics' 0.94 was tuned for daily data and is too reactive at one-minute resolution.

The covariance gets a fixed shrinkage toward a scaled identity (weight 0.15) plus a tiny ridge, keeping it invertible when features are nearly collinear. A fixed-weight, Ledoit-Wolf-style ridge, not the full data-driven Ledoit-Wolf estimator.

Each tick it computes the squared Mahalanobis distance

```
d2 = (x - mu)^T * Sigma^-1 * (x - mu)
```

via a Cholesky solve. The covariance term handles the joint case, firing when features that normally agree start disagreeing, even when none is alarming on its own.

It decomposes `d2` into per-feature contributions `c_i = (x_i - mu_i) * z_i`, where `z = Sigma^-1 (x - mu)`. These sum exactly to `d2`, so the dashboard shows which feature drove the score.

Prior art, so it's clear what is and isn't new. The Mahalanobis-distance-of-returns is the Kritzman-Li Financial Turbulence Index (Financial Analysts Journal, 2010); the EWMA covariance is RiskMetrics (J.P. Morgan, 1996). Neither estimator is our invention. New is the application, oracle vs CLOB vs CEX divergence as a real-time circuit-breaker signal, and the on-chain enforcement around it.

## Calibrating the 0-100 score

Under a Gaussian null, `d2` is chi-squared, so the textbook move is to push it through the chi-squared CDF for a 0-100 number. It over-fires: real features are heavy-tailed and autocorrelated, so the empirical `d2` does not match chi-squared, and the chi-squared score flagged 2-5% of genuinely calm minutes.

So the reported score is the empirical percentile of `d2` against a calm reference window, not the chi-squared CDF. A score of 99 means "more extreme than 99% of calm minutes." This pins the calm false-alarm rate at about 1% by construction; chi-squared stays only as the nominal reference for intuition.

An alert, which triggers a parameter request, is score >= 99 for two consecutive ticks (filtering single-tick noise).

## The component split

`max_ltv` and `borrow_cap` respond to different kinds of risk, so they are scored separately, not from one shared number.

- `max_ltv` is driven by solvency risk: the marginal Mahalanobis distance over `{div, divvel}`, the oracle/price-correctness features.
- `borrow_cap` is driven by liquidity and systemic risk: the marginal distance over `{disp, volvel}` (plus depth, live).

"Marginal" means the sub-block of the covariance for just those features, scored on its own and calibrated to its own calm percentile. The USDC de-peg case shows the split working: an oracle/peg anomaly drove `max_ltv` to its floor while `borrow_cap` stayed at baseline.

## Score to parameter

Each component maps its score to its parameter through a dead-band plus a logistic. Below 60 the parameter sits at baseline (loosest), so ordinary noise tightens nothing. Between 60 and 95 it follows the logistic; above 95 it sits at the floor (tightest).

```
max_ltv:    floor 55%   baseline 75%
borrow_cap: floor 40%   baseline 100%
```

The corridor `[floor, baseline]` is on-chain state set by the DAO or the protocol, not the agent. The agent can only move `current` toward `floor`, never past it or back toward baseline. Loosening is the contract's own job.

## What this does not do

This model covers the oracle/price-anomaly class: de-pegs, oracle/market divergence, cross-venue fragmentation, accelerating volatility. It does not detect key or governance compromise, catch logic bugs in a protocol's own contracts, or say anything about credit quality. One guardian, not a general safety system.

More limits:

- The backtest runs on 1-minute bars while the live agent ticks every few seconds. 1-second backtests are a possible refinement, not done yet.
- The reported lead times are in-sample case studies: the threshold is calibrated and measured on the same four episodes, so they are illustrative, not a statistically validated general lead. The calm false-alarm rate and the synthetic out-of-sample floor are the genuinely held-out parts.
- The depth features are live-only, with no free historical L2 depth. The backtested model is the four-feature version.

## Reproducing the results

One command:

```
tsx packages/agent/src/backtest.ts all
```

The four real events, the false-positive probes, and the threshold decision are written up in [`ml-backtest.md`](./ml-backtest.md).
