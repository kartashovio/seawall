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

A note on how to describe Oct 10. It was a venue-isolated oracle dislocation: Binance used its own thin orderbook as the price while Curve and redemptions held. Don't call it a USDe depeg or collapse (Ethena's founder is on record that it did not depeg), and don't claim it "would have prevented the crash." The accurate statement is that the model flagged the USDe/wBETH/BNSOL collateral mispricing in its early minutes and would refuse to mark collateral down on a single divergent venue. The macro tariff selloff is real news, not an oracle anomaly. The "$19B largest ever" figure is CoinGlass-sourced and contested, so say "largest recorded/tracked."

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

## Repo layout and deps

pnpm monorepo. The v1/v2 split matters. The agent package stays on `@mysten/sui` v1 (pyth-sui-js@3.0.0 needs it), while the DeepBook-v3 SDK and dashboard live on v2 in separate packages. A peer-dep warning when installing them alongside v1 is expected and fine. The ML core has no Sui dep at all, so `packages/model` is importable by the v1 agent and the backtest harness without dragging SDK versions in. Current repo state: Node 24.16.0, pnpm 11.5.2, agent already on `@mysten/sui@^1.45.2` plus `pyth-sui-js@3.0.0`.

```
seawall/                             (repo root)
├─ README.md  ·  Architecture_ru.md
├─ pnpm-workspace.yaml               # packages: ["packages/*"]
├─ packages/
│  ├─ model/                         # pure TS, zero deps, the ML core, no Sui
│  │  ├─ src/
│  │  │  ├─ ewma.ts                  # EWMA mean+cov recurrences
│  │  │  ├─ linalg.ts                # Cholesky solve + matrix helpers
│  │  │  ├─ chisq.ts                 # gammp / regularized incomplete gamma
│  │  │  ├─ mahalanobis.ts           # d² + per-feature contribution
│  │  │  ├─ score.ts                 # χ²-CDF + empirical-percentile calibration; logistic dead-band map
│  │  │  ├─ align.ts                 # canonical-grid as-of join + max-staleness
│  │  │  ├─ features.ts              # x_t assembly from aligned inputs (the one shared path)
│  │  │  └─ index.ts
│  │  └─ test/*.test.ts              # unit tests (div==0, contribution-sum, monotone map, cross-source epoch-ms)
│  ├─ shared/                        # pure TS types + constants, no deps
│  │  └─ src/
│  │     ├─ constants.ts             # λ, λ_c, δ, ε, s_lo, s_hi, s_mid, γ, corridors, τ, gauge bands (single source)
│  │     ├─ feeds.ts                 # both named feed ids, pool ids
│  │     └─ types.ts                 # FeatureVector, ParamRequest, RiskEvent
│  ├─ agent/                         # @mysten/sui v1 + pyth-sui-js, runtime + backtest driver
│  │  ├─ src/
│  │  │  ├─ sources/
│  │  │  │  ├─ cex.ts                # hand-rolled keyless fetch: Coinbase/OKX/Bybit (live + backtest)
│  │  │  │  ├─ binanceArchive.ts     # data.binance.vision zip loader (per-source epoch-ms normalizer)
│  │  │  │  ├─ pyth.ts               # hermes-beta live (beta id) + Benchmarks historical conf (mainnet id)
│  │  │  │  └─ depth.ts              # live DeepBook L2 + CEX /depth (live only)
│  │  │  ├─ tick.ts                  # live loop: gather → align → features → model → ParamRequest → PTB
│  │  │  ├─ backtest.ts              # replay loop over cached data → scores + metrics
│  │  │  └─ metrics.ts               # lead-time, FP/day, synthetic-injection, ROC sweep
│  │  └─ package.json                # @mysten/sui ^1.45.2, pyth-sui-js 3.0.0
│  └─ dashboard/                     # later: Vite SPA on @mysten/dapp-kit v2, out of scope here
├─ data/                             # cache dir (gitignored except README + checksum manifest)
│  ├─ binance/  cex/  pyth/          # downloaded zips / json caches
│  └─ events.json                    # the marked event windows (start/end UTC), not labels
└─ docs/ml-plan.md                   # this document
```

Deps: `packages/model` and `packages/shared` have zero runtime deps (TS plus vitest in dev). `packages/agent` keeps `@mysten/sui@^1.45.2` and `@pythnetwork/pyth-sui-js@3.0.0`, and adds `unzipper` or `adm-zip` to read Binance zips plus `csv-parse` (or hand-split, the CSV has no header). Node-native `fetch` for the REST calls. No ccxt. No onnxruntime-node, Python, or IsolationForest in v1. Root dev deps: `typescript`, `vitest`, `tsx`.

