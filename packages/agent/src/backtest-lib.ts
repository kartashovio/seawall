import { fetchFuturesKlines } from "./sources/binanceArchive";
import { fetchOHLCV, type Venue } from "./sources/cex";
import {
  asofJoin,
  candlesToSeries,
  buildFeatures,
  paramFromScore,
  Detector,
  GROUP_FEATURES,
  type Series,
} from "@seawall/model";
import { MAX_LTV, BORROW_CAP } from "@seawall/shared";
import { firstSustainedAlert, drawdownOnset, type Scored } from "./metrics";

// One backtest event, fully described by data + windows so it can be run for
// any historical episode, not just Oct-10.
export interface EventConfig {
  label: string;
  dates: string[]; // Binance archive dates to load (YYYY-MM-DD), if futuresSymbol set
  windowStartMs: number; // analysis grid start
  windowEndMs: number; // analysis grid end
  futuresSymbol?: string; // load mark/index/last 1m klines under these names
  marketSymbol?: string; // optional market proxy (e.g. "BTCUSDT"): "last" loaded as series "market" -> mktvol
  cex?: Partial<Record<Venue, string>>; // venue -> symbol; loaded as spot series named by venue
  pegValue?: number; // add a constant "peg" series (e.g. 1.0 for a stablecoin)
  refKey: string; // price series for returns / realized vol
  divA: string;
  divB: string; // or "__median__"
  dispKeys: string[];
  drawdownKey: string; // price series the "visible crash" is measured on
  calm: [number, number]; // calm window (ms) for empirical calibration
  detectFrom: number; // search alerts after this ms
  gridMs?: number;
  drawdownFrac?: number;
  drawdownWindowMin?: number;
  velWindow?: number;
  lambda?: number; // EWMA decay for 1m bars (default 0.99)
}

export interface BacktestResult {
  label: string;
  ticks: number;
  calmCount: number;
  calmSingleAlerts: number; // ticks >=99 in the calm window (~1% by design)
  calmSustainedAlerts: number; // 2-in-a-row >=99 in calm (the action-triggering FP)
  firstAlert: number | null;
  visibleDrop: number | null;
  leadMinutes: number | null;
  peakD2: { ts: number; d2: number };
  driverAtAlert: string | null; // "solvency" | "liquidity"
  paramsAtAlert: { maxLtv: number; borrowCap: number } | null;
  topContributions: string[];
  series: { ts: number; score: number; solvency: number; liquidity: number }[];
}

const ALERT_PCT = 99;

// Exported (visibility only — body unchanged) so the dashboard backtest-viz
// generator can load the SAME price series the reports were built from, to
// layer price + divergence onto the already-validated score/solvency/liquidity.
export async function loadSeries(cfg: EventConfig, grid: number): Promise<Series[]> {
  const out: Series[] = [];
  if (cfg.futuresSymbol) {
    for (const kind of ["mark", "index", "last"] as const) {
      const parts = await Promise.all(
        cfg.dates.map((d) => fetchFuturesKlines(kind, cfg.futuresSymbol!, d)),
      );
      out.push(candlesToSeries(kind, parts.flat().sort((a, b) => a.ts - b.ts)));
    }
  }
  if (cfg.marketSymbol) {
    const parts = await Promise.all(
      cfg.dates.map((d) => fetchFuturesKlines("last", cfg.marketSymbol!, d)),
    );
    out.push(candlesToSeries("market", parts.flat().sort((a, b) => a.ts - b.ts)));
  }
  if (cfg.cex) {
    for (const [venue, symbol] of Object.entries(cfg.cex)) {
      const c = await fetchOHLCV(venue as Venue, symbol!, cfg.windowStartMs, cfg.windowEndMs);
      out.push(candlesToSeries(venue, c));
    }
  }
  if (cfg.pegValue !== undefined) {
    const points = [];
    for (let t = cfg.windowStartMs; t <= cfg.windowEndMs; t += grid) {
      points.push({ ts: t, value: cfg.pegValue });
    }
    out.push({ name: "peg", points });
  }
  return out;
}

// Empirical percentile of x against a sorted reference array.
function percentileFn(sorted: number[]): (x: number) => number {
  return (x: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return sorted.length ? (100 * lo) / sorted.length : 0;
  };
}

