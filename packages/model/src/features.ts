import type { FeatureVector } from "@seawall/shared";
import type { AlignedRow } from "./align";

export interface FeatureConfig {
  refKey: string; // price series used for returns / realized vol
  divA: string; // divergence numerator price (e.g. "mark", or the oracle)
  divB: string; // divergence denominator price; "__median__" = median of dispKeys
  dispKeys: string[]; // venue prices for cross-venue dispersion
  velWindow?: number; // lag for divvel / volvel (default 30)
  rvSpan?: number; // EWMA span for realized variance (default 30)
}

const EPS = 1e-12;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stdevLn(prices: number[]): number {
  const ln = prices.map(Math.log);
  const mean = ln.reduce((a, v) => a + v, 0) / ln.length;
  const varr = ln.reduce((a, v) => a + (v - mean) ** 2, 0) / ln.length;
  return Math.sqrt(varr);
}

// Turns aligned price rows into the 4 backtestable features, one per tick.
// Stateful: it keeps the EWMA of realized variance and short histories of div
// and rv so it can compute the velocity features. Returns null until it has
// enough history (one return, then velWindow more ticks).
export class FeatureBuilder {
  private readonly cfg: Required<FeatureConfig>;
  private readonly alpha: number;
  private lastRef: number | null = null;
  private rv = 0;
  private rvSeen = 0;
  private divHist: number[] = [];
  private rvHist: number[] = [];

  constructor(cfg: FeatureConfig) {
    this.cfg = { velWindow: 30, rvSpan: 30, ...cfg };
    this.alpha = 2 / (this.cfg.rvSpan + 1);
  }

  push(row: AlignedRow): FeatureVector | null {
    const v = row.values;
    const ref = v[this.cfg.refKey];
    const a = v[this.cfg.divA];
    const venues = this.cfg.dispKeys
      .map((k) => v[k])
      .filter((x): x is number => typeof x === "number" && x > 0);
    const b = this.cfg.divB === "__median__" ? (venues.length ? median(venues) : undefined) : v[this.cfg.divB];

    if (!ref || ref <= 0 || !a || a <= 0 || !b || b <= 0) return null;

    const disp = venues.length >= 2 ? 1e4 * stdevLn(venues) : 0;
    const div = 1e4 * Math.abs(Math.log(a) - Math.log(b));

    const w = this.cfg.velWindow;
    if (this.lastRef === null) {
      this.lastRef = ref;
      return null; // need one return before realized vol exists
    }
    const r = Math.log(ref) - Math.log(this.lastRef);
    this.lastRef = ref;
    this.rv = this.rvSeen === 0 ? r * r : this.alpha * r * r + (1 - this.alpha) * this.rv;
    this.rvSeen++;

    this.divHist.push(div);
    this.rvHist.push(this.rv);
    if (this.divHist.length <= w) return null; // not enough history for velocity

    const divLag = this.divHist[this.divHist.length - 1 - w];
    const rvLag = this.rvHist[this.rvHist.length - 1 - w];
    const divvel = div - divLag;
    // log growth rate of realized variance: stable, symmetric "vol velocity"
    const volvel = Math.log((this.rv + EPS) / (rvLag + EPS));

    return { disp, div, divvel, volvel };
  }
}

// Convenience: stream a whole aligned grid into (ts, features) pairs.
export function buildFeatures(
  rows: AlignedRow[],
  cfg: FeatureConfig,
): { ts: number; fv: FeatureVector }[] {
  const fb = new FeatureBuilder(cfg);
  const out: { ts: number; fv: FeatureVector }[] = [];
  for (const row of rows) {
    const fv = fb.push(row);
    if (fv) out.push({ ts: row.ts, fv });
  }
  return out;
}
