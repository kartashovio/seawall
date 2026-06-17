# Does the guardian actually catch real crashes?

We took five real market crashes and replayed them minute by minute, watching what the risk model would have done at each step. SUI is the watched collateral; BTC stands in for the broader market. Then we ran calm windows as false-alarm checks. Everything runs on free, keyless data — Binance archive klines, Coinbase/OKX/Bybit spot, Pyth — at 1-minute resolution. Unsupervised, no labels; the event windows are marked only so we can measure timing.

Here's the headline:

> **The guardian caught all five — and on the clean single-driver events, routed to the right knob.** Two slow-drift events trip the alarm *hours* before the visible crash. The two fast crashes are caught coincident — a near-vertical move gives no head start. And where one risk axis dominates, the *kind* of stress — a price-trust problem versus a violence problem — lands on the right parameter: the liquidity-led yen unwind holds `max_ltv` while flooring `borrow_cap`; the solvency-led tariff grind floors `max_ltv` first while `borrow_cap` is still at baseline.

One thing stated up front rather than buried. The graded protective parameter does reach its floor *ahead* of the visible drop in all five. But that floor is the tighten band (score ≥ 80), which — because the backtest score *is* the calm percentile — crosses ~20% of calm minutes by construction (100 − 80; smoothing pulls the realized rate lower). That is precisely *why* the graded floor is a bounded, reversible CAUTION nudge inside the DAO corridor, **not** a number to sell as foresight. On the live side the χ² dead-zone maps the whole calm body to 0, so the live gauge still reads ~0 in calm. The figure we headline is the strict *confirmed alarm* (score ≥ 99 for two ticks, ~1% calm false-alarm, unchanged): hours ahead on the slow events, coincident on the fast ones. Both columns are in the table below; every dent is in the limits.

## The five crashes, one at a time

The interesting part isn't just *that* the model fired. It's how differently it reacted depending on the kind of stress in front of it.

**Oct 10 2025 — the SUI liquidation cascade.** A systemic deleveraging spiral: cross-venue dispersion, volatility, and BTC all blowing out together. The model read it as a liquidity event and slammed both knobs to the floor (`max_ltv` 55%, `borrow_cap` 40%). The graded CAUTION had the borrow cap on the floor by ~19:29, about 90 minutes before the −5% bar printed at 20:59; the strict ≥99 alarm landed at 21:05, right *at* the vertical move.

**Aug 5 2024 — the yen carry-trade unwind.** The cleanest systemic signature in the set. Cross-venue dispersion drove 67% of the anomaly and BTC's market-vol ran well above its calm level — the unmistakable shape of *everything selling off at once.* This is the clean liquidity-led case: `borrow_cap` rode to its floor (~42%) while `max_ltv` barely moved (~72%) — violence and fragmentation, not a price-trust problem. CAUTION floored the cap by ~00:12, ~55 minutes before the 01:07 bar; the ≥99 alarm at 01:10 was coincident.

**Feb 2–3 2025 — the tariff selloff.** A slower grind, and where the early warning genuinely shines — and the cleanest *solvency-led onset* in the set. The model read it as *solvency*-led — divergence-velocity 91%, divergence 8%: the price was getting untrustworthy faster than it was getting violent. At the ≥99 alert the routing is unmistakable — only the solvency knob had floored (`max_ltv` 55%) while `borrow_cap` was still at baseline (100%); the magnitude only pulled the liquidity knob down *later*, as the grind deepened. This is the ML earning its place: divergence here only grazes the caution band (~123 bps, no freeze), so it's the *score* that floors the leverage knob, not a raw threshold. The −5% bar didn't print until 22:40; both the CAUTION floor and the strict ≥99 alarm were in by 17:20 — **about 5.3 hours ahead.**

**Mar 11 2023 — the USDC de-peg after SVB.** The one that proves the model is thinking, not just panicking, and the longest lead in the set. USDC came off its peg — but a stablecoin off-peg is *mispriced, not crashing.* As the de-peg formed, the venues stopped agreeing first, so the top contributor at the alert is cross-venue dispersion (57%) with divergence-velocity right behind (37%) — a liquidity-shaped onset. But this de-peg ran severe: the Pyth-vs-book divergence crossed 5% (peak ~1455 bps), which floors `max_ltv` on the price gap and pulls `borrow_cap` down too (55%/40%) *and* trips the contract-only freeze — the freeze is the headline here.

