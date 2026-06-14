import { describe, it, expect, vi, afterEach } from "vitest";
import { PYTH_SUI_USD } from "@seawall/shared";
import { fetchLatest, fetchLatestFrom } from "../src/sources/pyth";

// Mocks global fetch to capture the URL each call builds. Hermes wants the feed id
// BARE (leading 0x stripped) — a stray digit yields a 400 "Odd number of digits".

const HERMES_LATEST_BODY = {
  parsed: [{ price: { price: "75920000", conf: "30000", expo: -8, publish_time: 1_700_000_000 } }],
};

function mockFetch(): { calls: string[] } {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => HERMES_LATEST_BODY } as unknown as Response;
    }),
  );
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLatestFrom — hits the given hermes host with a bare-hex feed id", () => {
  it("builds <host>/v2/updates/price/latest?ids[]=<bare 64-hex> for the mainnet host", async () => {
    const { calls } = mockFetch();
    const tick = await fetchLatestFrom("https://hermes.pyth.network", PYTH_SUI_USD.mainnet);
    expect(calls).toHaveLength(1);
    const bare = PYTH_SUI_USD.mainnet.replace(/^0x/, "");
    expect(calls[0]).toBe(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${bare}`);
    expect(calls[0]).not.toContain("ids[]=0x"); // bare hex, no 0x → no 400
    // toTick path: expo -8 applied to both price and conf
    expect(tick.price).toBeCloseTo(0.7592, 6);
    expect(tick.conf).toBeCloseTo(0.0003, 6);
  });

  it("strips a leading 0x so the hex stays even-length", async () => {
    const { calls } = mockFetch();
    await fetchLatestFrom("https://hermes.pyth.network", "0x" + "ab".repeat(32));
    expect(calls[0]).toContain(`ids[]=${"ab".repeat(32)}`);
    expect(calls[0]).not.toContain("0xab");
  });
});

describe("fetchLatest — UNCHANGED: still targets hermes-beta (regression)", () => {
  it("uses the hermes-beta host for the existing testnet-beta callers", async () => {
    const { calls } = mockFetch();
    await fetchLatest(PYTH_SUI_USD.testnetBeta);
    const bare = PYTH_SUI_USD.testnetBeta.replace(/^0x/, "");
    expect(calls[0]).toBe(`https://hermes-beta.pyth.network/v2/updates/price/latest?ids[]=${bare}`);
  });
});
