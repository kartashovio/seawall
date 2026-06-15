# Does the guardian actually catch real crashes?

We took five real market crashes and replayed them minute by minute, watching what the risk model would have done at each step. SUI is the watched collateral; BTC stands in for the broader market. Then we ran calm windows as false-alarm checks. Everything runs on free, keyless data — Binance archive klines, Coinbase/OKX/Bybit spot, Pyth — at 1-minute resolution. Unsupervised, no labels; the event windows are marked only so we can measure timing.

Here's the headline:

> **The guardian caught all five — and routed to the right knob every time.** Two slow-drift events trip the alarm *hours* before the visible crash. Three fast crashes are caught coincident — a near-vertical move gives no head start. And on every one, the *kind* of stress — a price-trust problem versus a violence problem — lands on the right parameter.

One thing stated up front rather than buried. The graded protective parameter does reach its floor *ahead* of the visible drop in all five. But that floor is the tighten band (score ≥ 95), which also crosses ~5% of the time in calm — fine for a bounded, reversible CAUTION nudge, **not** a number to sell as foresight. The figure we headline is the strict *confirmed alarm* (score ≥ 99 for two ticks, ~1% calm false-alarm): hours ahead on the slow events, coincident on the fast ones. Both columns are in the table below; every dent is in the limits.

## The five crashes, one at a time

The interesting part isn't just *that* the model fired. It's how differently it reacted depending on the kind of stress in front of it.

**Oct 10 2025 — the SUI liquidation cascade.** A systemic deleveraging spiral: cross-venue dispersion, volatility, and BTC all blowing out together. The model read it as a liquidity event and slammed both knobs to the floor (`max_ltv` 55%, `borrow_cap` 40%). The graded CAUTION had the borrow cap on the floor by ~19:29, about 90 minutes before the −5% bar printed at 20:59; the strict ≥99 alarm landed at 21:16, right *at* the vertical move.

**Aug 5 2024 — the yen carry-trade unwind.** The cleanest systemic signature in the set. Cross-venue dispersion drove 69% of the anomaly and BTC's market-vol ran well above its calm level — the unmistakable shape of *everything selling off at once.* Both knobs to the floor. CAUTION floored the cap by ~00:12, ~55 minutes before the 01:07 bar; the ≥99 alarm at 01:10 was coincident.

**Feb 2–3 2025 — the tariff selloff.** A slower grind, and where the early warning genuinely shines. The model read it as *solvency*-led — divergence-velocity 57%, divergence 40%: the price was getting untrustworthy faster than it was getting violent. So `max_ltv` carried this one to its floor while `borrow_cap` stayed at its 100% baseline — at our 1-minute resolution the violent-volatility signal never took over. The −5% bar didn't print until 22:40; both the CAUTION floor and the strict ≥99 alarm were in by 17:20 — **about 5.3 hours ahead.**

**Mar 11 2023 — the USDC de-peg after SVB.** The one that proves the model is thinking, not just panicking. USDC came off its peg — but a stablecoin off-peg is *mispriced, not crashing.* High divergence, low realized volatility, BTC dead calm. So only `max_ltv` tightened (divergence 55%), riding to its floor, while `borrow_cap` stayed wide open at its 100% baseline.

