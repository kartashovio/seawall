# Seawall — ML prep plan

Working notes for the off-chain agent's anomaly model. The contract-side math is out of scope here. This covers the ML core, the backtest harness, and the deliverables that ship with it. Everything below is free, keyless, and assembles in about two working days.

One rule drives most of the design. The same code path computes the feature vector live and in backtest wherever that's physically possible. Any feature that can't be sourced from free history is quarantined, so its absence is stated openly rather than papered over. Backtest assets are the ones with documented events (USDe/BTC/SOL/AVAX/AAVE for Oct 10, USDC, stETH); the live demo asset is SUI/USD. The model is asset-agnostic, since everything is unit-free and self-normalized through the EWMA, so switching assets is a config change.

The single biggest time sink is cross-venue time alignment, so it gets pinned first. Every source is normalized to integer epoch-ms at ingest with a per-source parser, sorted ascending, then as-of joined onto one canonical grid with an explicit max-staleness rule. This goes in before any feature code, not after.

## Data sources

Five sources. Three carry the historical backtest; two are live-only, with free proxies standing in for the backtest where that makes sense.

| Src | What it is | Features | Historical reach | Oct-2025 coverage | Role |
|-----|-----------|----------|------------------|-------------------|------|
| S1 | data.binance.vision bulk archive (spot 1s klines, futures mark/index/last 1m klines, bookDepth) | disp, div, divvel, volvel, oracle-vs-mark divergence, depth proxy | spot 1s back to ≥2022-05; futures bookDepth back to 2023-01 | full, all of Oct for BTCUSDT/SUIUSDT incl. Oct 10; USDEUSDT spot listed ~Sep 2025 | backtest (primary engine) |
| S2 | Pyth Benchmarks `/v1/updates/price/{ts}/{interval}` plus TradingView shim for OHLC | conf_width, oracle staleness (proxy, see caveats), SUI/USD price for div | signed price+conf from ~Oct-11-2023; OHLC from 2023-05 | mechanism verified on BTC; SUI numbers re-pulled at build | backtest, mainnet feed id |
| S3 | Coinbase + OKX + Bybit 1m OHLCV via thin fetch wrappers | disp (cross-venue), div reference composite | years on all three | keyless, verified live from VPS | both live and backtest |
| S4 | Binance live `/api/v3/depth` plus DeepBook on-chain `get_level2_ticks_from_mid` | imb, spread (on-chain liquidity) | snapshot only, no free L2 history | live-only | live only |
| S5 | Pyth hermes-beta `/v2/updates/price/latest` (testnet) | live SUI/USD price+conf the contract consumes | live | live | live runtime, not a backtest source |

There are two Pyth feed ids, and they are genuinely different feeds of the same logical SUI/USD pair. Each 404s on the other's host.

- Live runtime (S5, hermes-beta testnet): `0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266`. This is the feed the contract and dashboard consume. Returns a live price around $0.74.
- Backtest (S2 Benchmarks, mainnet): `0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744`. SUI conf/price for the historical run. The beta id returns nothing on Benchmarks.

Resolve the live id from the installed pyth-sui-js / hermes feed list at startup. Don't hardcode it. Bracket queries use bare 64-hex (`?ids[]=50c6…fea266`) and must be even-length, or you get an "odd number of digits" 400. Call out the two-feed split in the methodology doc.

A few candidate sources got dropped. CCXT as a dependency, in favor of about 60 lines of hand-rolled keyless fetch wrappers around the three raw endpoints already verified working. CCXT isn't installed, runs to tens of MB, and its per-venue paging is exactly what version drift breaks, so it's over-tooling for a 3-venue, one-endpoint need. Also out: bookTicker (dead since ~2024-12), Kraken REST OHLC (720-candle wall), and CoinGecko / CryptoCompare-minute / Coinpaprika (aggregate-only or under 90 days of minute retention). Binance.com live REST is not used for the backtest because of US 451 risk; the backtest pulls Binance from the static archive instead, which has no geo-block.

