import { writeFileSync, mkdirSync } from "node:fs";
import { EVENTS } from "./events";
import { runBacktest, printResult } from "./backtest-lib";

// CLI: `tsx backtest.ts <event|all>` (default oct10). Writes data/reports/<name>.json.
async function main() {
  const arg = process.argv[2] ?? "oct10";
  const names = arg === "all" ? Object.keys(EVENTS) : [arg];
  mkdirSync("data/reports", { recursive: true });
  for (const n of names) {
    const cfg = EVENTS[n];
    if (!cfg) {
      console.error(`unknown event: ${n} (known: ${Object.keys(EVENTS).join(", ")})`);
      process.exit(1);
    }
    const r = await runBacktest(cfg);
    printResult(r);
    writeFileSync(`data/reports/${n}.json`, JSON.stringify(r, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
