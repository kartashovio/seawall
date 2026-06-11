import type { EventConfig } from "./backtest-lib";

// helper: UTC epoch ms (month is 1-based here for readability)
const U = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi, 0);

// Reference event. New cases follow the same shape (see backtest-lib EventConfig).
export const OCT10: EventConfig = {
  label: "Oct 10 2025 — BTC liquidation cascade",
  dates: ["2025-10-10"],
  windowStartMs: U(2025, 10, 10, 0, 0),
  windowEndMs: U(2025, 10, 10, 23, 59),
  futuresSymbol: "BTCUSDT",
  cex: { coinbase: "BTC-USD", okx: "BTC-USDT", bybit: "BTCUSDT" },
  refKey: "last",
  divA: "last",
  divB: "index",
  dispKeys: ["coinbase", "okx", "bybit"],
  drawdownKey: "last",
  calm: [U(2025, 10, 10, 2, 0), U(2025, 10, 10, 19, 0)],
  detectFrom: U(2025, 10, 10, 19, 0),
};

// USDC de-peg after SVB, Mar 9-11 2023. Stablecoin -> no futures; divergence is
// distance off the $1 peg. Coinbase USDC-USD has no 2023 candles, so 2 venues
// (USDC quoted in USDT; USDT held its peg during SVB so USDC/USDT ~= USDC/USD).
export const USDC_2023: EventConfig = {
  label: "Mar 11 2023 — USDC de-peg (SVB)",
  dates: [],
  windowStartMs: U(2023, 3, 9, 0, 0), // 1678320000000
  windowEndMs: U(2023, 3, 11, 23, 59), // 1678579140000
  cex: { bybit: "USDCUSDT", okx: "USDC-USDT" },
  pegValue: 1,
  refKey: "bybit",
  divA: "bybit",
  divB: "peg",
  dispKeys: ["bybit", "okx"],
  drawdownKey: "bybit",
  drawdownFrac: 0.02, // a stablecoin de-peg is a few % off peg, not -5%
  calm: [U(2023, 3, 9, 4, 0), U(2023, 3, 10, 18, 0)],
  detectFrom: U(2023, 3, 10, 18, 0),
};

// Aug 5 2024 — yen carry-trade unwind. BTC perp last-vs-index basis + dispersion.
export const AUG_2024: EventConfig = {
  label: "Aug 5 2024 — yen carry-trade unwind",
  dates: ["2024-08-04", "2024-08-05"],
  windowStartMs: U(2024, 8, 4, 0, 0),
  windowEndMs: U(2024, 8, 5, 23, 59),
  futuresSymbol: "BTCUSDT",
  cex: { coinbase: "BTC-USD", okx: "BTC-USDT", bybit: "BTCUSDT" },
  refKey: "last",
  divA: "last",
  divB: "index",
  dispKeys: ["coinbase", "okx", "bybit"],
  drawdownKey: "last",
  calm: [U(2024, 8, 4, 2, 0), U(2024, 8, 4, 22, 0)],
  detectFrom: U(2024, 8, 5, 0, 0),
};

// Feb 2-3 2025 — Trump tariff selloff. ETH perp (the larger move).
export const FEB_2025: EventConfig = {
  label: "Feb 2-3 2025 — Trump tariff selloff (ETH)",
  dates: ["2025-02-01", "2025-02-02", "2025-02-03"],
  windowStartMs: U(2025, 2, 1, 0, 0),
  windowEndMs: U(2025, 2, 3, 23, 59),
  futuresSymbol: "ETHUSDT",
  cex: { coinbase: "ETH-USD", okx: "ETH-USDT", bybit: "ETHUSDT" },
  refKey: "last",
  divA: "last",
  divB: "index",
  dispKeys: ["coinbase", "okx", "bybit"],
  drawdownKey: "last",
  calm: [U(2025, 2, 1, 2, 0), U(2025, 2, 1, 22, 0)],
  detectFrom: U(2025, 2, 2, 22, 0),
};

export const EVENTS: Record<string, EventConfig> = {
  oct10: OCT10,
  usdc2023: USDC_2023,
  aug2024: AUG_2024,
  feb2025: FEB_2025,
};
