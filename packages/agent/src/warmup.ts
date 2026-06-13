// Warm-starts the live agent: replays ~3h of recent 1-min CEX history through the
// SAME FeatureBuilder + Detector the live loop continues with (so the EWMA mean/
// cov + velocity history carry over past the warmup count), and builds the
// calm-window calibrator (overall + solvency + liquidity d² percentiles).
//
// Honest caveat: there is no free historical DeepBook depth, so warmup proxies
// the divergence reference with the CEX consensus (pyth≈coinbase, dbk≈median of
// venues) — a calm cross-venue baseline. Live then keys `div` on the real
// pyth↔DeepBook. Both are "oracle vs market"; the calm baseline transfers.
import { fetchOHLCV } from "./sources/cex";
import {
  asofJoin,
  candlesToSeries,
  Detector,
  FeatureBuilder,
  type Series,
  type AlignedRow,
} from "@seawall/model";
import { AGENT_GRID_MS, LAMBDA_MEAN, LAMBDA_COV } from "@seawall/shared";
import { Calibrator } from "./calibrate";
import { LIVE_FEATURE_CONFIG, LIVE_FEATURE_LIST } from "./live";
import type { AgentConfig } from "./config";

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Warm {
  det: Detector;
  fb: FeatureBuilder;
  cal: Calibrator;
  bars: number;
  calmSamples: number;
}

export async function warmup(_cfg: AgentConfig, nowMs: number, hours = 3): Promise<Warm> {
  const start = nowMs - hours * 3_600_000;
  const [cb, okx, bybit, btc] = await Promise.all([
    fetchOHLCV("coinbase", "SUI-USD", start, nowMs),
    fetchOHLCV("okx", "SUI-USDT", start, nowMs),
    fetchOHLCV("bybit", "SUIUSDT", start, nowMs),
    fetchOHLCV("bybit", "BTCUSDT", start, nowMs),
  ]);
  const series: Series[] = [
    candlesToSeries("coinbase", cb),
    candlesToSeries("okx", okx),
    candlesToSeries("bybit", bybit),
    candlesToSeries("btc", btc),
  ];
  const grid = AGENT_GRID_MS;
  const rows: AlignedRow[] = asofJoin(series, start, nowMs, grid, 3 * grid);

  // synthesize the warmup proxy oracle + divergence reference from the venues
  for (const r of rows) {
    const vs = ["coinbase", "okx", "bybit"]
      .map((k) => r.values[k])
      .filter((x): x is number => typeof x === "number" && x > 0);
    r.values.pyth = r.values.coinbase;
    r.values.dbk = vs.length ? median(vs) : undefined;
  }

  const fb = new FeatureBuilder(LIVE_FEATURE_CONFIG);
  const det = new Detector(LIVE_FEATURE_LIST, { warmup: 60, lambdas: { mean: LAMBDA_MEAN, cov: LAMBDA_COV } });
  const all: number[] = [];
  const solv: number[] = [];
  const liq: number[] = [];
  let bars = 0;
  for (const row of rows) {
    const fv = fb.push(row);
    if (!fv) continue;
    const r = det.update(fv);
    bars++;
    if (r.score > 0) {
      all.push(r.d2);
      solv.push(r.groupD2.solvency ?? 0);
      liq.push(r.groupD2.liquidity ?? 0);
    }
  }
  return { det, fb, cal: new Calibrator(all, solv, liq), bars, calmSamples: all.length };
}
