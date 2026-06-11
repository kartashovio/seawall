// The feature vector the detector scores. Backtests use the first four, which
// have free history. The two depth features only exist live (no free source of
// historical order-book depth), so they're optional here.
export interface FeatureVector {
  disp: number; // cross-venue price dispersion, bps
  div: number; // oracle vs market divergence, bps
  divvel: number; // divergence velocity, bps per window
  volvel: number; // realized-volatility velocity, dimensionless
  imb?: number; // depth imbalance in [-1, 1] (live only)
  spread?: number; // effective spread, bps (live only)
}

export interface ScoreResult {
  score: number; // 0-100
  d2: number; // squared Mahalanobis distance
  contributions: Record<string, number>; // each feature's share of d2
}

// What the agent asks the contract to set. Tighten-only; the contract clamps it
// to the corridor and rejects anything looser than the current value.
export interface ParamRequest {
  maxLtv: number; // percent
  borrowCap: number; // percent
}

export interface RiskEvent {
  ts: number;
  score: number;
  request: ParamRequest;
  contributions: Record<string, number>;
}

// --- raw market data, normalized at ingest ---

// One OHLCV bar. ts is epoch MILLISECONDS (every adapter normalizes to this).
export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// One Pyth price observation. ts is epoch milliseconds; price already has expo
// applied (i.e. a real number), conf is the confidence interval in the same unit.
export interface PythTick {
  ts: number;
  price: number;
  conf: number;
}
