# What we tested it on

The evidence behind Seawall's risk score: real market dislocations replayed minute by minute, plus two calm windows to confirm it stays quiet when nothing is wrong.

Scope first. Seawall is an off-chain agent that scores how anomalous several price and liquidity sources look, then issues a tighten-only request for a lending protocol's risk parameters. A Move policy object re-derives the breach on-chain and is the only thing that moves parameters; that contract is out of scope. These docs cover the scoring agent.

## Setup

Everything runs on 1-minute bars. Data is free and keyless: USD-M futures and spot klines from the Binance public archive, 1-minute spot candles from Coinbase, OKX and Bybit, and Pyth price history from Benchmarks. The two depth features (imbalance and spread) are live-only — no free historical depth. The backtest uses the four features with free history: cross-venue dispersion, oracle/market divergence, and divergence- and volatility-velocity.

The model is unsupervised: no training, no labels. We mark the known event windows only to measure timing, not to fit anything. It keeps a running EWMA mean and covariance of the feature vector and computes the current vector's squared Mahalanobis distance from that normal. The 0-100 score is the empirical percentile of that distance against a calm reference window, so 99 means "more extreme than 99% of calm minutes" — fixing the calm false-alarm rate at roughly 1% by construction.

Two terms throughout. Lead is the time from the first sustained alert to the first visible -5% bar — the first minute where the trailing-30-minute return on the reference price is at or below -5% (-2% for the stablecoin); lead zero means alert and move in the same minute. Calm false-alarm, on the pre-event window, is the single-tick rate (how often a lone tick crosses 99, target ~1%) plus the sustained-alert count. An alert is score >= 99 for two consecutive ticks.

## Results

| Event | Fired | Lead | Driver | Calm false-alarm (single / sustained) |
|---|---|---|---|---|
| Oct 10 2025 — BTC liquidation cascade | yes | 23 min | systemic (div 50%, disp 24%, divvel 20%) | 0.98% (10/1020) / 0 |
| Mar 10-11 2023 — USDC de-peg (post-SVB) | yes | 379 min (6.3 h) | solvency (div 53%, divvel 35%, disp 9%) | 1.01% (23/2280) / 3 |
| Aug 5 2024 — yen carry unwind, BTC | yes | 0 min | dispersion (disp 75%, div 18%, divvel 6%) | 1.00% (12/1200) / 2 |
| Feb 2-3 2025 — tariff selloff, ETH | yes | 187 min | liquidity (disp 38%, div 35%, volvel 19%) | 1.00% (12/1200) / 0 |

## The four events

Oct 10 2025, BTC liquidation cascade. A leverage flush gapped the perp away from the index. First sustained alert 20:52 UTC, 23 minutes before the -5% bar at 21:15; distance peaked 21:19 mid-cascade. Divergence led at 50% of the distance, dispersion and divergence-velocity behind, so this read as systemic and both parameters went to floor. Clean calm window: 0.98% single-tick, zero sustained.

USDC de-peg, March 2023. The case that shows why the two parameters are scored separately. No USDC futures exist, so divergence here is distance off the $1 peg on the Bybit and OKX USDC pairs — Coinbase had no 2023 USDC-USD candles, and USDC was quoted against USDT, which held its peg through the weekend. First alert Mar 10 21:13 UTC, 379 minutes (6.3 hours) before the -2% bar. Almost entirely solvency: divergence 53%, divergence-velocity 35%, dispersion only 9%. So max_ltv tightened to its floor of 55% while borrow_cap stayed at baseline 100%: cut leverage per position, don't throttle new borrowing. Calm single-tick was the designed 1.01%, but 3 sustained alerts in-sample: an artifact of a pinned stablecoin, where at ~1.0000 the calm distances are nearly degenerate and the natural ~1% tail clumps into adjacent ticks. Single-tick rate is still on target.

Aug 5 2024, yen carry-trade unwind, BTC. Blunt: lead 0, the move near-vertical. Lone 99s appear from 00:02, but the signal sustains only at 01:10, when the -5% bar trips. Driver was cross-venue dispersion at 75%. Calm single-tick 1.00%, 2 sustained alerts because that window was a Sunday already carrying pre-crash chop.

Feb 2-3 2025, tariff selloff, ETH. The weakest of the four. First alert Feb 2 22:40 UTC, 187 minutes before the -5% bar, driven by liquidity (dispersion 38%, divergence 35%, volatility-velocity 19%). Distance peaked around 104. A news gap-down, not an intraday cascade, and the lead is measured to the -5% onset, not the deeper -25% wick later. Clean calm window: 1.00% single-tick, zero sustained.

## Does it fire on ordinary chop?

Two calm windows, calibrated on the first ~60% and tested on the last ~40% out-of-sample:

- Jun 24-26 2024, range-bound BTC around 60-62k. Single-tick 1.02%, out-of-sample sustained 0, peak distance 24. Clean.
- Sep 7-9 2025, range-bound BTC around 110-113k. Single-tick 1.02%, out-of-sample sustained 1 — a benign -0.4% dip that recovered within minutes, distance 32 — the ~1% statistical floor, not a real detection.

## The threshold

We keep score >= 99 (the 99th calm percentile) with 2 consecutive ticks. That caught all four events and stayed silent on calm chop (0 and 1 benign sustained alerts out-of-sample).

We considered tightening to 3-consecutive ticks or the 99.5th percentile and rejected it. It would zero out the lone Sep-2025 blip, but it costs lead on the fastest events: Aug-5 is already coincident at 2-in-a-row, so anything stricter pushes it past the move, and it risks dropping the already-weak Feb-2025 detection. The single benign blip beats losing real signal.

## Honest limits

- Lead times are in-sample: the threshold is calibrated and measured on the same four episodes, so these are four worked examples, not a validated general lead. The held-out part is the calm false-alarm rate and the out-of-sample synthetic floor.
- The backtest is on 1-minute bars; the live agent ticks every few seconds. A 1-second backtest is a possible refinement (spot 1s history goes back to about May 2022).
- The two depth features are live-only; with no free historical L2 depth, the reported backtest is the four-feature model.
- Scope is the oracle/price-anomaly class only. Not key or governance compromise, logic bugs, or credit quality.

## Reproduce

```
tsx packages/agent/src/backtest.ts all
```
