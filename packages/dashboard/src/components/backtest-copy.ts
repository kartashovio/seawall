// Per-case narrative for the stress-test gallery. Plain-English, judge-facing, and
// TIED TO THE GENERATED DATA (packages/dashboard/src/backtests/*.json) — every number
// quoted here is reproduced from that file. The score + knobs shown are the LIVE
// scoring path (detector → χ²-calibrator → smoothing → one-way ratchet) replayed over
// each event, regression-verified identical to the validated reports (maxDiff 0.000),
// so the gallery reads on the SAME scale as the live gauge (calm ≈ 0). The alert/lead
// markers are the validated detector's sustained-99 percentile alert. Honesty first:
// where a catch is coincident (not predictive), or a response is moderate, we say so.

export interface CaseCopy {
  date: string;
  market: string; // what happened in the world
  guardian: string; // how Seawall's score + knobs reacted (matches the chart)
  read: string; // how to read this case / why it matters
  caveat?: string; // the honest limit, if any
}

export const COPY: Record<string, CaseCopy> = {
  feb2025: {
    date: "Feb 2–3, 2025",
    market:
      "A surprise US-tariff announcement triggered a broad risk-off selloff. SUI bled ~31% over the window alongside the whole market, but the slide built for hours before the violent leg.",
    guardian:
      "The score lifts off the zero floor ~320 minutes (5.3h) before the visible −5% drop and climbs as cross-venue dispersion and divergence-velocity build. As it deepens, the one-way ratchet walks BOTH knobs down — max LTV toward 56%, borrow cap to the 40% floor — and holds them. Divergence peaked ~108 bps, under the 5% freeze line, so the response stayed graded tightening, not a halt.",
    read:
      "The early-warning case. A stateful, multi-source model registers stress accumulating hours before price breaks — the guardian de-risks new borrows well ahead of the move, where a single-tick inline check would still read normal.",
  },
  usdc2023: {
    date: "Mar 11, 2023",
    market:
      "Silicon Valley Bank failed; fear over USDC's cash reserves broke its dollar peg. USDC slid off $1 (to ~$0.93 on Bybit in our data, deeper on some venues) while BTC stayed comparatively calm — a clean idiosyncratic, solvency-class event.",
    guardian:
      "The score lifts ~379 minutes (6.3h) early. As the depeg widens, divergence against the $1 peg crosses the 5% contract-FREEZE line (peak ~686 bps) and the contract HALTS on its own reading — the agent has no part. The ratchet floors max LTV (→55%) while borrow cap barely moves (holds near baseline) — a solvency break, not a liquidity one, with BTC calm throughout.",
    read:
      "The closest analog to the real target threat, and the freeze showcase: a stablecoin losing its peg is exactly the oracle/price-correctness break that mis-liquidates lending markets. Flagged early, then escalated to a hard freeze the moment it crossed 5%.",
  },
  oct10: {
    date: "Oct 10, 2025",
    market:
      "A mass-liquidation cascade emptied order books market-wide. SUI's perp last-price wicked down ~70% as the book dislocated and last-vs-index divergence exploded to ~8.7% (peak in-window ~870 bps) in seconds.",
    guardian:
      "A coincident catch (alert ≈ crash, −17 min) — but the moment the contract's own measured divergence blows past 5%, it FREEZES on its own data and the ratchet slams both knobs to the floor (55% / 40%). No human, no DAO vote, no agent permission: one block.",
    read:
      "The fast flash-crash. When a feed and the book violently disagree, the in-block freeze is the seatbelt — a manual freeze takes hours and a DAO vote days, neither of which exists in the seconds this took. The live testnet demo reproduces exactly this.",
  },
  aug2024: {
    date: "Aug 5, 2024",
    market:
      "The yen carry-trade unwound, forcing global deleveraging. SUI fell ~19% with BTC — a systemic, market-wide move rather than a single-asset break.",
    guardian:
      "The liquidity signature: BTC volatility-velocity and cross-venue dispersion lead, so BORROW CAP is the knob that moves (toward ~75%) while max LTV barely shifts — a systemic deleveraging caps new leverage rather than repricing collateral. Coincident (−3 min); divergence stayed well under 5%, so this was a measured cap tightening, not a freeze.",
    read:
      "Proof the two knobs listen to two different things. Here the model reads a market-wide liquidity event — borrow cap leads, max LTV holds. Same model, the other knob, a graded response rather than a halt.",
  },
  cetus: {
    date: "May 22, 2025",
    market:
      "The Cetus DEX exploit dumped SUI ~10% on-chain while BTC stayed flat. The move hit the Cetus pool, not the CEX basis — so the cross-exchange divergence we measure stayed small (peak ~39 bps).",
    guardian:
      "The solvency signature on a single-asset shock: max LTV eases (toward ~69%) while borrow cap holds — the broad market is calm, so this reads as a price/divergence anomaly, not systemic liquidity. Coincident (−1 min); modest by design, and no freeze.",
    read: "Driver discrimination on a SUI-native event: a single-asset shock with the market calm tightens the solvency knob, not the liquidity one.",
    caveat:
      "Honest boundary: because the exploit lived on the Cetus DEX, not the CEX basis Seawall watches, the response is modest and coincident — not predictive. Seawall covers the oracle/price-anomaly class; it is not a detector for a DEX logic-bug drain. We include it because the discrimination is still correct, and because stating the limit is the credibility.",
  },
};

// Gallery-level framing, shown once above the cases. States the scope honestly.
export const GALLERY_INTRO = {
  lead: "Mainnet is calm by design, so the live score sits flat — these are the moments that prove the guardian earns its place.",
  body: "Each case replays the unchanged live scoring path over a real market crisis — the same detector, calibration, smoothing, and one-way ratchet the dashboard runs today — so the score reads on the same scale you see above (≈0 in calm). The score, the two lending knobs, and the contract-measured divergence are plotted against the asset price, with the validated detector's alert marked, so you can see the reaction line up with the event and the lead before price moved.",
  caveat:
    "Scope, stated up front: early warning is demonstrated on the two slow-drift events (Feb +320m, USDC +379m); the violent cascade and the idiosyncratic shocks are coincident catches, and the milder events draw a graded — not maximal — response. The replayed scores are regression-verified identical to the validated reports. Backtests use free CEX price/divergence history (last-vs-index, or vs the $1 peg) as the oracle↔market proxy; the live system re-derives the same shape from Pyth↔DeepBook on-chain. Public order-book DEPTH isn't archived, so depth features are shown live on the dashboard, not backtested.",
};
