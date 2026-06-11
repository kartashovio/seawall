# How the risk model works

Seawall is an autonomous risk guardian for Sui lending. An off-chain TypeScript agent watches several price and liquidity sources, scores how anomalous the market looks, and turns that score into a tighten-only request for a lending protocol's risk parameters. The agent never decides anything on-chain. It hands the contract a fresh signed price and a clamped parameter request; a Move policy object re-derives the breach from its own on-chain reading and is the only thing that acts. (That contract is documented separately; this file is about the model.) The score is advisory. Treat it as an early-warning radar, not an authority.

## Inputs and outputs

The agent emits three things each tick: a 0-100 risk score, and two lending parameters, `max_ltv` (%) and `borrow_cap` (%). The score is for the dashboard and rides along as an advisory event field; it is never on the logic path. The two parameters are the actual request to the contract, and both are tighten-only. The agent can only ask to move them toward safer, meaning lower. It cannot ask to loosen anything, ever.

There is a third lending parameter, `liq_buffer`, that the agent deliberately does not touch. Tightening a liquidation buffer is retroactive: raising it can push existing positions underwater and force liquidations on users who did nothing wrong. "Safer for the protocol" is not the same as "safer for users" there. So `liq_buffer` stays under DAO control only, and the agent has no path to it.

## Data sources

Everything the model reads is free and keyless. No paid feeds, no API keys for the backtest.

| Source | What it gives | History |
|---|---|---|
| Binance public archive (`data.binance.vision`) | USD-M futures mark/index/last 1-minute klines; spot 1-second klines. Static files, no geo-block. | Futures klines from ~Jan 2023; spot 1s back to ~May 2022 |
| Coinbase, OKX, Bybit public REST | 1-minute spot candles, keyless, paged | exchange-dependent |
| Pyth | hermes-beta for the live testnet feed; Benchmarks for mainnet history (price + confidence) | history from ~Oct 2023 |
| DeepBook (live) | order-book mid and L2 depth, read on-chain | live only |

One honest gap: order-book depth is not freely archived anywhere. There is no public historical L2 depth. So the two depth-derived features are live-only, and the backtest you can reproduce runs on the four features that do have free history.

## The features

The model works on a six-element feature vector. Four of them are computable from free historical data and are what the backtest uses; the other two need a live order book.

- `disp`: cross-venue price dispersion, in bps. `1e4 * stdev` of `ln(price)` across the venues at that minute. High when the same asset trades at different prices in different places.
- `div`: oracle/market divergence, in bps. `1e4 * |ln(a) - ln(b)|`. In the backtest, `a`/`b` are the Binance perp last vs the composite index, or a price vs a $1 peg for a stablecoin. Live, it is Pyth vs the DeepBook mid.
- `divvel`: divergence velocity. `div` now minus `div` one window ago (about 30 ticks). Picks up a divergence that is opening, not just one that is already wide.
- `volvel`: volatility velocity. The log growth of an EWMA of squared log-returns (EWMA span ~30). Stable and symmetric, so it reacts to acceleration in either direction without sign games.
- `imb` (live only): order-book depth imbalance, `(bidDepth - askDepth) / (bidDepth + askDepth)`, in `[-1, 1]`.
- `spread` (live only): effective spread, `1e4 * (ask - bid) / mid`.

## The model

Pure TypeScript. No training, no labels, no GPU. It is a streaming statistical estimator, not a learned model.

The agent keeps a running EWMA mean and EWMA covariance of the feature vector. The covariance update uses the pre-update mean, so a new observation never gets to define the "normal" it is then compared against. That keeps it free of look-ahead. The default EWMA decay is 0.97/0.94, but the 1-minute backtests use 0.99: RiskMetrics' 0.94 was tuned for daily data and is too reactive at one-minute resolution.

The covariance gets a fixed shrinkage toward a scaled identity (weight 0.15) plus a tiny ridge, so it stays well-conditioned and invertible even when features are nearly collinear. This is a fixed-weight, Ledoit-Wolf-style ridge, not the full data-driven Ledoit-Wolf estimator.

Each tick it computes the squared Mahalanobis distance

```
d2 = (x - mu)^T * Sigma^-1 * (x - mu)
```

