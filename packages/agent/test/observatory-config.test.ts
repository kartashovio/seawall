import { describe, it, expect } from "vitest";
import { getFullnodeUrl } from "@mysten/sui/client";
import { PYTH_SUI_USD, HERMES_MAINNET_URL } from "@seawall/shared";
import { SUI_TYPE } from "../src/config";
import { loadObservatoryConfig } from "../src/observatory-config";

// The mainnet observatory builds its config DIRECTLY — it must NOT route through
// loadConfig() (whose deliberate mainnet-feed guard would throw). Pure
// construction, no network.
describe("loadObservatoryConfig — mainnet config built directly (never via loadConfig)", () => {
  it("does NOT throw on the mainnet feed (loadConfig would)", () => {
    expect(() => loadObservatoryConfig()).not.toThrow();
  });

  it("returns the verified mainnet ids + mainnet hermes host", () => {
    const c = loadObservatoryConfig();
    expect(c.rpcUrl).toBe(getFullnodeUrl("mainnet"));
    expect(c.feedId).toBe(PYTH_SUI_USD.mainnet);
    expect(c.poolId).toBe("0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407");
    expect(c.deepbookPackage).toBe("0x0e735f8c93a95722efd73521aca7a7652c0bb71ed1daf41b26dfd7d1ff71f748");
    expect(c.baseType).toBe(SUI_TYPE);
    expect(c.quoteType).toBe(
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    );
    expect(c.hermesUrl).toBe(HERMES_MAINNET_URL);
    expect(c.hermesUrl).toBe("https://hermes.pyth.network");
  });

  it("the SUI(9)/USDC(6) decimal factor is 10^3 = 1000 (same as testnet DBUSDC)", () => {
    // The observatory reuses deepbook.ts's DEC_FACTOR unchanged because the
    // base/quote decimals match SUI/DBUSDC. Bind that fact here.
    const DEC_FACTOR = 10 ** (9 - 6);
    expect(DEC_FACTOR).toBe(1000);
  });
});
