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
// ⚠️ Pyth-deployment correction [verified 2026-06-13, Step 2 GATE 2]: Sui testnet
// has TWO Pyth deployments. The OFFICIAL one (Pyth docs, "Beta channel") is
// package 0xabf837e9 / State 0x243759…1c7c — and that is the one our guardian
// Move package compiles against (the `sui-contract-testnet` Pyth dep declares
// published-at = pyth = 0xabf837e9). The de-risk snapshot mistakenly used State
// 0xd3e79c, which belongs to a SECOND, non-canonical Pyth (package 0x431c1cfb):
// its PriceInfoObject type is 0x431c1cfb::…, so poke(&PriceInfoObject) fails with
// CommandArgumentError TypeMismatch. Object types are keyed by the ORIGINAL
// package, so the package MUST match between the Move build and the State we post
// updates to. Canonical set: State 0x243759 + package 0xabf837e9 + pio 0x1ebb29.
export const TESTNET_SNAPSHOT = {
  // resolve-live; snapshot only
  pythState: "0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c",
  wormholeState: "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790",
  pythPackage: "0xabf837e98c26087cba0883c0a7a28326b1fa3c5e1e2c5abdb486f9e8f594c837",
  deepbookPackage: "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c",
  suiDbusdcPool: "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5", // Base SUI / Quote DBUSDC
  suiUsdPriceInfoObject: "0x1ebb295c789cc42b3b2a1606482cd1c7124076a0f5676718501fda8c7fd075a0", // type 0xabf837e9 (matches guardian)
  dbusdcType:
    "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC",
} as const;

// MAINNET ids — for the read-only observatory ONLY (display-only, never enforced).
// Verified live this session: the level2 read works via devInspect (no key/gas),
// and mainnet dbk mid $0.7593 ≈ mainnet Pyth $0.7592. Same "resolve-live, snapshot
// only" caveat as TESTNET_SNAPSHOT. SUI=9 / USDC=6 → DEC_FACTOR 10^3 = 1000,
// identical to testnet SUI/DBUSDC, so the divergence/mid decimal math is reused
// UNCHANGED. The observatory does NOT post on-chain, so no mainnet Pyth State /
// Wormhole / PriceInfoObject is needed here.
export const MAINNET_SNAPSHOT = {
  // resolve-live; snapshot only
  deepbookPackage: "0x0e735f8c93a95722efd73521aca7a7652c0bb71ed1daf41b26dfd7d1ff71f748",
  suiUsdcPool: "0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407", // Base SUI / Quote USDC
  usdcType:
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
} as const;