via a Cholesky solve. This is how far the whole current picture sits from normal, accounting for how the features usually move together. The point of the covariance term is the joint case: it fires when things that normally agree start disagreeing, even if no single feature is individually alarming.

It then decomposes `d2` into per-feature contributions `c_i = (x_i - mu_i) * z_i`, where `z = Sigma^-1 (x - mu)`. These sum exactly to `d2`, so the dashboard can show which feature actually drove the score, with no hand-waving.

A word on prior art, so it's clear what is and isn't new. The Mahalanobis-distance-of-returns is the Kritzman-Li Financial Turbulence Index (Financial Analysts Journal, 2010). The EWMA covariance is RiskMetrics (J.P. Morgan, 1996). Neither estimator is our invention and we don't claim it is. What is new is the application, oracle vs CLOB vs CEX divergence as a real-time circuit-breaker signal, and the on-chain enforcement around it.

## Calibrating the 0-100 score

The textbook move is: under a Gaussian null, `d2` follows a chi-squared distribution, so you push `d2` through the chi-squared CDF to get a 0-100 number. We tried that and it over-fires. Real features are heavy-tailed and autocorrelated, the empirical `d2` does not match chi-squared, and the chi-squared score flagged 2-5% of genuinely calm minutes. That is too noisy to act on.

So the score we report is not the chi-squared CDF. It is the empirical percentile of `d2` against a calm reference window. A score of 99 means "more extreme than 99% of calm minutes." Calibrating to the empirical distribution instead of a theoretical one pins the calm false-alarm rate at about 1% by construction, which is something you can check rather than something you have to take on faith. Chi-squared stays as the nominal reference for intuition; the percentile is what runs.

An alert, the thing that triggers a parameter request, is: score >= 99 for two consecutive ticks. The 2-consecutive rule throws away single-tick noise.

## The component split

`max_ltv` and `borrow_cap` respond to different kinds of risk, so they are scored separately rather than from one shared number.

- `max_ltv` is driven by solvency risk: the marginal Mahalanobis distance over `{div, divvel}`, the oracle/price-correctness features. When the oracle disagrees with the market, you want less leverage per position.
- `borrow_cap` is driven by liquidity and systemic risk: the marginal distance over `{disp, volvel}` (plus depth, live). When the market is fragmented and volatility is accelerating, you cap new borrowing.

"Marginal" means the sub-block of the covariance for just those features, the marginal of the Gaussian, scored on its own and calibrated to its own calm percentile. The two components are genuinely separate signals, not one score scaled twice. The USDC de-peg case shows the split doing its job: an oracle/peg anomaly drove `max_ltv` to its floor while `borrow_cap` stayed at baseline, because the event was about price correctness, not market liquidity.

## Score to parameter

Each component maps its score to its parameter through a dead-band plus a logistic curve. Below score 60 the parameter sits at its baseline, the loosest setting, so ordinary noise tightens nothing. Between 60 and 95 it follows the logistic. Above 95 it sits at the floor, the tightest setting.

```
max_ltv:    floor 55%   baseline 75%
borrow_cap: floor 40%   baseline 100%
```

The corridor `[floor, baseline]` is on-chain state set by the DAO or the protocol, not by the agent. The agent can only move `current` toward `floor`. It cannot reach past the floor and it cannot push back toward baseline. Loosening is the contract's own job, under its own all-clear rules, never the agent's.

## What this does not do

This model covers the oracle/price-anomaly class: de-pegs, oracle/market divergence, cross-venue fragmentation, accelerating volatility. It does not detect key or governance compromise, it does not catch logic bugs in a protocol's own contracts, and it says nothing about credit quality. It is one specific guardian, not a general safety system.

A few more limits worth stating plainly:

- The backtest runs on 1-minute bars while the live agent ticks every few seconds. 1-second backtests are a possible refinement, not done yet.
- The reported lead times are in-sample case studies. The threshold is calibrated and measured on the same four episodes, so they are illustrative, not a statistically validated general lead. The calm false-alarm rate and the synthetic out-of-sample floor are the genuinely held-out part.
- The depth features are live-only, because there is no free historical L2 depth. The backtested model is the four-feature version.

## Reproducing the results

The backtest is one command:

```
tsx packages/agent/src/backtest.ts all
```

The four real events, the false-positive probes, and the threshold decision are written up in [`backtest.md`](./backtest.md).
