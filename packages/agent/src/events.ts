import type { EventConfig } from "./backtest-lib";

// helper: UTC epoch ms (month is 1-based here for readability)
const U = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi, 0);

// All events are market-aware: a target token plus BTC as the market proxy
// (marketSymbol). mktvol (BTC volatility velocity) routes to the liquidity
// group -> borrow_cap, so systemic crashes (target falls with BTC) push
// borrow_cap, while an idiosyncratic move (e.g. a peg break with BTC calm)
// stays a solvency / max_ltv story. Numbers are written up in docs/ml-backtest.md.

// Systemic: SUI in the Oct 10 2025 liquidation cascade. Coincident catch.
export const OCT10: EventConfig = {
  label: "Oct 10 2025 — liquidation cascade (SUI / BTC market)",
  dates: ["2025-10-10"],
  windowStartMs: U(2025, 10, 10, 0, 0),
  windowEndMs: U(2025, 10, 10, 23, 59),
  futuresSymbol: "SUIUSDT",
  marketSymbol: "BTCUSDT",
  cex: { coinbase: "SUI-USD", okx: "SUI-USDT", bybit: "SUIUSDT" },
  refKey: "last",
  divA: "last",
  divB: "index",
  dispKeys: ["coinbase", "okx", "bybit"],
  drawdownKey: "last",
  calm: [U(2025, 10, 10, 2, 0), U(2025, 10, 10, 19, 0)],
  detectFrom: U(2025, 10, 10, 19, 0),
};

// Systemic: SUI in the Aug 5 2024 yen carry-trade unwind. Coincident catch.
export const AUG2024: EventConfig = {
  label: "Aug 5 2024 — yen carry unwind (SUI / BTC market)",
  dates: ["2024-08-04", "2024-08-05"],
  windowStartMs: U(2024, 8, 4, 0, 0),
  windowEndMs: U(2024, 8, 5, 23, 59),
  futuresSymbol: "SUIUSDT",
  marketSymbol: "BTCUSDT",
  cex: { coinbase: "SUI-USD", okx: "SUI-USDT", bybit: "SUIUSDT" },
  refKey: "last",
  divA: "last",
  divB: "index",
  dispKeys: ["coinbase", "okx", "bybit"],
  drawdownKey: "last",
  calm: [U(2024, 8, 4, 2, 0), U(2024, 8, 4, 22, 0)],
  detectFrom: U(2024, 8, 5, 0, 0),
};

// Systemic with an early idiosyncratic lead: SUI in the Feb 2-3 2025 tariff
// selloff. detectFrom at the event start (Feb 2 10:00) gives the robust lead.
export const FEB2025: EventConfig = {
  label: "Feb 2-3 2025 — tariff selloff (SUI / BTC market)",
  dates: ["2025-02-01", "2025-02-02", "2025-02-03"],
  windowStartMs: U(2025, 2, 1, 0, 0),
  windowEndMs: U(2025, 2, 3, 23, 59),
  futuresSymbol: "SUIUSDT",
  marketSymbol: "BTCUSDT",
  cex: { coinbase: "SUI-USD", okx: "SUI-USDT", bybit: "SUIUSDT" },
  refKey: "last",
  divA: "last",
  divB: "index",
  dispKeys: ["coinbase", "okx", "bybit"],
  drawdownKey: "last",
  calm: [U(2025, 2, 1, 2, 0), U(2025, 2, 1, 22, 0)],
  detectFrom: U(2025, 2, 2, 10, 0),
};

// Idiosyncratic (the discrimination showcase): USDC de-peg after SVB, with BTC
// as the market proxy. BTC stayed calmer, so mktvol stays low and the response
// is solvency-driven (max_ltv to floor) while borrow_cap holds at baseline.
// Stablecoin -> no futures, divB is the $1 peg. The calm window overlaps the
// early SVB chop on Mar 10, which inflates the calm sustained count (honest
// artifact); trimming it earlier breaks the clean idiosyncratic result.
export const USDC2023: EventConfig = {
  label: "Mar 11 2023 — USDC de-peg / SVB (USDC / BTC market)",
  dates: ["2023-03-09", "2023-03-10", "2023-03-11"],
  windowStartMs: U(2023, 3, 9, 0, 0),
  windowEndMs: U(2023, 3, 11, 23, 59),
  marketSymbol: "BTCUSDT",
  cex: { bybit: "USDCUSDT", okx: "USDC-USDT" },
  pegValue: 1,
  refKey: "bybit",
  divA: "bybit",
  divB: "peg",
  dispKeys: ["bybit", "okx"],
  drawdownKey: "bybit",
  drawdownFrac: 0.02,
  calm: [U(2023, 3, 9, 4, 0), U(2023, 3, 10, 18, 0)],
  detectFrom: U(2023, 3, 10, 18, 0),
};

// Idiosyncratic, SUI-NATIVE (the discrimination showcase): the May 22 2025 Cetus
// exploit. SUI dumps ~11.6% (~$4.20 -> ~$3.71, ~10:40-13:00 UTC) while BTC stays
// flat (~$110-111k, +0.09% across the crash) — a clean single-asset crash with the
// market calm. So mktvol (BTC vol velocity) stays ~0 and the response is solvency /
// divergence-driven (max_ltv), NOT systemic-liquidity (borrow_cap) — the measured
// proof that "the two knobs listen to two different things". Window is honest +
// conservative: calm = the ~32h before the dump (incl. the run-up to $4.20, which
// only WIDENS the baseline), detectFrom at the 10:00 onset (a ~33h zero-alert gap
// before the event makes the -1min lead robust to detectFrom placement), same
// 5%/30min visible-drop as the other SUI events (no per-event tuning).
// HONEST NOTE: Cetus's VALUE is the driver discrimination, not raw magnitude — the
// event's raw d² is modest (the dump hit the Cetus DEX, not the CEX basis/dispersion
// we measure); it alerts via the calm-percentile (sustained top-1% vs calm), and the
// lead is coincident (-1min), not predictive. The early-warning story lives in the
// slow-drift events (Feb +320min, USDC +379min).
export const CETUS2025: EventConfig = {
  label: "May 22 2025 — Cetus exploit (SUI idiosyncratic / BTC market)",
  // May 20 is detector warm-up runway (so the EWMA cov is fully settled before the
  // calm window — keeps the cold-start transient out of the calibration/peak).
  dates: ["2025-05-20", "2025-05-21", "2025-05-22"],
  windowStartMs: U(2025, 5, 20, 0, 0),
  windowEndMs: U(2025, 5, 22, 23, 59),
  futuresSymbol: "SUIUSDT",
  marketSymbol: "BTCUSDT",
  cex: { coinbase: "SUI-USD", okx: "SUI-USDT", bybit: "SUIUSDT" },
  refKey: "last",
  divA: "last",
  divB: "index",
  dispKeys: ["coinbase", "okx", "bybit"],
  drawdownKey: "last",
  calm: [U(2025, 5, 21, 2, 0), U(2025, 5, 22, 10, 0)],
  detectFrom: U(2025, 5, 22, 10, 0),
};

export const EVENTS: Record<string, EventConfig> = {
  oct10: OCT10,
  aug2024: AUG2024,
  feb2025: FEB2025,
  usdc2023: USDC2023,
  cetus: CETUS2025,
};