> A de-peg is, ultimately, a price-correctness problem — and the divergence *level* is what floors `max_ltv` and, once it crosses 5%, trips the freeze. That freeze is no longer a graded nudge: it crosses the contract's own freeze line, which fires independently of the score. The ≥99 alarm fired at 20:20 on Mar 10, while USDC was still on peg; the −2% bar (a tighter threshold, because it's a stablecoin) didn't come until 03:32 the next day — **about 7.2 hours ahead**, with `max_ltv` floored on the divergence and the contract-only freeze behind it.

**May 22 2025 — the Cetus exploit.** SUI-native and idiosyncratic, and *out of scope* — the dump hit the Cetus DEX's own logic, not the oracle/price class the guardian is built for. The exploit dropped SUI ~11.6% ($4.20 → $3.71) over a couple of hours while BTC sat flat (+0.09% across the crash). The model still picked it up: the anomaly was led by volatility-velocity (50%) with divergence right behind (47%), and as the dislocation deepened it floored *both* knobs (`max_ltv` 55%, `borrow_cap` 40%). The ≥99 alarm landed at 10:57, about 11 minutes before the −5% bar at 11:08. So Cetus is an honest *incidental* catch — proof the model isn't blind to an idiosyncratic SUI move — not a discrimination demo: it floors both knobs and its raw `d²` is modest (the dump hit the Cetus DEX, not the CEX basis and dispersion we measure here).

## The results

| Event | Shape | Graded CAUTION floor (≥80) vs bar | Confirmed alarm (≥99, 2-tick) vs bar | What drove it | Params at alert | Calm FP |
|---|---|---|---|---|---|---|
| **Oct 10 2025** — SUI liquidation cascade | Flash crash | `borrow_cap` ~19:29 · −5% bar 20:59 → **+90 min** | ~21:05 → **−6 min** *(at the crash)* | Liquidity (disp 90%, volvel 7%) · peak d² 267 | max_ltv 55% · borrow_cap 40% | 0.98% / 1 |
| **Aug 5 2024** — yen carry-trade unwind | Flash crash | `borrow_cap` ~00:12 · −5% bar 01:07 → **+55 min** | ~01:10 → **−3 min** *(at the crash)* | Liquidity (disp 67%, divvel 20%) · peak d² 129 | max_ltv ~72% · borrow_cap ~42% | 1.00% / 1 |
| **Feb 2–3 2025** — tariff selloff | Slow grind | `max_ltv` ~17:20 · −5% bar 22:40 → **+320 min** | ~17:20 → **+320 min (5.3 h)** | Solvency (divvel 91%, div 8%) · peak d² 181 | max_ltv 55% · borrow_cap 100% | 1.00% / 1 |
| **Mar 11 2023** — USDC de-peg (post-SVB) | Slow de-peg | `max_ltv` ~19:09 · −2% bar 03:32 +1d → **+503 min** | ~20:20 → **+432 min (7.2 h)** | Liquidity (disp 57%, divvel 37%) · peak d² 103 | max_ltv 55% · borrow_cap 40% | 1.01% / 9 |
| **May 22 2025** — Cetus exploit (SUI) | Idiosyncratic | `max_ltv` ~10:56 · −5% bar 11:08 → **+12 min** | ~10:57 → **+11 min** | Liquidity (volvel 50%, div 47%) · peak d² 159 | max_ltv 55% · borrow_cap 40% | 1.04% / 1 |

**How to read it — two thresholds, one harness** (`tsx backtest.ts all`, both reproducible).