Fetch scripts, in order:

1. `binanceArchive.ts`: download and cache zips from `data.binance.vision`. Functions `fetchSpot1s(sym,date)`, `fetchFutMarkIndexLast(sym,date)`, `fetchBookDepth(sym,date)`. The per-source epoch-ms normalizer is the tricky part: spot-1s openTime is 16-digit microseconds in 2025, so divide by 1000, while bookDepth timestamps are second-resolution wall-clock strings (`'2025-10-10 00:00:07'`), so `Date.parse(...+'Z')`. URLs: `data/spot/daily/klines/{SYM}/1s/{SYM}-1s-{DATE}.zip`, `data/futures/um/daily/{markPriceKlines|indexPriceKlines|klines}/{SYM}/1m/…`, `data/futures/um/daily/bookDepth/{SYM}/{SYM}-bookDepth-{DATE}.zip`. Verify the `.CHECKSUM` sibling.
2. `cex.ts`: hand-rolled keyless fetch. Coinbase `/candles` (epoch-seconds, ×1000, returns descending so reverse), OKX `/market/history-candles` (epoch-ms strings, 300/req, paging), Bybit `/v5/market/kline` (epoch-ms strings, descending so reverse). Write the since+limit paging loop before the Config-B/Config-A runs. One path for live and backtest.
3. `pyth.ts`: historical, loop `GET benchmarks…/v1/updates/price/{ts}/60?ids=0x{MAINNET}&parsed=true` (returns a list, iterate `item.parsed[0].price`); OHLC via the TradingView shim. Live, `hermes-beta /v2/updates/price/latest?ids[]={BETA}` (bracket syntax, even-length hex).
4. `align.ts` + `backtest.ts`: load cache, `align.ts` normalizes every source to epoch-ms, sorts ascending, as-of-joins onto the canonical grid, `features.ts` builds `x_t` (k=4 reported path), stream through the detector to per-tick scores and contributions, then `metrics.ts`.

## Timeline (2 working days)

Honest total is two days. Day 2 is required deliverables, not slack. Live Tier-2 depth wiring is out of this plan entirely; it belongs to the live-agent/dashboard build, depends on the running agent and DeepBook IDs, and doesn't bear on the ML core or backtest.

Day 1, model plus data plus backtest, about 8 effective hours:

- H0–0.5, scaffold and alignment contract. `pnpm-workspace.yaml`; `packages/model`, `shared`, wire `agent`; `constants.ts` with every param (λ=0.97, λ_c=0.94, δ=0.15, ε=1e-9, s_lo=60, s_hi=95, s_mid=80, γ=0.15, corridors, τ, gauge bands) plus both named feed ids. Pin the alignment contract: canonical grid 1s on Oct-10 windows and 1m elsewhere; as-of/forward-fill with explicit max-staleness, dropping a venue's dispersion contribution if its last print is more than Ns stale rather than forward-filling a dead venue into a fake-tight cluster; open-vs-close convention decided once. `data/.gitignore`. Spend ≤20 min testing the stETH free-source; if it doesn't pin, demote stETH.
- H0.5–3, model core (pure TS, the half-day that matters most). `ewma.ts`, `linalg.ts`, `chisq.ts`, `mahalanobis.ts` (assert `Σc_i == d²`), `score.ts`. TDD against known-d² fixtures, `gammp` vs a table, `div==0` on equal prices, the contribution-sum identity, the monotone tighten-only map, and a cross-source epoch-ms alignment test (a known wall-clock minute maps to the same epoch-ms across all five adapters). Network-free.
- H3–5, data adapters, download everything first. `binanceArchive.ts` (µs and string-ts normalizers plus checksum), `cex.ts` (3-venue hand-rolled, paging loop written here), `pyth.ts` (Benchmarks mainnet id plus shim). Pull all needed historical data to `data/` in one early pass before writing the backtest loop, so an endpoint hiccup later can't stall the run. Smoke all three CEX venues to Oct 10 in the first 20 minutes so a paging surprise surfaces early.
- H5–7, backtest harness and Oct 10. `align.ts`, `features.ts` (k=4 reported path), `backtest.ts`, `metrics.ts`. Run Config B (mark/index alt perps, 20:50–21:30), the lead, then Config A (USDe spot, 21:36–22:16). Re-derive SUI conf-width from the fetched SUI series (mainnet id) to replace the unverified table numbers. Confirm early-fire plus contribution bars.
- H7–8, secondary cases, ROC, calibration. USDC-Mar-2023 (plus stETH if pinned), then the synthetic-injection sweep, then empirical-CDF calibration on the calm month, then a τ sweep 50→99 to the knee, then lock τ into `constants.ts`. Dump lead-time, FP/day, the synthetic-detection curve, and ROC to `data/backtest-report.json`.

