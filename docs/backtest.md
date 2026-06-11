# What we tested it on

This is the evidence behind Seawall's risk score: a handful of real market dislocations, replayed minute by minute, plus two calm windows to check that the model stays quiet when nothing is wrong.

A note on scope before the numbers. Seawall is an off-chain agent that watches several price and liquidity sources, scores how anomalous the market looks, and turns that into a tighten-only request for a lending protocol's risk parameters. A Move policy object re-derives the breach on-chain and is the only thing that actually moves parameters; that contract is out of scope here. These docs are about the scoring agent.

## Setup

Everything runs on 1-minute bars. The data is free and keyless: USD-M futures and spot klines from the Binance public archive, 1-minute spot candles from Coinbase, OKX and Bybit, and Pyth price history from Benchmarks. Order-book depth is not freely archived anywhere, so the two depth features (imbalance and spread) are live-only. The backtest runs on the four features that do have free history: cross-venue dispersion, oracle/market divergence, and the velocity of divergence and volatility.

The model is unsupervised. There is no training and there are no labels. We mark the known event windows only to measure timing, never to fit anything. It keeps a running EWMA mean and covariance of the feature vector and, each tick, computes the squared Mahalanobis distance of the current vector from that running normal. The reported 0-100 score is the empirical percentile of that distance against a calm reference window, so a score of 99 means "more extreme than 99% of calm minutes." That makes the calm false-alarm rate roughly 1% by construction, which is the number we can actually check.

Two terms used throughout. Lead is the time from the first sustained alert to the first visible -5% bar, defined as the first minute where the trailing-30-minute return on the reference price is at or below -5% (-2% for the stablecoin case). A lead of zero means the alert and the move land in the same minute. Calm false-alarm is measured on the pre-event calm window: the single-tick rate (how often a lone tick crosses score 99, target ~1%) and the count of sustained alerts. An alert is the action-triggering event: score >= 99 for two consecutive ticks. The 2-consecutive rule is what suppresses single-tick noise.

## Results

| Event | Fired | Lead | Driver | Calm false-alarm (single / sustained) |
|---|---|---|---|---|
| Oct 10 2025 — BTC liquidation cascade | yes | 23 min | systemic (div 50%, disp 24%, divvel 20%) | 0.98% (10/1020) / 0 |
| Mar 10-11 2023 — USDC de-peg (post-SVB) | yes | 379 min (6.3 h) | solvency (div 53%, divvel 35%, disp 9%) | 1.01% (23/2280) / 3 |
| Aug 5 2024 — yen carry unwind, BTC | yes | 0 min | dispersion (disp 75%, div 18%, divvel 6%) | 1.00% (12/1200) / 2 |
| Feb 2-3 2025 — tariff selloff, ETH | yes | 187 min | liquidity (disp 38%, div 35%, volvel 19%) | 1.00% (12/1200) / 0 |

## The four events

Oct 10 2025, BTC liquidation cascade. A leverage flush that gapped the perp away from the index. The first sustained alert fired at 20:52 UTC, 23 minutes before the -5% bar at 21:15, and the distance peaked at 21:19 once the cascade was fully underway. Divergence led the picture at 50% of the distance, with dispersion and divergence-velocity behind it, so this read as a systemic event and both parameters went to floor. The calm window before it was clean: 0.98% single-tick, zero sustained false alarms.

USDC de-peg, March 2023. This is the case that shows why the two parameters are scored separately. After SVB, USDC slipped off its dollar peg. There are no USDC futures, so divergence here is distance off the $1 peg, measured on the Bybit and OKX USDC pairs — Coinbase had no 2023 USDC-USD candles, and USDC was quoted against USDT, which held its own peg through the weekend. The first alert came at Mar 10 21:13 UTC, 379 minutes, about 6.3 hours, before the -2% bar. It was almost entirely a solvency signal: divergence 53%, divergence-velocity 35%, dispersion only 9%. So max_ltv tightened to its floor of 55% while borrow_cap stayed at its baseline of 100%. An oracle-versus-peg anomaly pulls down leverage per position without throttling new borrowing, which is the behavior you want and exactly what the split is for. The calm single-tick rate was the designed 1.01%, but there were 3 sustained alerts in-sample. That is an artifact of a pinned stablecoin: when USDC sits at ~1.0000 the calm distances are nearly degenerate, so the natural ~1% tail clumps into a few adjacent ticks. The single-tick rate is still on target.

Aug 5 2024, yen carry-trade unwind, BTC. This one we are blunt about: the lead is 0. The move was near-vertical. Lone 99s show up from 00:02, but the signal only sustains at 01:10, which is the same minute the -5% bar trips. The driver was cross-venue dispersion at 75%, the venues briefly disagreeing on price as the market gapped down. Calm single-tick was 1.00%, with 2 sustained alerts in the calm window, because that window was a Sunday already carrying pre-crash chop. The calibration itself is clean at 1%.

Feb 2-3 2025, tariff selloff, ETH. The weakest of the four. The first alert fired Feb 2 22:40 UTC, 187 minutes before the -5% bar, driven by liquidity (dispersion 38%, divergence 35%, volatility-velocity 19%). The distance peaked around 104, which is modest. This was a news gap-down rather than an extreme intraday cascade in 1-minute bars, and the lead is measured to the -5% onset, not the deeper -25% wick that came later. Calm window was clean: 1.00% single-tick, zero sustained.

## Does it fire on ordinary chop?

Two calm windows with no event, calibrated on the first ~60% and tested on the last ~40% out-of-sample:

- Jun 24-26 2024, range-bound BTC around 60-62k. Single-tick 1.02%, out-of-sample sustained alerts 0, peak distance 24. Clean.
- Sep 7-9 2025, range-bound BTC around 110-113k. Single-tick 1.02%, out-of-sample sustained 1. That one was a benign -0.4% dip that recovered within minutes, distance 32, the ~1% statistical floor showing through rather than a real detection.

So on ordinary range-bound trading it stays quiet, with at most a single short-lived blip attributable to the calibrated tail rather than anything in the market.

## The threshold

We keep score >= 99 (the 99th calm percentile) with 2 consecutive ticks. That caught all four real events and stayed effectively silent on calm chop, with 0 and 1 benign sustained alerts out-of-sample.

We looked at tightening it, going to 3-consecutive ticks or the 99.5th percentile, and decided against it. Tightening would zero out the lone Sep-2025 blip, but it costs lead time on the fastest events. Aug-5 is already coincident at 2-in-a-row, so anything stricter pushes it past the move entirely, and it would risk dropping the already-weak Feb-2025 detection. The single benign blip is a better trade than losing real signal.

## Honest limits

- The lead times are in-sample case studies. The threshold is calibrated and measured on the same four episodes, so these are not a statistically validated general lead; they are four worked examples. The held-out part is the calm false-alarm rate and the out-of-sample synthetic floor.
- The backtest is on 1-minute bars; the live agent ticks every few seconds. A 1-second backtest is a possible refinement (spot 1s history is available back to about May 2022).
- The two depth features are live-only. There is no free historical L2 order-book depth, so the reported backtest is the four-feature model.
- This covers the oracle/price-anomaly class only. It does not cover key or governance compromise, logic bugs, or credit quality.

## Reproduce

```
tsx packages/agent/src/backtest.ts all
```
