// Smoke test for the Binance archive adapter. Pulls small Oct-10-2025 samples
// from the live free endpoint and prints row counts + first/last rows.
//   node_modules/.bin/tsx packages/agent/src/sources/binanceArchive.smoke.ts
import { fetchFuturesKlines, fetchSpot1s } from "./binanceArchive";
import type { Candle } from "@seawall/shared";

const DATE = "2025-10-10";

function summarize(label: string, rows: Candle[]) {
  console.log(`\n[${label}] rows=${rows.length}`);
  console.log("  first:", rows[0]);
  console.log("  last :", rows[rows.length - 1]);
}

async function main() {
  const mark = await fetchFuturesKlines("mark", "BTCUSDT", DATE);
  summarize("futures mark 1m", mark);

  const index = await fetchFuturesKlines("index", "BTCUSDT", DATE);
  summarize("futures index 1m", index);

  // |ln(mark) - ln(index)| should be tiny in calm minutes. Look at a middle bar.
  const mid = Math.floor(mark.length / 2);
  const m = mark[mid].close;
  const i = index[mid].close;
  console.log(
    `\n  calm-minute check (bar ${mid}): mark=${m} index=${i} |ln(mark)-ln(index)|=${Math.abs(
      Math.log(m) - Math.log(i),
    ).toExponential(3)}`,
  );

  const spot = await fetchSpot1s("BTCUSDT", DATE);
  summarize("spot 1s", spot);
  console.log(
    `\n  spot ts sanity: first ts=${spot[0].ts} (~1.76e12? ${
      spot[0].ts > 1.7e12 && spot[0].ts < 1.8e12
    }), expected ~86400 rows, got ${spot.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
