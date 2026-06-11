// Small live smoke test for the Pyth adapter.
//   - fetchLatest on the beta SUI/USD feed (expect ~$0.7, conf > 0).
//   - fetchHistory on the mainnet SUI/USD feed for 2025-10-10 21:00..21:10 UTC
//     (expect ~$3, conf > 0, timestamps near 1.76e12 ms).
//
// Run: cd /home/seawall && node_modules/.bin/tsx packages/agent/src/sources/pyth.smoke.ts
import { fetchLatest, fetchHistory } from "./pyth";
import type { PythTick } from "@seawall/shared";

const BETA = "0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266";
const MAINNET = "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744";

function ascending(rows: PythTick[]): boolean {
  for (let i = 1; i < rows.length; i++) if (rows[i].ts <= rows[i - 1].ts) return false;
  return true;
}

async function main() {
  const latest = await fetchLatest(BETA);
  console.log("\n=== fetchLatest (beta SUI/USD) ===");
  console.log(`ts=${latest.ts} (${new Date(latest.ts).toISOString()})`);
  console.log(`price=${latest.price} conf=${latest.conf}`);

  const startSec = Math.floor(Date.parse("2025-10-10T21:00:00Z") / 1000);
  const endSec = Math.floor(Date.parse("2025-10-10T21:10:00Z") / 1000);
  const hist = await fetchHistory(MAINNET, startSec, endSec);
  console.log("\n=== fetchHistory (mainnet SUI/USD, 21:00..21:10 UTC) ===");
  console.log(`rows: ${hist.length}  ascending: ${ascending(hist)}`);
  const f = hist[0];
  const l = hist[hist.length - 1];
  console.log(`first: ts=${f.ts} (${new Date(f.ts).toISOString()})`, { price: f.price, conf: f.conf });
  console.log(`last:  ts=${l.ts} (${new Date(l.ts).toISOString()})`, { price: l.price, conf: l.conf });
  console.log(`ts ~1.76e12? ${f.ts > 1.7e12 && f.ts < 1.8e12}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
