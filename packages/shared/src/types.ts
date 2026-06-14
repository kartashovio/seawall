// The feature vector the detector scores. Backtests use the first four, which
// have free history. The two depth features only exist live (no free source of
// historical order-book depth), so they're optional here.
export interface FeatureVector {
  disp: number; // cross-venue price dispersion, bps
  div: number; // oracle vs market divergence, bps
  divvel: number; // divergence velocity, bps per window
  volvel: number; // realized-volatility velocity, dimensionless
  mktvol?: number; // market (e.g. BTC) volatility velocity, dimensionless (optional)
  imb?: number; // depth imbalance in [-1, 1] (live only)
  spread?: number; // effective spread, bps (live only)
}

export interface ScoreResult {
  score: number; // 0-100
  d2: number; // squared Mahalanobis distance
  contributions: Record<string, number>; // each feature's share of d2
  // per-component marginal d2 (solvency vs liquidity), drives the two params
  groupD2: Record<string, number>;
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

// On-chain corridor position, basis points (the dashboard reads these off the
// SSE tick to draw current-vs-[floor,baseline] bars).
export interface BpsPair {
  maxLtv: number;
  borrowCap: number;
}

// MAINNET read-only observatory — DISPLAY ONLY, never on any enforcement path.
// A SECOND risk score computed from the LIVE MAINNET market (mainnet Pyth SUI/USD
// vs mainnet SUI/USDC DeepBook mid) using the SAME unchanged EWMA-Mahalanobis
// model. A deep real market reads CALM (~1 bps divergence), proving the model is
// correct and the thin-testnet-pool jumpiness is a pool artifact. It is computed
// AFTER the testnet submit decision and attached ONLY to the returned DTO; its
// score/features/divBps NEVER reach computeRequest/decideRequest/shouldSend/
// submitOnce. NOTE: the `contributions` for disp/mktvol legitimately MATCH the
// enforced row (the CEX/BTC inputs are chain-agnostic) — that is EXPECTED, not a
// bug; only div/divvel differ (per-chain Pyth↔book).
export interface ObservatoryBlock {
  ok: boolean; // false = mainnet read failed / loss-of-signal (book not ok)
  score: number; // calibrated 0-100 overall (display only)
  solvency: number;
  liquidity: number;
  d2: number; // raw squared Mahalanobis distance
  k: number; // feature count (χ²(k) reference)
  contributions: Record<string, number>;
  divBps: number; // |mainnetPrice - mainnetMid| / mainnetPrice * 1e4, bps
  book: { mid: number | null; spread: number | null; imb: number | null; ok: boolean };
}

// The SSE payload the agent's control-server streams and the dashboard renders.
// The ONLY contract between the v1 agent island and the v2 dashboard island
// (they never exchange SDK objects — only this pure-TS shape + the chain).
export interface AgentTickDTO {
  ts: number;
  mode: "calm" | "elevate" | "malicious" | "dead";
  // calibrated 0-100 scores (overall + the two component drivers)
  scoreOverall: number;
  solvency: number;
  liquidity: number;
  // model internals (must-have #2 glass-box): raw squared Mahalanobis distance,
  // feature count k (χ²(k) reference), and each feature's share of d².
  d2: number;
  k: number;
  contributions: Record<string, number>;
  // what the agent asked vs what's applied on-chain, + the DAO corridor bounds.
  req: BpsPair;
  applied: BpsPair;
  floor: BpsPair;
  baseline: BpsPair;
  paused: boolean;
  sent: boolean;
  digest?: string;
  clamped?: number; // # of RequestClamped events this tick (malicious-refused proof)
  book?: { ok: boolean; mid: number | null; imb: number | null; spread: number | null };
  // MAINNET read-only observatory (display only; see ObservatoryBlock). OPTIONAL
  // so a mainnet hiccup simply omits it and the frame stays a legal SSE payload —
  // the enforced testnet tick is fully computed and returned regardless.
  observatory?: ObservatoryBlock;
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
