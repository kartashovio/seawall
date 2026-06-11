// Off-chain agent. It pulls market data from a few sources, builds the feature
// vector, scores it, and when the score warrants it posts a fresh Pyth update
// plus a tighten-only ParamRequest in a single PTB.
//
// The same data path feeds the backtest harness (src/backtest.ts), so live and
// historical runs go through identical feature code. See docs/ml-plan.md.
export {};