One useful find: the "historical depth not available" gap is narrower than it first looked. Binance futures bookDepth is free at 30s granularity back to 2023, and Binance futures publishes mark, index, and last 1m klines for free, so `|ln(mark) − ln(index)|` is a real oracle-vs-execution divergence backtest on Oct 10 with no depth problem at all. That mark/index/last triple now leads the demo.

## Feature vector (k = 6)

Built every tick. Live, that's every few seconds; in backtest, every bar on the canonical grid with depth forward-filled under max-staleness. Every feature is engineered unit-free and roughly stationary so the EWMA covariance stays well-conditioned.

Tier 1 is fully backtestable on free history. Four features, and they carry every historical detection.

- `disp`, cross-venue dispersion: `1e4 · stdev_i(ln p_i)` over 1m mid/close across Coinbase, OKX, Bybit, Binance-archive (plus the Pyth composite live), in bps. Source S3 + S1.
- `div`, oracle-vs-market divergence: `1e4 · |ln(p_pyth) − ln(p_cex_median)|`, in bps. Source S2. The backtest substitutes Binance futures `|ln(mark) − ln(index)|` (real oracle-vs-exec) and/or CEX-composite-vs-spot; live uses Pyth vs DeepBook mid. The proxy is stated openly.
- `volvel`, realized-vol velocity: `rv_t = EWMA_30(r²)` with `r = Δln p`, then `volvel_t = (rv_t − rv_{t−w})/(rv_{t−w}+ε)`, `w ≈ 30`. Source S1 1s klines. This one fires first in a flash crash.
- `divvel`, divergence velocity: `div_t − div_{t−w}`. A widening gap matters more than a wide-but-stable one, and tracking the change kills decimals-offset false positives. Source S2/S1.

Tier 2 is live-only, the on-chain liquidity features. These two complete the 6-D vector live but only have a coarse proxy in backtest.

- `imb`, depth imbalance: `(bidDepth − askDepth)/(bidDepth + askDepth)` over top-K levels within ±X bps of mid, in [−1, +1]. Source S4 (DeepBook L2 + CEX `/depth`).
- `spread`, effective spread / thinning: `1e4 · (bestAsk − bestBid)/mid`, optionally divided by top-of-book size, in bps. Source S4.

Full historical L2 depth isn't free, so `imb` and `spread` are live-only. In the demo they run on real DeepBook on-chain plus real CEX `/depth`, giving the full 6-D vector. The reported historical backtest is the k=4 Tier-1 model. Depth is not folded into a feature slot as a proxy. Instead the bookDepth/spread proxy shows up only as a separate directional-sanity annex chart answering one question: does depth deteriorate and imbalance spike during stress? Yes, sign and direction only. It's labeled as a coarse proxy (±band notional, 30s, a different venue and instrument than on-chain DeepBook), illustrative and not the same estimator. Tier 1 alone detects all four events, so this costs nothing.

The math is identical at k=6 live and k=4 reported-backtest. You instantiate a smaller covariance and nothing else changes. The dashboard always shows all six. Only the reported historical model is k=4.

## Model

Pure TS, around 150 lines, no deps beyond a small Cholesky and a `gammainc`. O(k²) per tick. Let `x_t ∈ ℝ^k` (k=6 live, k=4 reported backtest).

EWMA mean: `μ_t = λ·μ_{t−1} + (1−λ)·x_t`, λ = 0.97.

EWMA covariance: `Σ_t = λ_c·Σ_{t−1} + (1−λ_c)·(x_t − μ_{t−1})(x_t − μ_{t−1})ᵀ`, λ_c = 0.94. Update with the pre-update mean `μ_{t−1}` so there's no look-ahead. Store flat symmetric k×k.

Shrinkage / diagonal loading: `Σ̃ = (1−δ)·Σ_t + δ·(tr(Σ_t)/k)·I`, δ = 0.15, plus `ε·I` with ε = 1e-9. This is a fixed ridge, Ledoit-Wolf-style but with δ constant, not the full data-driven LW estimator. Name it that way.

