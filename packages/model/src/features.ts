import type { FeatureVector } from "@seawall/shared";
import type { AlignedRow } from "./align";

export interface FeatureConfig {
  refKey: string; // price series used for returns / realized vol of the target
  divA: string; // divergence numerator price (e.g. "mark", or the oracle)
  divB: string; // divergence denominator price; "__median__" = median of dispKeys
  dispKeys: string[]; // venue prices for cross-venue dispersion
  marketRefKey?: string; // optional market price series -> mktvol (market vol velocity)
  velWindow?: number; // lag for divvel / volvel / mktvol (default 30)
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

// Turns aligned price rows into features, one per tick. Stateful: it keeps EWMAs
// of realized variance (for the target, and optionally the market) plus short
// histories so it can compute the velocity features. Returns null until it has
// enough history (one return, then velWindow more ticks).
export class FeatureBuilder {
  private readonly refKey: string;
  private readonly divA: string;
  private readonly divB: string;
  private readonly dispKeys: string[];
  private readonly marketRefKey?: string;
  private readonly w: number;
  private readonly alpha: number;

  private lastRef: number | null = null;
  private rv = 0;
  private rvSeen = 0;
  private divHist: number[] = [];
  private rvHist: number[] = [];

  // optional market realized-vol state
  private lastMkt: number | null = null;
  private mktRv = 0;
  private mktSeen = 0;
  private mktRvHist: number[] = [];

  constructor(cfg: FeatureConfig) {
    this.refKey = cfg.refKey;
    this.divA = cfg.divA;
    this.divB = cfg.divB;
    this.dispKeys = cfg.dispKeys;
    this.marketRefKey = cfg.marketRefKey;
    this.w = cfg.velWindow ?? 30;
    this.alpha = 2 / ((cfg.rvSpan ?? 30) + 1);
  }

  push(row: AlignedRow): FeatureVector | null {
    const v = row.values;
    const ref = v[this.refKey];
    const a = v[this.divA];
    const venues = this.dispKeys
      .map((k) => v[k])
      .filter((x): x is number => typeof x === "number" && x > 0);
    const b = this.divB === "__median__" ? (venues.length ? median(venues) : undefined) : v[this.divB];

    if (!ref || ref <= 0 || !a || a <= 0 || !b || b <= 0) return null;

    const disp = venues.length >= 2 ? 1e4 * stdevLn(venues) : 0;
    const div = 1e4 * Math.abs(Math.log(a) - Math.log(b));

    // target realized vol (EWMA of squared log-returns)
    if (this.lastRef !== null) {
      const r = Math.log(ref) - Math.log(this.lastRef);
      this.rv = this.rvSeen === 0 ? r * r : this.alpha * r * r + (1 - this.alpha) * this.rv;
      this.rvSeen++;
    }
    this.lastRef = ref;

    // market realized vol (optional; carry rv if the market price is missing)
    if (this.marketRefKey) {
      const m = v[this.marketRefKey];
      if (typeof m === "number" && m > 0) {
        if (this.lastMkt !== null) {
          const rm = Math.log(m) - Math.log(this.lastMkt);
          this.mktRv = this.mktSeen === 0 ? rm * rm : this.alpha * rm * rm + (1 - this.alpha) * this.mktRv;
          this.mktSeen++;
        }
        this.lastMkt = m;
      }
    }

    if (this.rvSeen === 0) return null; // need one return before realized vol exists

    this.divHist.push(div);
    this.rvHist.push(this.rv);
    if (this.marketRefKey) this.mktRvHist.push(this.mktRv);
    if (this.divHist.length <= this.w) return null; // not enough history for velocity

    const divLag = this.divHist[this.divHist.length - 1 - this.w];
    const rvLag = this.rvHist[this.rvHist.length - 1 - this.w];
    const divvel = div - divLag;
    const volvel = Math.log((this.rv + EPS) / (rvLag + EPS));

    const fv: FeatureVector = { disp, div, divvel, volvel };
    if (this.marketRefKey) {
      const mktLag = this.mktRvHist[this.mktRvHist.length - 1 - this.w];
      fv.mktvol = Math.log((this.mktRv + EPS) / (mktLag + EPS));
    }
    return fv;
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
