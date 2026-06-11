// Model and policy parameters, kept in one place. The dashboard gauge bands
// and the on-chain CAUTION thresholds both read from here, so they can't drift
// apart.

// EWMA smoothing for the running mean and covariance (RiskMetrics-style).
export const LAMBDA_MEAN = 0.97;
export const LAMBDA_COV = 0.94;

// Fixed ridge on the covariance so the Cholesky stays positive-definite.
export const SHRINKAGE = 0.15;
export const EPS = 1e-9;

// Score -> parameter mapping. Score is 0-100. Below SCORE_LO we don't tighten
// at all (dead-band so noise doesn't thrash the params); at/above SCORE_HI the
// params sit at their floor. In between it's a logistic.
export const SCORE_LO = 60;
export const SCORE_MID = 80;
export const SCORE_HI = 95;
export const LOGISTIC_GAMMA = 0.15;

// Alert threshold. The real value comes out of the ROC sweep in the backtest;
// this is a starting point.
export const TAU = 90;

// Parameter corridors as [floor, baseline] in percent. The DAO / consuming
// protocol sets these on-chain. The agent can only move "current" toward the
// floor, never past the baseline.
export const MAX_LTV = { floor: 55, baseline: 75 } as const;
export const BORROW_CAP = { floor: 40, baseline: 100 } as const;
