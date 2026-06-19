// Per-case narrative for the stress-test gallery. Plain-English, judge-facing, and
// TIED TO THE GENERATED DATA (packages/dashboard/src/backtests/*.json) — every number
// quoted here is reproduced from that file. The score + knobs are the LIVE scoring
// path (detector → χ²-calibrator → smoothing → one-way ratchet) replayed over each
// event, regression-verified identical to the validated reports (maxDiff 0.000), so
// the gallery reads on the same scale as the live gauge (calm ≈ 0). The numbered ①②③
// refer to the REAL news catalysts marked on each chart (researched + sourced, UTC).
// Honesty first: `detection` states what the lead actually is (a detection lead, not
// always an action lead); where a catch is coincident or modest, we say so.

export interface CaseCopy {
  detection: string; // one honest line about the lead / when the model actually acted
  market: string; // what happened in the world (refs the ① catalysts)
  guardian: string; // how the score + knobs reacted (matches the chart)
  read: string; // how to read this case / why it matters
  caveat?: string; // the honest limit, if any
}

export const COPY: Record<string, CaseCopy> = {
  feb2025: {
    detection:
      "The agent's real action — ratcheting both knobs down — fires in the deep-crash leg on Feb 3, ~9 h after the detector's first faint flag. So the +320 min is a detection lead, not an action lead: the agent moves only once stress is unmistakable.",
    market:
      "Trump signed tariff executive orders on Canada, Mexico and China late Saturday Feb 1 (①); 24/7 crypto sold off through the weekend and the macro shock detonated a leverage cascade — ~$2.27B liquidated in 24h (~743k traders, ~$1.7B of it longs), the largest single-day wipeout since the COVID/FTX shocks, with one exchange CEO flagging the true figure as several times higher. SUI bled ~38% as the leg deepened into Feb 3, partly retracing after Mexico's (then Canada's) tariffs were paused (②).",
    guardian:
      "The clearest case of the ML earning its place. Contract-measured divergence only grazes its own 1% caution line (one spike to ~123 bps) and never nears the 5% freeze — so the inline check barely acts. The catch onsets solvency-led: at onset max LTV ratchets down first while borrow cap holds at baseline (the trust-the-price knob moving first); only as the magnitude deepens does the ratchet pull both knobs to the floor (55% / 40%), then relax as the selloff stabilizes. The flooring is the score's doing, not the divergence reading. No freeze.",
    read:
      "The guardian reacts to a sustained selloff, not predicts it — and it's the strongest evidence the ML adds something: the contract's own divergence barely grazes caution, so without the score the knobs would never floor. The trade-off is timing: enforcement lands at the crisis, not 5 h early. For a clean predictive lead see USDC; for the in-block freeze see Oct-10.",
  },
  usdc2023: {
    detection:
      "The agent nudges the cap early, but the decisive action is the contract FREEZE the moment peg-divergence crossed 5% (Mar 11 03:36Z) — re-derived from raw divergence, not a score call. Once frozen it stays frozen until the DAO lifts it.",
    market:
      "California regulators closed Silicon Valley Bank on Friday Mar 10 (①); that night Circle disclosed $3.3B of USDC reserves were trapped at SVB (②) and USDC broke its dollar peg — an all-time low around $0.877 (to ~$0.86 on the thin Bybit book we replay here) — while BTC was unaffected, in fact rallying as capital fled USDC into BTC. A clean idiosyncratic, solvency-class event (the SVB cash was later recovered at par — a reserve scare, not true insolvency).",
    guardian:
      "The freeze showcase. As the depeg widens, divergence against the $1 peg crosses the 5% contract-FREEZE line (peak ~1455 bps) and the contract HALTS on its own reading — the agent has no part. Around the freeze the ratchet floors BOTH knobs (max LTV→55%, borrow cap→40%) — a solvency break severe enough to bottom out the liquidity knob too.",
    read:
      "The closest analog to the real target threat, and a clean real-world A/B: during this depeg, Compound hardcoded USDC at $1 (its oracle ignored the break) while Aave used a live price, marked USDC down, and kept its safety buffer. That's the exact difference between a breaker that watches divergence and one that trusts an assumed peg. The score's early flag is faint, but it doesn't need to land here: the freeze re-derives from raw divergence the instant it crossed 5%. (The peg recovered after the Fed/FDIC backstop on Mar 12 — past this chart's window.)",
  },
  oct10: {
    detection:
      "Coincident (−6 min), too fast for any lead: the agent's CAUTION and the contract FREEZE fire within minutes as the books dislocate — and once frozen it stays frozen (the red zone) until the DAO lifts it.",
    market:
      "Trump's 100% China-tariff post (①, ~5 pm ET, retaliating for China's rare-earth curbs) lit the fuse — but it became the largest liquidation cascade ever (~$19B, ~87% longs) on structure, not the headline: record one-sided leverage into thin weekend books, cross-margin auto-deleveraging, and a venue collateral-pricing failure. On Binance, USDe and wrapped collateral were marked off its own thin book and cratered (USDe to ~$0.65) on that venue alone — while holding ~$1 on-chain and elsewhere — force-liquidating solvent users. SUI's perp last wicked ~79% and last-vs-index divergence hit ~17.5% (peak ~1754 bps).",
    guardian:
      "The moment the contract's own measured divergence blows past 5%, it FREEZES on its own data and the ratchet slams both knobs to the floor (55% / 40%). No human, no DAO vote, no agent permission: one block.",
    read:
      "The on-thesis precedent. The Binance leg is exactly Seawall's failure mode: a venue trusting a single, thin, internal price with NO divergence breaker — its collateral mark diverged ~35% from the true cross-venue price and auto-liquidated solvent users (Binance later paid ~$283M in compensation). A breaker that halts on an oracle↔external-market divergence is precisely what that venue lacked.",
    caveat:
      "Honest caveats: the broader $19B cascade was primarily macro (the tariff) + record leverage + thin weekend liquidity + cross-margin ADL — the collateral-pricing failure amplified Binance specifically, it did not alone cause the whole cascade. And it was a CEX-internal pricing failure, not an on-chain oracle failure — Pyth/Chainlink stayed accurate and USDe never truly depegged off Binance. So Seawall is the divergence breaker the venue lacked, not a claim that 'the oracle failed.'",
  },
  aug2024: {
    detection:
      "Coincident (−3 min): the agent's CAUTION fires with the crash — a borrow-cap tightening as cross-venue volatility spikes. No lead, no freeze.",
    market:
      "The yen carry-trade unwound — the BoJ hiked on Jul 31 and a weak US jobs report on Aug 2 tripped the Sahm recession rule — and on Aug 5 the Nikkei closed −12.4% (①) amid a global cascade. In crypto it was a smaller Oct-10: ~$1B+ liquidated in 24h (~254k traders, ~90% longs) as carry-funded leverage unwound into thin books. SUI fell ~19% with BTC — a systemic, leverage-amplified move, but with NO oracle break (stablecoins held their pegs; DeFi liquidations ran orderly).",
    guardian:
      "The liquidity signature: BTC volatility-velocity and cross-venue dispersion lead, so borrow cap drives down to ~42% (near its 40% floor) while max LTV barely moves (~72%) — a systemic deleveraging caps new leverage rather than repricing collateral. Divergence stayed well under 5% (peak ~64 bps): a hard cap tightening, not a freeze. (24/7 crypto cascaded hours before the Nikkei cash close ①.)",
    read:
      "Proof the two knobs listen to two different things. Here the model reads a market-wide liquidity event — borrow cap leads toward its floor, max LTV barely moves. Same model, the other knob, a hard cap tightening rather than a halt.",
  },
  cetus: {
    detection:
      "A small positive lead (+11 min): the agent floors BOTH knobs (max LTV→55%, borrow cap→40%) as SUI dumps on-chain — though the CEX basis barely registers the DEX-only shock (no freeze). See the limit below.",
    market:
      "The Cetus exploit drained ~$223M from Sui CLMM pools starting ~10:30Z May 22 (①) — an integer-overflow bug in the pool liquidity math (the checked_shlw guard) let a flash-loaned position mint near-infinite liquidity for ~1 token. Cetus halted its pools (②) and SUI dumped ~11% on-chain, before Sui validators voted to freeze ~$162M of the funds (③). BTC stayed flat — a single-asset, contract-bug shock.",
    guardian:
      "A single-asset on-chain shock the model still catches: both knobs floor (max LTV→55%, borrow cap→40%) as SUI dumps with the broad market calm. With no archived oracle break to anchor it, the first-alert mix reads liquidity-led (cross-venue volatility-velocity and divergence), not a clean solvency signature. Small positive lead (+11 min), and no freeze (divergence peaks just ~19 bps).",
    read: "An incidental, out-of-scope catch on a SUI-native event: a single-asset contract-bug drain isn't the oracle/price-anomaly class Seawall is built for, yet cross-venue volatility-velocity and divergence still trip the knobs. Read it as evidence the model isn't blind to on-chain stress — not a driver-discrimination demo (for that, see Aug = liquidity-led, Feb = solvency-led).",
    caveat:
      "Honest boundary: the exploit lived on the Cetus DEX, not the CEX basis Seawall watches (divergence peaks just ~19 bps), so the +11 min lead is incidental — the model is reacting to the on-chain dump, not predicting the bug. Seawall covers the oracle/price-anomaly class; it is not a detector for a DEX logic-bug drain. Note the irony: Sui validators froze the hacker (③) by social consensus — the heavy-handed manual version of what Seawall does narrowly, automatically, and only toward safer.",
  },
};

