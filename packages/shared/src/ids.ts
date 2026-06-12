// On-chain object IDs — SNAPSHOT from the de-risk run (RESULTS.md, 2026-06-08).
//
// ⚠️⚠️ DO NOT TRUST THESE AT RUNTIME. They are a convenience snapshot for reading
// the explorer / sanity checks only. The agent, keeper, and deploy scripts MUST
// resolve the live values at startup:
//   - Pyth State / Wormhole State        -> from @pythnetwork/pyth-sui-js (or Pyth's
//                                            testnet contracts.json), then PROVE via a
//                                            same-PTB updatePriceFeeds devInspect
//                                            BEFORE treating any value as canonical.
//   - DeepBook package / pool / DBUSDC    -> from @mysten/deepbook-v3 utils/constants.ts
//   - PriceInfoObject + feed id           -> resolve the beta feed id live from the
//                                            pyth-sui-js feed list; assert it on-chain.
//
// Pyth testnet contracts MIGRATE to new State IDs ~July 31 2026 — these are the
// PRE-migration values (correct for June 21 + Demo Day). After that, re-resolve.
//
// NOTE: RESULTS.md records two conflicting Pyth values (a package vs a State id);
// the GATE-2 devInspect in Step 2 is what canonicalises the real Pyth State.
export const TESTNET_SNAPSHOT = {
  // resolve-live; snapshot only
  pythState: "0xd3e79c2c083b934e78b3bd58a490ec6b092561954da6e7322e1e2b3c8abfddc0",
  wormholeState: "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790",
  pythPackage: "0x431c1cfb9a4da32c77810a1c48aa19cc2edb03010281e0fe411b4b3b38589df1",
  deepbookPackage: "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c",
  suiDbusdcPool: "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5", // Base SUI / Quote DBUSDC
  suiUsdPriceInfoObject: "0x1ebb295c789cc42b3b2a1606482cd1c7124076a0f5676718501fda8c7fd075a0",
  dbusdcType:
    "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC",
} as const;
