// Pyth SUI/USD price feed ids.
//
// These are two different feeds for the same pair. The testnet/beta feed is
// what the live agent and the contract read (via hermes-beta). The mainnet
// feed is only used for backtests, because Pyth Benchmarks serves mainnet
// history. Each one 404s on the other's host, so you can't use one for both.
//
// Prefer resolving the live id from the pyth-sui-js feed list at startup rather
// than trusting the constant below.
export const PYTH_SUI_USD = {
  testnetBeta:
    "0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266",
  mainnet:
    "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
} as const;

export const HERMES_BETA_URL = "https://hermes-beta.pyth.network";
export const PYTH_BENCHMARKS_URL = "https://benchmarks.pyth.network";

// Mainnet Hermes — serves the LIVE mainnet feed (PYTH_SUI_USD.mainnet). Used ONLY
// by the read-only MAINNET observatory (display-only, never on the enforced path).
// Not hermes-beta (404s the mainnet id) and not Benchmarks (history, not live).
export const HERMES_MAINNET_URL = "https://hermes.pyth.network";
