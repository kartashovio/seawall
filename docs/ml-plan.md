# Risk model

Off-chain TypeScript agent. Ticks every few seconds, scores how anomalous the market looks, and sends the contract a "tighten" request. No training, no labels.

## Input / output

- Input: market data from a few free sources.
- Output: risk score 0–100 (for the dashboard) + max_ltv % + borrow_cap %.
- The score is display-only, off the decision path. max_ltv / borrow_cap are clamped by the contract and only ever applied in the safer direction.

## Sources (all free, no keys)

| | Source | What it gives | Role |
|-|--------|---------------|------|
| S1 | data.binance.vision (archive) | klines spot 1s, futures mark/index/last 1m, bookDepth | backtest |
| S2 | Pyth Benchmarks | price + confidence (mainnet feed) | backtest |
| S3 | Coinbase / OKX / Bybit 1m | price across venues | live + backtest |
| S4 | Binance /depth + DeepBook (on-chain) | order-book depth | live only |
| S5 | hermes-beta | live SUI/USD, the feed the contract reads | live |

Two different SUI/USD feed ids: beta (live) and mainnet (backtest); they are separate feeds. Resolve from the SDK at startup; the hex sits in `packages/shared/src/feeds.ts`.

Historical order-book depth isn't available for free, so depth is live-only.

## Features (6)

- `disp` — price dispersion across venues (bps)
- `div` — oracle vs market divergence (bps)
- `divvel` — divergence velocity
- `volvel` — volatility velocity (fires first in a crash)
- `imb` — depth imbalance, [-1, 1] (live only)
- `spread` — spread (bps, live only)

The backtest runs on the first four. Depth (`imb`, `spread`) only exists live; in the backtest it's a separate sanity chart, not part of the model.

## Model

- EWMA: mean λ=0.99, covariance λ_c=0.996, ridge δ=0.15 (mean fast / cov slow, live == backtest).
- Mahalanobis distance d² → χ²-CDF → 0–100.
- Per-feature contribution: `c_i = (x_i − μ_i)·z_i`, `Σ c_i = d²`. Shows what drove the score.
- This is the Kritzman-Li turbulence index (covariance is RiskMetrics). What's new is the application, not the math.

score → corridor fraction `f ∈ [0,1]` → max_ltv / borrow_cap:

- score < 55 → leave it
- 55–80 → logistic (s_mid=68, γ=0.15)
- score > 80 → corridor floor

The corridor `[floor, baseline]` is set by the DAO/protocol. The agent only moves toward floor. `liq_buffer` is left alone (retroactive, could trigger liquidations).

## Backtest (no labels)

Mark only the windows of known events, and only to measure latency/FP, not to train.

- Oct 10 2025 (main): Binance futures `mark vs index`, 20:50–21:30 UTC. `volvel` first, `div`/`divvel` as books thin.
- USDe spot vs $1, 21:36–22:16 — secondary. A single-venue price dislocation, not a "depeg".
- USDC Mar 2023, stETH Jun 2022 (if a free Curve ratio turns up, otherwise synthetic).

Metrics:

- lead time before the crash (in-sample, 3 events)
- false alarms per day on a calm month (held-out)
- synthetic shock injections → detection-rate curve
- sweep τ 50→99, take the knee

## Risks

- Historical depth isn't free → `imb`/`spread` are live-only.
- Name the prior art honestly (Kritzman-Li, RiskMetrics); don't claim "novel ML".
- τ/λ/δ are tuned on the same events → latency in-sample, FP on held-out.
- Sources use different timestamps → normalize everything to epoch-ms at ingest. Cross-venue time alignment is the main technical risk.
