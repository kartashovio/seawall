import type { Candle } from "@seawall/shared";

// A named time series of (ts, value) points, sorted ascending by ts.
export interface Series {
  name: string;
  points: { ts: number; value: number }[];
}

export interface AlignedRow {
  ts: number;
  values: Record<string, number | undefined>;
}

export function candlesToSeries(name: string, candles: Candle[]): Series {
  return { name, points: candles.map((c) => ({ ts: c.ts, value: c.close })) };
}

// As-of join several series onto one regular grid. For each grid time T and
// each series we take the most recent sample at or before T, but only if it's
// fresher than maxStaleMs. A stale or missing series yields undefined for that
// row, rather than carrying a dead venue forward into a fake-tight cluster.
export function asofJoin(
  series: Series[],
  gridStartMs: number,
  gridEndMs: number,
  gridMs: number,
  maxStaleMs: number,
): AlignedRow[] {
  const idx = series.map(() => 0);
  const rows: AlignedRow[] = [];
  for (let T = gridStartMs; T <= gridEndMs; T += gridMs) {
    const values: Record<string, number | undefined> = {};
    for (let s = 0; s < series.length; s++) {
      const pts = series[s].points;
      while (idx[s] + 1 < pts.length && pts[idx[s] + 1].ts <= T) idx[s]++;
      const cur = pts[idx[s]];
      values[series[s].name] =
        cur && cur.ts <= T && T - cur.ts <= maxStaleMs ? cur.value : undefined;
    }
    rows.push({ ts: T, values });
  }
  return rows;
}
