// Small live smoke test for the CEX adapter. Pulls 1-minute BTC candles for
// 2025-10-10 21:00..21:30 UTC from all three venues and prints counts + the
// first/last bar so we can eyeball the timestamps and price.
//
// Run: cd /home/seawall && node_modules/.bin/tsx packages/agent/src/sources/cex.smoke.ts
import { fetchOHLCV, type Venue } from "./cex";

const startMs = Date.parse("2025-10-10T21:00:00Z");
const endMs = Date.parse("2025-10-10T21:30:00Z");

const cases: { venue: Venue; symbol: string }[] = [
  { venue: "coinbase", symbol: "BTC-USD" },
  { venue: "okx", symbol: "BTC-USDT" },
  { venue: "bybit", symbol: "BTCUSDT" },
];

function ascending(rows: { ts: number }[]): boolean {
  for (let i = 1; i < rows.length; i++) if (rows[i].ts <= rows[i - 1].ts) return false;
  return true;
}

for (const { venue, symbol } of cases) {
  const rows = await fetchOHLCV(venue, symbol, startMs, endMs);
  console.log(`\n=== ${venue} ${symbol} ===`);
  console.log(`rows: ${rows.length}  ascending: ${ascending(rows)}`);
  if (rows.length > 0) {
    const f = rows[0];
    const l = rows[rows.length - 1];
    console.log(`first: ts=${f.ts} (${new Date(f.ts).toISOString()}) close=${f.close}`, f);
    console.log(`last:  ts=${l.ts} (${new Date(l.ts).toISOString()}) close=${l.close}`, l);
  }
}