Squared Mahalanobis distance: `d²_t = (x_t − μ_t)ᵀ Σ̃⁻¹ (x_t − μ_t)` via Cholesky `Σ̃ = LLᵀ`. Solve `L y = (x − μ)`, then `d² = yᵀy`.

Map d² to 0–100. Under an MVN null `d² ~ χ²(k)`, so the nominal score is `100 · F_{χ²,k}(d²_t) = 100 · P(k/2, d²/2)` (regularized lower incomplete gamma, a ~25-line `gammp`). Engineered features are heavy-tailed and autocorrelated, though, so the empirical d² deviates from χ²(k). During the threshold sweep, compute the empirical CDF of d² on the calm months already loaded and report the gauge bands as calm-period percentiles, noting χ²(k) as the nominal reference and how close the empirical percentiles land. The claim is "score = p means more extreme than p% of calm-market configs, empirically calibrated," not a clean χ² probability.

Per-feature contribution: `z = Σ̃⁻¹(x − μ)`, `c_i = (x_i − μ_i)·z_i`, and `Σ_i c_i = d²` exactly. Bar height is `c_i/d²`. Negative `c_i` (correlation flips) is the Kritzman-Li correlation-surprise signal; clamp at 0 for display, keep signed in the event log. This drives the Scene-2 demo beat.

The estimator is not new. Mahalanobis-of-returns is the Kritzman-Li Financial Turbulence Index (Kritzman & Li, FAJ 66(5), 2010); the EWMA covariance is RiskMetrics (J.P. Morgan, 1996). What's new is the application — oracle-vs-CLOB-vs-CEX divergence as a real-time breaker, plus the on-chain enforcement. The math is borrowed.

### Score to parameters

The agent emits a target the contract clamps. Map score to a fraction `f ∈ [0,1]` of the corridor (f=1 is the loosest baseline, f=0 the tightest floor): `target_p = floor_p + f(score)·(baseline_p − floor_p)`. The shape is a dead-band plus logistic:

- `score < 60`: `f = 1` (dead-band, no thrash on noise).
- `60 ≤ score ≤ 95`: `f = 1/(1+exp(γ(score − s_mid)))`, s_mid = 80, γ = 0.15, normalized so f(60)=1 and f(95)=0.
- `score > 95`: `f = 0` (param floor).

Worked through, with a `max_ltv` corridor of [55%, 75%] and a `borrow_cap` corridor of [40%, 100%]: a score ≤60 gives 75% / 100%; score 75 gives f=0.73, so 69.6% / 83.8%; score 80 gives f=0.50, so 65% / 70%; score 90 gives f=0.12, so 57.4% / 47.2%; score ≥95 gives f=0, so 55% / 40%.

The ratchet is enforced twice for redundancy. On the agent side, `request = min(target_now, last_applied)`, so it never even asks to loosen mid-episode; RELAX is contract-only on a sustained all-clear. On the contract side, which is authoritative, it clamps to [floor, baseline], rejects any looser-than-current component, and takes `tighter_of(agent_target, contract_own_target)`. `liq_buffer` is deliberately not in this map. It's retroactive, so tightening it could force liquidations and harm users, which makes it DAO-only. The 0–100 score rides along as an advisory event field. The contract acts on the clamped `ParamRequest` and its own on-chain re-derivation, never on the number, so "its score is never trusted" is literally true.

## Validation without labels

Ticks are never labeled. Mark a handful of event windows from public post-mortems instead (reading a news article is not labeling training data). Three events make a study rather than an anecdote.

The headline is Oct 10 2025, and the lead config uses the safer real-divergence data.

