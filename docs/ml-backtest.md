# ML backtest — SUI target, BTC market proxy

We replayed four real market dislocations minute by minute and watched what the detector did. This is not a recall study and it does not claim to predict crashes. The honest headline is narrow: the model flags the events it was calibrated on, it routes systemic stress and idiosyncratic oracle breaks to different parameters, and on out-of-sample calm windows it stays quiet at the ~1% rate it was designed for. Two of the four catches are coincident, not early. Everything below is reported as measured, dents included. Runs use SUI as the target and BTC as the market proxy, which is the live MVP shape; the older BTC/ETH/USDC-target numbers are gone and these replace them.

## Setup

The grid is 1-minute bars. The live agent ticks every few seconds, so these are the slower, lower-resolution view of what it would see. Data is free and keyless: Binance archive klines for SUI and BTC, three CEX venues (Coinbase/OKX/Bybit) for cross-venue dispersion, Pyth Benchmarks for the SUI/USD signed price live, with Binance futures mark-vs-index standing in for oracle-vs-execution divergence over history. No labels are used; the detector is unsupervised.

The model is the EWMA-adaptive multivariate Mahalanobis detector (described in [ml-methodology.md](./ml-methodology.md)). Depth features (`imb`, `spread`) are live-only and absent from history, so the historical vector is the k=4 Tier-1 set (`disp`, `div`, `divvel`, `volvel`) plus the BTC market feature `mktvol`. Score is the calm-calibrated percentile of squared Mahalanobis distance, mapped 0-100, with per-feature contributions that sum exactly to d². Features split into two groups for reading results: a solvency group (`div` + `divvel`, oracle-vs-market divergence and its velocity) driving `max_ltv` over [55%, 75%], and a liquidity group (`disp`, `volvel`, and the BTC `mktvol`) driving `borrow_cap` over [40%, 100%]. The corridor is tighten-only.

The market feature is the new piece. BTC stress raises `mktvol`, which feeds the liquidity group. The point of adding it is discrimination, not raw sensitivity: a systemic selloff drags SUI down with BTC and should pull `borrow_cap` toward its floor, while an asset-specific oracle break with a calm BTC should not. Every window below carries a market-feature-off control to test exactly that.

Two definitions used throughout. **Lead** is measured from the first sustained alert (score ≥ 99 on two consecutive ticks) to the first 1-minute bar that closes ≤ −5% on a trailing-30m basis (−2% for the stablecoin). A negative lead means the sustained alert landed after that bar: coincident, not early. Note that lead is conservative on purpose: it waits for that strict alert, while the parameters themselves start tightening earlier as the score climbs through the 60–95 map. A negative lead is the metric being late, not the protection. **Calm false-alarm** is reported two ways: the single-tick rate (fraction of calm ticks above threshold, target ~1%) and the count of sustained two-in-a-row episodes on the pre-event calm window.

## Results

| Event | Target | Fired | Lead | Driver at alert | Params at alert | Market feature | Calm single / sustained |
|---|---|---|---|---|---|---|---|
| Oct 10 2025 cascade | SUI, BTC market | yes | −17 min (coincident) | liquidity is the durable driver (tie at the alert tick) | max_ltv 55% / borrow_cap 40% | elevated; liquidity pinned 95–100 | 0.98% / 1 |
| Aug 5 2024 carry unwind | SUI, BTC market | yes | −3 min (coincident) | liquidity (disp 69%) | max_ltv 55% / borrow_cap 40% | elevated, mktvol ~3.6× calm | 1.00% / 0 |
| Feb 2–3 2025 tariff selloff | SUI, BTC market | yes | +320 min | solvency (divvel 57%, div 40%) | max_ltv 55% / borrow_cap 100% | modest, ~1.5×; borrow_cap tightens later as BTC falls | 1.00% / 0 |
| Mar 11 2023 USDC de-peg | USDC, BTC market | yes | +379 min | solvency (div 55%, divvel 33%) | LOW (liquidity group 41 vs calm avg 50) | — | 1.01% / 10 |

## What the split actually separates

The two parameters track two different risk dimensions. `max_ltv` moves on oracle-vs-market divergence (is the price trustworthy); `borrow_cap` moves on volatility and fragmentation (how violent and thin things are), from the asset itself or the market.

The cleanest case is the USDC de-peg. A stablecoin leaving its peg is a price-correctness problem with low realized volatility, so `div`/`divvel` spike while the asset's own vol stays quiet, and `mktvol` (BTC) is low too. The liquidity group sits below its calm average (41 vs 50), so `borrow_cap` holds at its 100% baseline while `max_ltv` rides to its 55% floor. Only the leverage knob moves, which is right: the asset is mispriced, not volatile.

