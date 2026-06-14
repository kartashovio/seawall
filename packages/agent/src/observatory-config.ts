// Config for the READ-ONLY MAINNET observatory (display-only, NEVER enforced).
//
// It is built DIRECTLY here — it must NOT route through loadConfig(), whose
// deliberate mainnet-feed guard throws ("feedId is the MAINNET id"). That guard
// protects the ENFORCED agent (the contract reads the beta feed); the observatory
// has no signer, posts nothing on-chain, and only reads the mainnet market to
// compute a second, advisory score for the dashboard.
//
// No signing key, no Pyth State / Wormhole / PriceInfoObject — the observatory's
// divergence is `|mainnet hermes price - mainnet DeepBook mid| / price` (bps),
// both fetched read-only (devInspect for the book, plain GET for Hermes).
import { getFullnodeUrl } from "@mysten/sui/client";
import { PYTH_SUI_USD, HERMES_MAINNET_URL, MAINNET_SNAPSHOT } from "@seawall/shared";
import { SUI_TYPE } from "./config";

export interface ObservatoryConfig {
  rpcUrl: string;
  feedId: string;
  poolId: string;
  deepbookPackage: string;
  baseType: string;
  quoteType: string;
  hermesUrl: string;
}

export function loadObservatoryConfig(): ObservatoryConfig {
  return {
    rpcUrl: getFullnodeUrl("mainnet"),
    feedId: PYTH_SUI_USD.mainnet,
    poolId: MAINNET_SNAPSHOT.suiUsdcPool,
    deepbookPackage: MAINNET_SNAPSHOT.deepbookPackage,
    baseType: SUI_TYPE,
    quoteType: MAINNET_SNAPSHOT.usdcType,
    hermesUrl: HERMES_MAINNET_URL,
  };
}