Lead config (B): Binance futures mark/index/last 1m klines for BTCUSDT plus alt perps (AAVE, AVAX, SOL), window 20:50–21:30 UTC, the cascade peak ($3.21B liquidated in the single 21:15 minute). `div = |ln(mark) − ln(index)|` plus `volvel` from last-price. Expect `volvel` to fire first around 20:50 and `div`/`divvel` to spike as books thin into 21:15. This is real-data oracle-vs-execution divergence, uncontested, so it leads both the demo and the methodology doc.

Secondary headline (A): Binance `USDEUSDT` spot vs $1.00 fair value, window 21:36–22:16 UTC, Binance's own stated USDe/wBETH/BNSOL dislocation. `div = (1 − p_USDe)/1`. Expect `div` to be the lead signal, near-instant. USDEUSDT listed ~Sep 2025, so there's only about a month of pre-crash baseline. Disclose that and warm the EWMA covariance on BTC/ETH/SOL long history, using USDe only for the divergence dimension. Per-venue lows are re-derived from the downloaded data, not asserted: the earlier "Bybit ~$0.92" figure is dropped because contemporaneous reporting puts non-Binance slips in the single-digit percent range and the deep ~$0.65 print was Binance-only.

Cross-validation cases:

- USDC depeg, Mar 11 2023 (~02:00 UTC, bottomed ~$0.87): a fast, clean single-asset divergence with a crisp recovery, good for clean latency and a clean FP baseline. Binance `USDCUSDT` spot. No Pyth conf (pre-Oct-2023), so price comes from Binance klines only.
- stETH, Jun 10–13 2022 (Curve ratio ~0.93–0.94): a slow episodic divergence, the Scene-2 archetype, where `div` and `divvel` carry it and vol stays muted. The clean signal is the on-chain Curve pool ratio, and no free keyless historical Curve-ratio endpoint is confirmed yet. So stETH is optional. Spend up to 20 minutes in the first build hour trying to pin a free source (a public Curve subgraph, or a free archive-RPC `get_dy` replay). If nothing pins, the synthetic slow-drift trace becomes the canonical Scene-2 beat and stETH drops to a one-line mention. Don't silently fall back to a Binance stETH/ETH kline and present it as the Curve ratio.

LUNA/UST (May 2022) is an optional bonus chart only. It's a fundamental algorithmic-stablecoin collapse, not a trusted-oracle artifact, so present it as an extreme divergence and vol-velocity stress test, never as an oracle attack the model would catch. `volvel` is available since S1 spot-1s reaches 2022.

### Measured error rate

For an unsupervised detector, state the denominator plainly. The measured error rate is three things: per-event detection latency (in-sample, n=3 case studies); false-alarm episodes per day on held-out calm months (the FP rate); and a synthetic-injection detection-rate curve to give a real recall number without labeling. Say explicitly that recall and precision over real events are not reported, because the unsupervised design has no labeled positive set by choice. The three events are detection-latency case studies, and detection-rate-vs-magnitude comes from synthetic injection.

Detection lead time: define `t_visible` objectively per event (first 1-min bar with return ≤ −5%, or the documented onset timestamp). `t_firstAlert` is the first tick with `score ≥ τ` that stays above for N consecutive ticks (debounce). `lead = t_visible − t_firstAlert`. Target headline: flagged 40–120s before the −5% bar on Oct 10.

False-positive rate: on a pinned calm month with no documented event, report distinct alarm episodes per day at τ, where a 5-min debounced alarm counts as one episode, not raw ticks. Target around 0.3 false alarms/day at τ=90. The calm baseline uses 1m data, not 1s, which bounds download volume; volvel on 1m is fine for a calm baseline. Pin one quiet month per asset away from all events.

Synthetic-injection detection curve: inject N divergence/vol shocks of varying magnitude into the calm data and measure detection rate vs shock magnitude. This turns n=3 into a defensible detection curve, free, no labeling.

Threshold sweep: sweep τ from 50 to 99 and plot (lead-time plus synthetic-detection-rate) against (false-alarms/day on the calm month). Pick τ at the knee. This is the legitimate label-free hyperparameter search for {λ, λ_c, δ, s_lo}. Bind the chosen τ to both the dashboard gauge bands and the contract CAUTION thresholds.