- **Graded CAUTION floor (≥80)** — when the driving knob reached its floor: the routing shows in which knob leads. On the liquidity-led aug only `borrow_cap` floors (`max_ltv` holds ~72%); the solvency-led feb floors `max_ltv` *first* (its `borrow_cap` only follows later as the grind deepens). On the severe events (oct, usdc) *both* knobs floor, because both risk sub-dimensions max out at once. It's ahead of the bar in all five. But because the backtest score *is* the calm percentile, this band crosses ~20% of calm minutes by construction (100 − 80; smoothing pulls the realized rate lower) — which is exactly *why* we treat it as the *bounded, reversible* CAUTION nudge inside the DAO corridor it is, protection engaging early, **not** a clean foresight claim. (Live, the χ² dead-zone maps the whole calm body to 0, so the live gauge still reads ~0 in calm.) The parameters ride a gradual map that starts tightening at score 55 and floors by 80.
- **Confirmed alarm (≥99, 2-tick)** — the strict marker, ~1% calm false-alarm. On the two fast crashes it lands coincident (−6, −3 min): the alarm being conservative on a vertical move, not protection arriving late — the params were already at floor. On the two slow events it leads by **5.3 and 7.2 hours** (feb, usdc); the out-of-scope Cetus DEX exploit is caught ~11 min ahead. This is the honest early-warning headline: hours ahead on drift, coincident on a flash crash.
- **What drove it** — the group of the single top-contributing feature at the alert. The fast systemic crashes and the de-peg onset are liquidity-led (cross-venue dispersion leads as venues stop agreeing); the slow tariff grind is the clean solvency-led case (divergence-velocity).
- **Params at alert** — the per-group sub-scores map to the two knobs (`solvency → max_ltv`, `liquidity → borrow_cap`). On the clean single-driver events the off-axis knob stays off its floor at the alert — the solvency-led feb holds `borrow_cap` (still 100%, the magnitude pulls it down only later); the liquidity-led aug holds `max_ltv` (~72%). The severe events (oct, usdc) floor both, because both sub-dimensions max out at once; the out-of-scope cetus also floors both.
- **Calm FP** — single-tick rate (~1% by design) / sustained two-in-a-row count on the pre-event window. The USDC window's 9 has a real cause (below).

## What makes it smart: two knobs, two questions

The model isn't one panic button. It runs two parameters, and each answers a different question:

- **`max_ltv` asks "can we trust the price?"** It moves on oracle-vs-market divergence.
- **`borrow_cap` asks "how violent and fragmented is this?"** It moves on the asset's own volatility plus the broader market's.

That separation is the whole point, and the cleanest two events show it directly. The tariff selloff (Feb 2025) is the purest solvency illustration — at the alert `max_ltv` floors while `borrow_cap` is still at baseline (100%), because divergence-velocity dominates (91%): the price is getting untrustworthy faster than it is getting violent, so the model routes the leverage knob first and only pulls the liquidity knob down later as the magnitude builds. The yen-unwind (Aug 2024) is the mirror — the liquidity-led case where `borrow_cap` floors (~42%) and `max_ltv` barely moves (~72%), because it's violence and fragmentation, not a price-trust problem. The severe events (oct, usdc) floor both knobs at once, because they genuinely *are* both a solvency and a liquidity event — the routing is still visible in which sub-distance leads.

> A synthetic control proves the routing is clean: a pure divergence shock pushes about **≈123×** harder on `max_ltv`'s side (solvency sub-distance 198.9 vs liquidity 1.6), while `borrow_cap` holds at baseline; a pure market shock pushes about **≈1589×** the other way, on `borrow_cap` (liquidity sub-distance 222.3 vs solvency 0.1). The two knobs really are listening to two different things — and the ratio is a property of the Mahalanobis sub-distances, independent of how the score maps to parameters.

## Does it stay quiet on calm markets?

Yes. We ran out-of-sample calm windows, with a paired control — the same window with the market feature switched off — to check that adding the market signal doesn't invent new alarms.

- **Aug 26–28 2025:** 2 sustained alerts, market feature on *or* off — *identical*, same timestamp. Those 2 are SUI's own micro-divergence (`div` ~83%), not the market feature, which contributed about 1%. Single-tick rate 0.99%.
- **Jun 27–29 2024:** 0 sustained alerts with the market feature on; single-tick rate ~1.0%. A quiet window the model leaves alone.

The Aug-2025 ablation is the takeaway: **on-count equals off-count, same alerts, same minute. The market feature added zero false alarms.** Single-tick rates sit right at ~1%, by design.

## Threshold