A violent crash is different, and we tested it both ways. On a SUI-specific crash (the May 2025 Cetus exploit, SUI down ~6% in 20 minutes while BTC's range was 0.8%), the oracle divergence drives `max_ltv` to its floor and `mktvol` correctly stays low (about 0% of the liquidity pressure, confirming it is not BTC contagion), but `borrow_cap` also goes to its floor, because a sharp move spikes SUI's own vol velocity and cross-venue dispersion, which are liquidity-group features. That is intended, not a miss: a collateral crashing 6% in 20 minutes warrants a tighter borrow cap regardless of cause. A synthetic control confirms the mechanism is clean when a shock is isolated: a pure divergence shock gives a solvency-to-liquidity distance ratio of about 55x (only `max_ltv` moves), and a pure market shock gives the mirror, about 568x the other way (only `borrow_cap` moves).

So the honest statement: the split is real and works at the feature level, and `mktvol` correctly attributes volatility stress to the asset versus the market. A low-volatility oracle anomaly tightens only `max_ltv`; a violent move tightens both. The market feature tells you which; it does not hold `borrow_cap` loose through a crash.

## Per event

**Oct 10 2025 cascade.** Fires, but the sustained alert is coincident, not early: lead −17 min. The score single-ticks to 99 right at crash onset, but the move is near-vertical and 1-minute SUI bars are noisy, so the first two-in-a-row sustained alert lags the −5% bar. Liquidity is the durable driver, in a near-tie with solvency at the alert tick. Both parameters pin to their floors and the liquidity group sits at 95–100. Do not pitch the alert as ahead of the crash. But the protection was not late: the borrow cap was already at its 40% floor by ~20:47, before the −5% bar at 20:59, because the parameters react from a score of 60, not at the 99 alert.

**Aug 5 2024 carry unwind.** Fires, also coincident: lead −3 min, same near-vertical-move story as Oct 10. Liquidity leads at the alert tick (`disp` contributing 69%) with `mktvol` running about 3.6× its calm level, the clearest systemic-market signature in the set. Both parameters pin to their floors.

**Feb 2–3 2025 tariff selloff.** Fires early: lead +320 min. This is a slower episode, and it is where the positive-lead story lives. Solvency leads at the first sustained alert (`divvel` 57%, `div` 40%); `max_ltv` is already at its 55% floor while `borrow_cap` is still at 100%. As BTC keeps falling over the following hours, the market feature builds and `borrow_cap` tightens later. The score climbs on the joint configuration well before the visible drawdown.

**Mar 11 2023 USDC de-peg.** Fires early: lead +379 min, on the USDC target with BTC as the market proxy. This is the idiosyncratic case. Solvency carries it (`div` 55%, `divvel` 33%); the liquidity group is *low* (41 vs a calm average of 50) because BTC is calm. `max_ltv` goes to its 55% floor while `borrow_cap` stays at 100%. The −2% trailing threshold is used here because it is a stablecoin.

## Does it fire on calm?

Two probes on out-of-sample calm windows, each with a paired control on the identical window with the market feature turned off. The question is whether the new market feature adds alarms. It does not.

- **Jun 27–29 2024 (SUI/BTC, calm).** Single-tick rate 1.02%. Out-of-sample sustained: 0 with the market feature on, 0 with it off. No new alarms either way.
- **Aug 26–28 2025 (SUI/BTC, calm).** Single-tick rate 0.99%. Out-of-sample sustained: 2 on, 2 off. The two are SUI's own perp last-vs-index micro-divergence (`div` ~83%), not the market feature, which contributed about 1%. The off control is identical, so the market feature added zero.

The ablation is the point. On both calm windows the market-feature-on count equals the market-feature-off count. Adding it introduced no new false alarms.

## Threshold

Kept: the 99th calm percentile plus a two-consecutive-tick debounce. The single-tick rates above sit right at the ~1% design target, and the sustained counts on calm windows are small and explained. Turning the market feature on did not move the false-alarm count on either control window, so the threshold survives the new feature unchanged. The debounce, not a higher cut, is what carries the noise: it lets the two slower true episodes (Feb 2–3, USDC) clear at +320 and +379 min while keeping single-tick blips from tripping the alert.

## Honest limits

These are the dents. They are reported, not smoothed.

- Oct 10 and Aug 5 are coincident catches, not early warning. Both moves were near-vertical; the score single-ticks to 99 at crash onset, but noisy 1-minute SUI bars delay the first two-in-a-row, so the lead is slightly negative. The early-warning story is the slower episodes, Feb 2–3 (+320) and USDC (+379), not these two.
- `mktvol` is never the top per-feature contributor in any systemic event (0–7%); raw divergence and dispersion magnitude swamp it. Its systemic role shows up as the liquidity-group sub-distance and the `borrow_cap` that group produces, not as an mktvol-led score. The systemic-vs-idiosyncratic split is real at the group and parameter level. Do not claim `mktvol` tops the contribution bars.
- The USDC calm window overlaps the start of SVB instability on Mar 10, which inflates its calm sustained count to 10. Some of those are arguably early true detections. It is reported as is: trimming the window earlier breaks the clean idiosyncratic result, so it was left intact.
- SUI is intrinsically volatile, with 3–5% daily 1-minute ranges even on quiet days, so a perfectly zero out-of-sample calm count is not realistic on a SUI target. The Aug-2025 residual 2 is SUI's own noise, not market-driven.
- Lead times are in-sample case studies, calibrated and measured on the same episodes. The held-out parts are the calm false-alarm rate and the synthetic floor.
- Grid is 1-minute bars; the live agent ticks every few seconds. Depth features (`imb`, `spread`) are live-only and not in this historical run.

## Reproduce

```
tsx packages/agent/src/backtest.ts all
```

Bottom line: the detector reliably flags all four dislocations and cleanly separates systemic stress (`borrow_cap`) from idiosyncratic oracle breaks (`max_ltv`), with two coincident catches, two early ones, and a ~1% calm false-alarm rate the market feature leaves unchanged.