State it plainly in the writeup: calibrated on these 3 historical episodes; lead times are in-sample; false-alarm rate and synthetic detection-rate are on held-out calm months.

## Risks and caveats

1. Order-book depth history isn't freely available, so `imb`/`spread` are live-only. They run live (real DeepBook on-chain plus real CEX `/depth`) in the demo at full 6-D. The reported historical backtest is k=4 Tier-1. The bookDepth/spread proxy appears only as a separate directional-sanity annex (±band notional, 30s, a different venue and instrument than on-chain DeepBook; it shows the sign of depth deterioration, not the same estimator). Never imply you backtested real L2 DeepBook depth, and never fold the proxy into the reported feature slot. Tier 1 carries every historical detection.

2. Prior-art honesty. Name Kritzman-Li and RiskMetrics; claim novelty only on application plus on-chain enforcement. Never "novel ML." Shrinkage is "Ledoit-Wolf-style, δ fixed," a constant ridge, not data-driven LW.

3. The USDe calibration window is short, about a month pre-crash. Disclose it; warm the EWMA covariance on BTC/ETH/SOL long history and use USDe only for the divergence dimension.

4. Pyth signed-with-conf history starts ~Oct-11-2023 (Sep-29-2023 returns 404), so LUNA-2022 and USDC-Mar-2023 can't use Pyth conf; use Binance klines for price and scope conf to the Oct-10 headline. stETH's cleanest source is the on-chain Curve ratio (free source not yet pinned, demoted if not found). Oracle staleness `conf`/age is a live-only / proxied feature: Benchmarks is ~1 Hz resampled, so the `prev_publish_time` gap is always ~1s and doesn't reflect real on-chain staleness, same discipline as the depth caveat.

5. In-sample tuning: τ/λ/δ are tuned on the same 3 events they're measured on. Disclose "lead times in-sample; FP rate and synthetic detection-rate on held-out calm months." The result is genuinely good, so the disclosure costs nothing.

6. IsolationForest → ONNX → onnxruntime-node is skipped for v1. It breaks the pure-TS, unsupervised, no-training-set, reproducible-from-free-data story, adds a Python plus native-dep toolchain and a shipped artifact, and adds nothing to the must-haves (the empirically-calibrated χ²-CDF score is better-defined than an IsolationForest's arbitrary score). Keep it as a one-paragraph future-work toggle. If asked whether there's a supervised component, the better answer is "deliberately no, unsupervised-by-design generalizes to novel anomaly types, and the Oct-10-2025 catch post-dates any plausible training cutoff."

7. Operational data watch-outs. Binance.com live REST geo-blocks the US (451), so the backtest uses the static archive (no geo-block). Per-source timestamp encodings differ, so normalize all to epoch-ms at ingest: spot-1s µs ÷1000; bookDepth wall-clock strings via `Date.parse(...+'Z')`; OKX/Bybit ms strings; Coinbase epoch-seconds ×1000; Coinbase and Bybit return newest-first, so reverse. OKX deep history needs `history-candles` (not `/candles`) at 300/req; Coinbase is ~300/req; both need paging for the full window plus warm-up. Kraken REST is unusable (720-candle wall). Pyth/Hermes require an API key after July 31 2026 (fine for the June-21 submit and the July 20–21 Demo Day; note it in the README). Live Tier-2 depth reads ids live from the SDK `utils/constants.ts`, never frozen.

8. The SUI conf-width figures from the earlier draft (0.073% → 1.75%/5.09%) were not verified from fetched data; the only Benchmarks data in-repo is BTC. The mechanism is verified (1s signed price+conf, conf populated, reaching Oct 2025, and the SUI live feed confirmed reachable), but the SUI conf-width numbers are re-pulled and re-derived during H5–7 against the mainnet id, then either reproduced exactly or the claim downgraded.