Day 2, deliverables plus slack: METHODOLOGY.md, the synthetic Scene-2 joint-anomaly trace and chart, the one-command `pnpm backtest` entry plus checksum manifest, and slack for the known edge cases (µs/string timestamps, OKX/Coinbase/Bybit paging and descending order, Cholesky PD).

Download volume is bounded. Oct-10 1s spot for ~6 symbols (~2.8 MB/zip each) plus futures mark/index 1m (tiny) plus USDC-Mar-2023 1s plus one calm month at 1m per asset (not 1s) keeps the total well under a GB and parse time in seconds.

## Deliverables

METHODOLOGY.md outline:

1. Problem and scope: oracle/price-anomaly class only, not key/governance/logic-bug/credit. One line noting that human override / DAO-unfreeze is contract-side (a `&GovernanceCap`-gated fn), out of this ML plan's scope.
2. Feature vector: the 6 named features, each with formula, units, source, and Tier-1/Tier-2 backtestability. The depth caveat stated plainly. Pin the exact feed id per asset per source.
3. Model: EWMA mean+cov (λ, λ_c), shrinkage (δ, fixed LW-style), Mahalanobis d², χ²-CDF→0-100 plus empirical calibration, per-feature contribution. A prior-art box naming Kritzman-Li and RiskMetrics, with novelty claimed only on application plus on-chain enforcement.
4. Score as empirically-calibrated probability: score=p means more extreme than p% of calm-market configs (χ²(k) nominal reference, empirical-percentile calibrated); gauge bands are percentiles, not arbitrary dials.
5. Tighten-only mapping: score→{max_ltv, borrow_cap}, the corridor, the double ratchet, why liq_buffer is excluded.
6. Validation: the 3 events, the label-free protocol, the measured error rate as latency plus FP/day plus the synthetic-injection curve (with the no-recall-by-design point stated), and the in-sample/held-out disclosure.
7. Honest caveats: the risk list below, including the two-feed-id (live-beta vs backtest-mainnet) caveat.
8. Reproduce: exact `data.binance.vision` URLs plus raw CEX calls, with `events.json`, a checksum manifest, and a single `pnpm backtest` entry so a judge re-runs the whole error-rate report in minutes.

When writing the methodology, describe the contract as a contract-only FREEZE on top of the 3-layer design. The agent does not modulate the freeze threshold.

Backtest report shape (`data/backtest-report.json` plus rendered table/charts): per event, the window (UTC), `t_visible`, `t_firstAlert`, lead-time (s), peak score, and top-3 contributing features at first alert; per calm month, FP episodes/day at τ; the synthetic detection-rate-vs-magnitude curve; the ROC (lead/detection-rate vs FP/day across τ=50→99) with the knee marked; one time-series chart per event (price plus feature z-scores plus the 0–100 score, with vertical lines at `t_firstAlert` and `t_visible`); plus a separate depth directional-sanity annex chart, clearly labeled as a coarse proxy outside the reported model.