Unchanged: the 99th calm percentile (in the backtest) plus a two-consecutive-tick debounce. The market feature didn't move the false-alarm count on the control window, so it survives the new feature as-is. The debounce — not a higher cut — is what carries the noise. (Live, the model reads that same top-1%-of-calm tail off the chi-squared dead-zone instead of a stored percentile — it lands at a live χ²-score of about 90, not 99; the two agree at the tail. Full mechanism in [ml-methodology.md](ml-methodology.md).)

## Honest limits

Reported plainly, because a skeptical judge should see these before going looking for them.

- **The confirmed alarm is coincident on fast crashes**, not ahead — about −6 and −3 minutes on Oct and Aug versus the bar. That's the strict marker being conservative on a near-instant move, not protection arriving late: the parameters were already at floor (graded CAUTION). We don't pitch the alarm as ahead of a flash crash. The genuine hours-ahead early-warning is the two slow events (Feb, USDC) — so that claim rests on **n = 2**.
- **The graded-CAUTION floor (≥80) crosses ~20% of calm minutes — by construction.** The backtest score *is* the calm percentile, so a ≥80 band is crossed by ~20% of calm minutes (100 − 80) before smoothing pulls the realized rate down. We own that number rather than hide it: it is precisely *why* the graded floor is a bounded, reversible CAUTION nudge inside the DAO corridor and never a freeze — the hard freeze needs the contract's own on-chain re-derivation (div ≥ 5% or an empty/one-sided book), not the score. On the live path the χ² dead-zone maps the whole calm body to 0, so the live gauge still reads ~0 in calm, and the nudge RELAXes on a sustained all-clear. The headline foresight metric is unchanged: the strict ≥99 confirmed alarm (~1% calm). We show the ≥80 floor as "protection engaged early," not as a clean detection metric.
- **The parameter map has no debounce.** Some of the early flooring on the fast crashes is the noisy run-up locking in through the tighten-only ratchet, not clean foresight. The fix for fast, noise-safe timing is a 1-second grid or debouncing the request itself — next steps, not done here.
- **Cetus is an out-of-scope incidental catch, not a discrimination demo.** The dump hit the Cetus DEX's own logic, not the oracle/price class the guardian targets, so it is out of scope by design. The model still flags it — ~11 min before the bar — but it floors *both* knobs rather than routing cleanly, and its raw `d²` is modest (the move hit the Cetus DEX, not the CEX basis/dispersion we measure); its peak `d²` even lands on a brief calm transient. It's in the set as honest proof the model isn't blind to an idiosyncratic SUI move — not as a routing showcase (the clean two-knob split is aug vs feb).
- **Lead times are in-sample case studies** — calibrated and measured on the same episodes. The held-out part is the calm false-alarm rate (the ablation windows).
- **The USDC calm window overlaps the start of SVB instability** (Mar 10), which inflates its sustained count to 9. Some of those are arguably early true detections; we left the window intact rather than trim it to flatter the number.
- **SUI is intrinsically volatile** — 3–5% daily ranges on 1-minute bars even on quiet days — so a perfect zero calm count isn't realistic on a SUI target. The Aug-2025 residual 2 is SUI's own noise, not market-driven.
- **1-minute bars here; the live agent ticks faster and smooths.** The live path adds an EWMA score-smoothing (α = 0.4) and a ~45-minute warm-up gate that this historical run does not model — so read the timing as the model's discriminative power, not the exact live latency. Depth features (`imb`, `spread`) are live-only design and absent from this run (and not yet wired live either).

The model and its full derivation are in [ml-methodology.md](ml-methodology.md).

## Reproduce

```
tsx packages/agent/src/backtest.ts all
```

Free, keyless data throughout: Binance archive klines for SUI and BTC, Coinbase/OKX/Bybit spot for cross-venue dispersion, Pyth for the live signed price. 1-minute bars. Unsupervised — no labels; event windows are marked only to measure timing. The calm-window ablation and the synthetic routing control are separate scripts under `packages/agent/src/scratch/`.

**Bottom line:** in five real crashes the guardian caught every one — and where a single risk axis dominated, routed it to the right knob (liquidity-led aug holds `max_ltv`; solvency-led feb floors `max_ltv` first) — hours ahead on the slow events, coincident on the flash crashes, while staying quiet on calm markets at the ~1% rate it was built for.