export async function runBacktest(cfg: EventConfig): Promise<BacktestResult> {
  const grid = cfg.gridMs ?? 60_000;
  const series = await loadSeries(cfg, grid);
  const rows = asofJoin(series, cfg.windowStartMs, cfg.windowEndMs, grid, 3 * grid);
  const feats = buildFeatures(rows, {
    refKey: cfg.refKey,
    divA: cfg.divA,
    divB: cfg.divB,
    dispKeys: cfg.dispKeys,
    marketRefKey: cfg.marketSymbol ? "market" : undefined,
    velWindow: cfg.velWindow ?? 30,
    rvSpan: cfg.velWindow ?? 30,
  });

  const lambda = cfg.lambda ?? 0.99;
  const featureList = cfg.marketSymbol
    ? ["disp", "div", "divvel", "volvel", "mktvol"]
    : ["disp", "div", "divvel", "volvel"];
  const det = new Detector(featureList, { warmup: 120, lambdas: { mean: lambda, cov: lambda } });
  const raw = feats.map(({ ts, fv }) => {
    const r = det.update(fv);
    return { ts, d2: r.d2, rawScore: r.score, groupD2: r.groupD2, contributions: r.contributions, fv };
  });

  // empirical calibration on the calm window (overall + each component)
  const inCalm = (ts: number) => ts >= cfg.calm[0] && ts < cfg.calm[1];
  const post = raw.filter((s) => s.rawScore > 0);
  const pctAll = percentileFn(post.filter((s) => inCalm(s.ts)).map((s) => s.d2).sort((a, b) => a - b));
  const pctSolv = percentileFn(
    post.filter((s) => inCalm(s.ts)).map((s) => s.groupD2.solvency).sort((a, b) => a - b),
  );
  const pctLiq = percentileFn(
    post.filter((s) => inCalm(s.ts)).map((s) => s.groupD2.liquidity).sort((a, b) => a - b),
  );

  const scored = raw.map((s) => {
    const score = s.rawScore > 0 ? pctAll(s.d2) : 0;
    const solvency = s.rawScore > 0 ? pctSolv(s.groupD2.solvency) : 0;
    const liquidity = s.rawScore > 0 ? pctLiq(s.groupD2.liquidity) : 0;
    return { ...s, score, solvency, liquidity };
  });

  // metrics
  const overall: Scored[] = scored.map((s) => ({ ts: s.ts, score: s.score }));
  const dd = series.find((x) => x.name === cfg.drawdownKey)?.points ?? [];
  const tVisible = drawdownOnset(
    dd,
    cfg.drawdownFrac ?? 0.05,
    (cfg.drawdownWindowMin ?? 30) * grid,
    cfg.detectFrom,
  );
  const tAlert = firstSustainedAlert(overall, ALERT_PCT, 2, cfg.detectFrom);
  const calm = scored.filter((s) => inCalm(s.ts));
  const calmSingle = calm.filter((s) => s.score >= ALERT_PCT).length;
  let calmSustained = 0;
  for (let i = 0; i + 1 < calm.length; i++) {
    if (calm[i].score >= ALERT_PCT && calm[i + 1].score >= ALERT_PCT) calmSustained++;
  }
  const pk = scored.reduce((m, s) => (s.d2 > m.d2 ? s : m), scored[0]);
  const at = scored.find((s) => s.ts === tAlert) ?? null;
  // Driver = the GROUP of the top-CONTRIBUTING feature (consistent with
  // topContributions). The old solvency>=liquidity sub-score tie-break labelled
  // "solvency" whenever both sub-scores saturate at 100 — even when the dominant
  // feature (e.g. disp, a liquidity feature) says otherwise, an internally
  // contradictory readout. Fall back to the sub-score only if contributions are empty.
  const topFeat = at
    ? Object.entries(at.contributions).sort((a, b) => b[1] - a[1])[0]?.[0]
    : undefined;
  const driver = topFeat
    ? GROUP_FEATURES.solvency.includes(topFeat)
      ? "solvency"
      : "liquidity"
    : at
      ? at.solvency >= at.liquidity
        ? "solvency"
        : "liquidity"
      : null;

  return {
    label: cfg.label,
    ticks: scored.length,
    calmCount: calm.length,
    calmSingleAlerts: calmSingle,
    calmSustainedAlerts: calmSustained,
    firstAlert: tAlert,
    visibleDrop: tVisible,
    leadMinutes: tAlert && tVisible ? (tVisible - tAlert) / 60000 : null,
    peakD2: { ts: pk.ts, d2: pk.d2 },
    driverAtAlert: driver,
    paramsAtAlert: at
      ? {
          maxLtv: paramFromScore(at.solvency, MAX_LTV),
          borrowCap: paramFromScore(at.liquidity, BORROW_CAP),
        }
      : null,
    topContributions: at
      ? Object.entries(at.contributions)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, v]) => `${k}=${((100 * v) / (at.d2 || 1)).toFixed(0)}%`)
      : [],
    series: scored.map((s) => ({ ts: s.ts, score: s.score, solvency: s.solvency, liquidity: s.liquidity })),
  };
}

export const iso = (ts: number) => new Date(ts).toISOString().replace(":00.000Z", "Z");

export function printResult(r: BacktestResult): void {
  console.log(`\n=== ${r.label} ===`);
  console.log(`  ticks            : ${r.ticks}`);
  console.log(`  first alert (>=99): ${r.firstAlert ? iso(r.firstAlert) : "none"}`);
  console.log(`  visible -drop bar : ${r.visibleDrop ? iso(r.visibleDrop) : "none"}`);
  if (r.leadMinutes !== null) console.log(`  lead time        : ${r.leadMinutes.toFixed(0)} min`);
  console.log(`  peak d2          : ${r.peakD2.d2.toFixed(0)} at ${iso(r.peakD2.ts)}`);
  console.log(`  driver at alert  : ${r.driverAtAlert} ${r.topContributions.join(" ")}`);
  if (r.paramsAtAlert)
    console.log(
      `  params at alert  : max_ltv=${r.paramsAtAlert.maxLtv.toFixed(1)}% borrow_cap=${r.paramsAtAlert.borrowCap.toFixed(1)}%`,
    );
  console.log(
    `  calm false-alarm : single=${r.calmSingleAlerts}/${r.calmCount} ` +
      `(${((100 * r.calmSingleAlerts) / Math.max(1, r.calmCount)).toFixed(2)}%), sustained=${r.calmSustainedAlerts}`,
  );
}