Scene-2 joint-anomaly demo beat: replay a slow/episodic divergence (the synthetic slow-drift is canonical; stETH-Curve only if its free source pinned). Show the dashboard with every univariate z-score visibly below its single-feature threshold (no individual `if` would fire), yet the Mahalanobis score climbs past τ because the joint configuration (divergence rising while dispersion widens while vol accelerates, a combination the calm covariance says shouldn't co-occur) is improbable. The per-feature contribution bars show no single feature dominating (interaction plus a negative correlation-surprise term). This is the clearest proof the model does real work on CAUTION rather than running a hidden threshold.

## Risks and caveats

1. Order-book depth history isn't freely available, so `imb`/`spread` are live-only. They run live (real DeepBook on-chain plus real CEX `/depth`) in the demo at full 6-D. The reported historical backtest is k=4 Tier-1. The bookDepth/spread proxy appears only as a separate directional-sanity annex (±band notional, 30s, a different venue and instrument than on-chain DeepBook; it shows the sign of depth deterioration, not the same estimator). Never imply you backtested real L2 DeepBook depth, and never fold the proxy into the reported feature slot. Tier 1 carries every historical detection.

2. Prior-art honesty. Name Kritzman-Li and RiskMetrics; claim novelty only on application plus on-chain enforcement. Never "novel ML." Shrinkage is "Ledoit-Wolf-style, δ fixed," a constant ridge, not data-driven LW.

3. Oct-10 narration. Say "venue-isolated oracle dislocation," never "USDe depegged/collapsed." Say "flagged the collateral mispricing early and refused to act on one divergent venue," never "would have prevented the crash." Say "$19B largest recorded/tracked" (CoinGlass-sourced, contested). Per-venue lows are re-derived from downloaded data, never asserted; the "$0.92 Bybit" specific is dropped, the deep ~$0.65 print was Binance-only, other venues single-digit percent.

4. The USDe calibration window is short, about a month pre-crash. Disclose it; warm the EWMA covariance on BTC/ETH/SOL long history and use USDe only for the divergence dimension.

5. Pyth signed-with-conf history starts ~Oct-11-2023 (Sep-29-2023 returns 404), so LUNA-2022 and USDC-Mar-2023 can't use Pyth conf; use Binance klines for price and scope conf to the Oct-10 headline. stETH's cleanest source is the on-chain Curve ratio (free source not yet pinned, demoted if not found). Oracle staleness `conf`/age is a live-only / proxied feature: Benchmarks is ~1 Hz resampled, so the `prev_publish_time` gap is always ~1s and doesn't reflect real on-chain staleness, same discipline as the depth caveat.

6. In-sample tuning: τ/λ/δ are tuned on the same 3 events they're measured on. Disclose "lead times in-sample; FP rate and synthetic detection-rate on held-out calm months." The result is genuinely good, so the disclosure costs nothing.

7. IsolationForest → ONNX → onnxruntime-node is skipped for v1. It breaks the pure-TS, unsupervised, no-training-set, reproducible-from-free-data story, adds a Python plus native-dep toolchain and a shipped artifact, and adds nothing to the must-haves (the empirically-calibrated χ²-CDF score is better-defined than an IsolationForest's arbitrary score). Keep it as a one-paragraph future-work toggle. If asked whether there's a supervised component, the better answer is "deliberately no, unsupervised-by-design generalizes to novel anomaly types, and the Oct-10-2025 catch post-dates any plausible training cutoff."

8. Operational data watch-outs. Binance.com live REST geo-blocks the US (451), so the backtest uses the static archive (no geo-block). Per-source timestamp encodings differ, so normalize all to epoch-ms at ingest: spot-1s µs ÷1000; bookDepth wall-clock strings via `Date.parse(...+'Z')`; OKX/Bybit ms strings; Coinbase epoch-seconds ×1000; Coinbase and Bybit return newest-first, so reverse. OKX deep history needs `history-candles` (not `/candles`) at 300/req; Coinbase is ~300/req; both need paging for the full window plus warm-up. Kraken REST is unusable (720-candle wall). Pyth/Hermes require an API key after July 31 2026 (fine for the June-21 submit and the July 20–21 Demo Day; note it in the README). Live Tier-2 depth reads ids live from the SDK `utils/constants.ts`, never frozen.

9. The SUI conf-width figures from the earlier draft (0.073% → 1.75%/5.09%) were not verified from fetched data; the only Benchmarks data in-repo is BTC. The mechanism is verified (1s signed price+conf, conf populated, reaching Oct 2025, and the SUI live feed confirmed reachable), but the SUI conf-width numbers are re-pulled and re-derived during H5–7 against the mainnet id, then either reproduced exactly or the claim downgraded.

## Confidence

High, around 8.5/10, that the core is doable in two days, fully free, keyless, and label-free. The core here means the k=4 Tier-1 EWMA-Mahalanobis detector plus Oct 10 plus at least one secondary plus the measured-error-rate report. Every source it depends on was confirmed reachable for Oct-10-2025 (the S1 archive, Benchmarks mainnet, all three CEX venues, hermes-beta live), the math is ~150 LOC of network-free pure TS that test-drives fast, and the no-label design holds (event windows are for measuring latency and FP, never for training). Day 1 is tight but real for model plus data plus backtest; day 2 is the required deliverables.

The biggest residual risk is cross-venue time alignment and data-wrangling overrun on Day 1, H3–7. Four-plus timestamp encodings, two descending-order feeds, two venues needing paged requests, and an as-of join whose max-staleness rule directly drives the calm-period covariance and therefore the headline FP number. If alignment is sloppy, the FP metric degrades silently without throwing, which is what makes it the top risk. It's mitigated by pinning it as the first block, downloading everything first, a cross-source epoch-ms unit test, and a 1m calm baseline to bound volume, but it's the one place an under-budgeted hour cascades into the Day-2 deliverables. Secondary residual: the stETH Scene-2 case has no confirmed free historical Curve-ratio source, handled by demoting to the synthetic slow-drift trace if it doesn't pin in the first hour.
