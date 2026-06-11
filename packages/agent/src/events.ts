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

export const EVENTS: Record<string, EventConfig> = {
  oct10: OCT10,
};