// Gallery-level framing, shown once above the cases. States the scope honestly.
export const GALLERY_INTRO = {
  lead: "Mainnet is calm by design, so the live score sits flat. These five real crises show the guardian earning its place.",
  body: "Each case replays the unchanged scoring path — same detector, calibration, smoothing, and one-way ratchet the dashboard runs now — over a real crash, on the same scale you see above (≈0 in calm). We plot the score, the two lending knobs, and the contract-measured divergence against price. Markers show what the world did (sourced news catalysts, numbered ①②③, UTC) and what the system did: when the AGENT first tightens (CAUTION) and when the CONTRACT freezes. After a freeze the chart stays red — only the DAO can lift it.",
  caveat:
    "The two FREEZES (USDC, Oct-10) are the strongest result: the contract halts on its own re-derived divergence, no score needed. The two non-freeze catches show solvency-vs-liquidity discrimination — Aug is LIQUIDITY-led (borrow cap floors, max LTV barely moves), Feb is SOLVENCY-led at onset (max LTV floors first, borrow cap holds at baseline) — same model, opposite knobs. Feb is also where the ML earns its place (see the case). Cetus is incidental and out-of-scope — a SUI-native DEX bug, not the oracle/price-anomaly class — that the model still trips. Replayed scores are regression-verified identical to the validated reports. Backtests use free CEX price/divergence history (last-vs-index, or vs the $1 peg) as the oracle↔market proxy; the live system re-derives the same shape from Pyth↔DeepBook on-chain. Public order-book DEPTH isn't archived, so depth features are shown live, not backtested.",
};
