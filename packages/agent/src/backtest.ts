import { writeFileSync, mkdirSync } from "node:fs";
import { fetchFuturesKlines } from "./sources/binanceArchive";
import { fetchOHLCV } from "./sources/cex";
import {
  asofJoin,
  candlesToSeries,
  buildFeatures,
  Detector,
  type Series,
} from "@seawall/model";
import { firstSustainedAlert, drawdownOnset, type Scored } from "./metrics";

// Oct 10 2025 backtest. Lead signal: Binance BTC perp execution price vs the
// composite index (oracle-vs-execution divergence), cross-venue spot
// dispersion, and realized-vol velocity. All from free history.
//
// The raw Mahalanobis score is mapped through the chi-squared CDF, but real
// features are heavy-tailed so we re-calibrate to the empirical d2 distribution
// of a calm window: the reported score is the percentile of d2 against calm,
// and the alert threshold is the 99th calm percentile (~1% calm alarm rate by
// construction). The crash is detected AFTER the calm calibration window, so
// the alert is on out-of-sample data.
const DATE = "2025-10-10";
const DAY_START = Date.UTC(2025, 9, 10, 0, 0, 0);
const DAY_END = Date.UTC(2025, 9, 10, 23, 59, 0);
const GRID_MS = 60_000;
const CALM_START = Date.UTC(2025, 9, 10, 2, 0, 0);
const CALM_END = Date.UTC(2025, 9, 10, 19, 0, 0);
const ALERT_PCT = 99; // alert above the 99th calm percentile
const iso = (ts: number) => new Date(ts).toISOString().replace(":00.000Z", "Z");

async function main() {
  console.log(`[backtest] loading ${DATE} (cached after first run)...`);
  const [mark, index, last, cb, okx, bybit] = await Promise.all([
    fetchFuturesKlines("mark", "BTCUSDT", DATE),
    fetchFuturesKlines("index", "BTCUSDT", DATE),
    fetchFuturesKlines("last", "BTCUSDT", DATE),
    fetchOHLCV("coinbase", "BTC-USD", DAY_START, DAY_END),
    fetchOHLCV("okx", "BTC-USDT", DAY_START, DAY_END),
    fetchOHLCV("bybit", "BTCUSDT", DAY_START, DAY_END),
  ]);
  console.log(
    `[backtest] bars: mark=${mark.length} index=${index.length} last=${last.length} ` +
      `coinbase=${cb.length} okx=${okx.length} bybit=${bybit.length}`,
  );

  const series: Series[] = [
    candlesToSeries("mark", mark),
    candlesToSeries("index", index),
    candlesToSeries("last", last),
    candlesToSeries("coinbase", cb),
    candlesToSeries("okx", okx),
    candlesToSeries("bybit", bybit),
  ];
  const rows = asofJoin(series, DAY_START, DAY_END, GRID_MS, 3 * GRID_MS);

  const feats = buildFeatures(rows, {
    refKey: "last",
    divA: "last",
    divB: "index",
    dispKeys: ["coinbase", "okx", "bybit"],
    velWindow: 30,
    rvSpan: 30,
  });

  // EWMA tuned for 1-minute bars (RiskMetrics 0.94 is for daily data).
  const det = new Detector(4, 120, { mean: 0.99, cov: 0.99 });
  const raw = feats.map(({ ts, fv }) => {
    const r = det.update(fv);
    return { ts, d2: r.d2, rawScore: r.score, fv, contributions: r.contributions };
  });

  // --- empirical calibration on the calm window ---
  const calmD2 = raw
    .filter((s) => s.ts >= CALM_START && s.ts < CALM_END && s.rawScore > 0)
    .map((s) => s.d2)
    .sort((a, b) => a - b);
  const pct = (d2: number) => {
    let lo = 0;
    let hi = calmD2.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (calmD2[mid] <= d2) lo = mid + 1;
      else hi = mid;
    }
    return (100 * lo) / calmD2.length;
  };
  const scored = raw.map((s) => ({ ...s, score: s.rawScore > 0 ? pct(s.d2) : 0 }));

  // --- metrics ---
  const series2: Scored[] = scored.map((s) => ({ ts: s.ts, score: s.score }));
  const lastPrices = last.map((c) => ({ ts: c.ts, value: c.close }));
  const crashFrom = CALM_END; // detect on data after the calibration window
  const tVisible = drawdownOnset(lastPrices, 0.05, 30 * GRID_MS, crashFrom);
  const tAlert = firstSustainedAlert(series2, ALERT_PCT, 2, crashFrom);
  // peak by raw d2 (the percentile score saturates at 100 for many ticks)
  const pk = scored.reduce((m, s) => (s.d2 > m.d2 ? s : m), scored[0]);
  const calm = series2.filter((s) => s.ts >= CALM_START && s.ts < CALM_END);
  const calmAlerts = calm.filter((s) => s.score >= ALERT_PCT).length;
  const atAlert = scored.find((s) => s.ts === tAlert);

  console.log("\n[backtest] calibrated score around the crash window (UTC):");
  for (const s of scored) {
    if (s.ts >= Date.UTC(2025, 9, 10, 20, 50) && s.ts <= Date.UTC(2025, 9, 10, 21, 30)) {
      const top = Object.entries(s.contributions).sort((a, b) => b[1] - a[1])[0];
      console.log(
        `  ${iso(s.ts)}  score=${s.score.toFixed(1).padStart(5)}  ` +
          `div=${s.fv.div.toFixed(1)}bps volvel=${s.fv.volvel.toFixed(2)} disp=${s.fv.disp.toFixed(1)}  top:${top?.[0]}`,
      );
    }
  }

  console.log("\n[backtest] === summary ===");
  console.log(`  peak d2           : ${pk.d2.toFixed(0)} (score ${pk.score.toFixed(0)}) at ${iso(pk.ts)}`);
  console.log(`  first alert (>=${ALERT_PCT}) : ${tAlert ? iso(tAlert) : "none"}`);
  console.log(
    `  calm false-alarms : ${calmAlerts}/${calm.length} ticks >=${ALERT_PCT} ` +
      `(${((100 * calmAlerts) / calm.length).toFixed(2)}% of 02:00-19:00)`,
  );
  console.log(`  visible -5% bar   : ${tVisible ? iso(tVisible) : "none"}`);
  if (tAlert && tVisible) {
    console.log(`  lead time         : ${((tVisible - tAlert) / 60000).toFixed(0)} min before the -5% bar`);
  }
  if (atAlert) {
    const top3 = Object.entries(atAlert.contributions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}=${((100 * v) / (atAlert.d2 || 1)).toFixed(0)}%`);
    console.log(`  drivers at alert  : ${top3.join(", ")}`);
  }

  mkdirSync("data", { recursive: true });
  writeFileSync(
    "data/backtest-report.json",
    JSON.stringify(
      {
        date: DATE,
        symbol: "BTCUSDT",
        config: "last-vs-index divergence + cross-venue dispersion + vol velocity",
        calibration: `empirical d2 percentile vs calm ${iso(CALM_START)}..${iso(CALM_END)}`,
        ticks: scored.length,
        alertPercentile: ALERT_PCT,
        peak: { ts: pk.ts, score: pk.score, d2: pk.d2 },
        firstAlert: tAlert,
        visibleDrop: tVisible,
        leadMinutes: tAlert && tVisible ? (tVisible - tAlert) / 60000 : null,
        calmFalseAlarmRate: calmAlerts / calm.length,
        series: scored.map((s) => ({ ts: s.ts, score: s.score, ...s.fv })),
      },
      null,
      2,
    ),
  );
  console.log("\n[backtest] wrote data/backtest-report.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