> A de-peg is a price-correctness problem, not a volatility problem. The model tightened the leverage knob and *left the borrow cap alone* — exactly right. The ≥99 alarm fired at 21:13 on Mar 10, while USDC was still on peg; the −2% bar (a tighter threshold, because it's a stablecoin) didn't come until 03:32 the next day — **about 6.3 hours ahead**, timed off `max_ltv`, the only knob that moved.

**May 22 2025 — the Cetus exploit.** SUI-native and idiosyncratic. The exploit dumped SUI ~11.6% ($4.20 → $3.71) over a couple of hours while BTC sat flat (+0.09% across the crash). With the market calm, `mktvol` stayed near zero, so the model read it the way it should — *solvency*-led, divergence at **73%** of the anomaly, the strongest divergence share of all five. Both knobs floored under the violent dump, but the driver is unmistakably the price-trust axis. The catch is coincident, though: the ≥99 alarm at 11:09 sits right on the −5% bar at 11:08. Cetus earns its place on *discrimination* — routing an idiosyncratic SUI crash to the solvency knob while BTC is calm — not on lead or raw magnitude (its raw `d²` is modest; the dump hit the Cetus DEX, not the CEX basis and dispersion we measure here).

## The results

| Event | Shape | Graded CAUTION floor (≥95) vs bar | Confirmed alarm (≥99, 2-tick) vs bar | What drove it | Params at alert | Calm FP |
|---|---|---|---|---|---|---|
| **Oct 10 2025** — SUI liquidation cascade | Flash crash | `borrow_cap` ~19:29 · −5% bar 20:59 → **+90 min** | ~21:16 → **−17 min** *(at the crash)* | Liquidity (disp 91%) · peak d² 107 | max_ltv 55% · borrow_cap 40% | 0.98% / 1 |
| **Aug 5 2024** — yen carry-trade unwind | Flash crash | `borrow_cap` ~00:12 · −5% bar 01:07 → **+55 min** | ~01:10 → **−3 min** *(at the crash)* | Liquidity (disp 69%) · peak d² 64 | max_ltv 55% · borrow_cap 40% | 1.00% / 0 |
| **Feb 2–3 2025** — tariff selloff | Slow grind | `max_ltv` ~17:20 · −5% bar 22:40 → **+320 min** | ~17:20 → **+320 min (5.3 h)** | Solvency (divvel 57%, div 40%) · peak d² 88 | max_ltv 55% · borrow_cap 100% | 1.00% / 0 |
| **Mar 11 2023** — USDC de-peg (post-SVB) | Slow de-peg | `max_ltv` ~19:09 · −2% bar 03:32 +1d → **+503 min** | ~21:13 → **+379 min (6.3 h)** | Solvency (div 55%, divvel 33%) · peak d² 45 | max_ltv 55% · borrow_cap 100% | 1.01% / 10 |
| **May 22 2025** — Cetus exploit (SUI) | Idiosyncratic | `max_ltv` ~10:56 · −5% bar 11:08 → **+12 min** | ~11:09 → **−1 min** *(at the crash)* | Solvency (div 73%) · peak d² 79 | max_ltv 55% · borrow_cap 40% | 1.04% / 1 |

**How to read it — two thresholds, one harness** (`tsx backtest.ts all`, both reproducible).

- **Graded CAUTION floor (≥95)** — when the driving knob reached its floor: `borrow_cap` on the flash crashes (both knobs floor; the cap is the binding one), `max_ltv` on the slow solvency events (where `borrow_cap` correctly stays at baseline). It's ahead of the bar in all five. But this band crosses ~5% of calm minutes, so we treat it as the *bounded, reversible* CAUTION nudge it is — protection engaging early — **not** as a clean foresight claim. The parameters ride a gradual map that starts tightening at score 60 and floors by 95.
- **Confirmed alarm (≥99, 2-tick)** — the strict marker, ~1% calm false-alarm. On the three fast crashes it lands coincident (−17, −3, −1 min): the alarm being conservative on a vertical move, not protection arriving late — the params were already at floor. On the two slow events it leads by **5.3 and 6.3 hours**. This is the honest early-warning headline: hours ahead on drift, coincident on a flash crash.
- **What drove it** — the group of the single top-contributing feature. Systemic crashes are liquidity-led (dispersion); the de-peg and idiosyncratic crash are solvency-led (divergence).
- **Params at alert** — the per-group sub-scores map to the two knobs (`solvency → max_ltv`, `liquidity → borrow_cap`). The two slow solvency events hold `borrow_cap` at its 100% baseline — the model tightening leverage without touching borrow capacity.
- **Calm FP** — single-tick rate (~1% by design) / sustained two-in-a-row count on the pre-event window. The USDC window's 10 has a real cause (below).

## What makes it smart: two knobs, two questions

The model isn't one panic button. It runs two parameters, and each answers a different question:

- **`max_ltv` asks "can we trust the price?"** It moves on oracle-vs-market divergence.
- **`borrow_cap` asks "how violent and fragmented is this?"** It moves on the asset's own volatility plus the broader market's.

That separation is the whole point, and the five events show it cleanly. The USDC de-peg is the purest illustration — only `max_ltv` moves while `borrow_cap` holds at 100%, because the asset is mispriced but not violent. The Cetus exploit is the SUI-native mirror: an idiosyncratic crash where divergence dominates (73%) and `mktvol` stays near zero because BTC never moved — the model says "this is SUI's own problem," routes the solvency knob hardest, and the violent dump floors the cap on top. Put either next to a genuinely systemic move and the contrast is the "aha."

> A synthetic control proves the routing is clean: a pure divergence shock pushes about **55×** harder on `max_ltv`'s side (solvency sub-distance 102 vs liquidity 1.9), while `borrow_cap` holds at baseline; a pure market shock pushes about **568×** the other way, on `borrow_cap` (liquidity sub-distance 106 vs solvency 0.2). The two knobs really are listening to two different things — and the ratio is a property of the Mahalanobis sub-distances, independent of how the score maps to parameters.

## Does it stay quiet on calm markets?

Yes. We ran out-of-sample calm windows, with a paired control — the same window with the market feature switched off — to check that adding the market signal doesn't invent new alarms.

- **Aug 26–28 2025:** 2 sustained alerts, market feature on *or* off — *identical*, same timestamp. Those 2 are SUI's own micro-divergence (`div` ~83%), not the market feature, which contributed about 1%. Single-tick rate 0.99%.
- **Jun 27–29 2024:** 0 sustained alerts with the market feature on; single-tick rate ~1.0%. A quiet window the model leaves alone.

The Aug-2025 ablation is the takeaway: **on-count equals off-count, same alerts, same minute. The market feature added zero false alarms.** Single-tick rates sit right at ~1%, by design.

## Threshold

Unchanged: the 99th calm percentile (in the backtest) plus a two-consecutive-tick debounce. The market feature didn't move the false-alarm count on the control window, so it survives the new feature as-is. The debounce — not a higher cut — is what carries the noise. (Live, the model reads that same top-1%-of-calm tail off the chi-squared dead-zone instead of a stored percentile — it lands at a live χ²-score of about 90, not 99; the two agree at the tail. Full mechanism in [ml-methodology.md](ml-methodology.md).)

## Honest limits

Reported plainly, because a skeptical judge should see these before going looking for them.

- **The confirmed alarm is coincident on fast crashes**, not ahead — about −17, −3, and −1 minutes on Oct, Aug, and Cetus versus the bar. That's the strict marker being conservative on a near-instant move, not protection arriving late: the parameters were already at floor (graded CAUTION). We don't pitch the alarm as ahead of a flash crash. The genuine hours-ahead early-warning is the two slow events (Feb, USDC) — so that claim rests on **n = 2**.
- **The graded-CAUTION floor (≥95) crosses ~5% of calm minutes.** That's why it's a bounded, reversible nudge inside the DAO corridor and never a freeze — the hard freeze needs the strict signal and the contract's own on-chain re-derivation. We show the ≥95 floor as "protection engaged early," not as a clean detection metric.
- **The parameter map has no debounce.** Some of the early flooring on the fast crashes is the noisy run-up locking in through the tighten-only ratchet, not clean foresight. The fix for fast, noise-safe timing is a 1-second grid or debouncing the request itself — next steps, not done here.
- **Cetus earns its place on discrimination, not magnitude.** Its lead is coincident and its raw `d²` is modest (the dump hit the Cetus DEX, not the CEX basis/dispersion we measure); its peak `d²` even lands on a brief calm transient. It's in the set because it routes an idiosyncratic SUI crash to the solvency knob with BTC calm — the cleanest non-stablecoin proof of the two-knob split — not because it was a loud catch.
- **Lead times are in-sample case studies** — calibrated and measured on the same episodes. The held-out part is the calm false-alarm rate (the ablation windows).
- **The USDC calm window overlaps the start of SVB instability** (Mar 10), which inflates its sustained count to 10. Some of those are arguably early true detections; we left the window intact rather than trim it to flatter the number.
- **SUI is intrinsically volatile** — 3–5% daily ranges on 1-minute bars even on quiet days — so a perfect zero calm count isn't realistic on a SUI target. The Aug-2025 residual 2 is SUI's own noise, not market-driven.
- **1-minute bars here; the live agent ticks faster and smooths.** The live path adds an EWMA score-smoothing (α = 0.4) and a ~45-minute warm-up gate that this historical run does not model — so read the timing as the model's discriminative power, not the exact live latency. Depth features (`imb`, `spread`) are live-only design and absent from this run (and not yet wired live either).

The model and its full derivation are in [ml-methodology.md](ml-methodology.md).

## Reproduce

```
tsx packages/agent/src/backtest.ts all
```

Free, keyless data throughout: Binance archive klines for SUI and BTC, Coinbase/OKX/Bybit spot for cross-venue dispersion, Pyth for the live signed price. 1-minute bars. Unsupervised — no labels; event windows are marked only to measure timing. The calm-window ablation and the synthetic routing control are separate scripts under `packages/agent/src/scratch/`.

**Bottom line:** in five real crashes the guardian caught every one and routed it to the right knob — hours ahead on the slow solvency events, coincident on the flash crashes — while staying quiet on calm markets at the ~1% rate it was built for.
