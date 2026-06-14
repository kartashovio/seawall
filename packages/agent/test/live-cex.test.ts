import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Mock the per-chain sources so fetchLiveRow only exercises the CEX-fetch wiring.
vi.mock("../src/sources/pyth", () => ({
  fetchLatest: vi.fn(async () => ({ ts: 1, price: 0.7592, conf: 0.0003 })),
  fetchLatestFrom: vi.fn(async () => ({ ts: 1, price: 0.7592, conf: 0.0003 })),
}));
vi.mock("../src/deepbook", () => ({
  readBook: vi.fn(async () => ({ ok: true, mid: 0.7593, imb: 0.1, spread: 1.2 })),
}));

import { fetchLiveRow, fetchCexBlock } from "../src/live";

const cexHosts = ["api.exchange.coinbase.com", "www.okx.com", "api.bybit.com"];

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(async (url: string) => {
    // venue-specific minimal bodies
    if (url.includes("coinbase")) return { ok: true, json: async () => ({ price: "0.76" }) } as Response;
    if (url.includes("okx")) return { ok: true, json: async () => ({ data: [{ last: "0.761" }] }) } as Response;
    if (url.includes("bybit") && url.includes("BTC"))
      return { ok: true, json: async () => ({ result: { list: [{ lastPrice: "65000" }] } }) } as Response;
    if (url.includes("bybit")) return { ok: true, json: async () => ({ result: { list: [{ lastPrice: "0.759" }] } }) } as Response;
    return { ok: true, json: async () => ({}) } as Response;
  });
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("fetchCexBlock — chain-agnostic CEX/BTC tickers, fetched once", () => {
  it("returns the 4 venues and hits each CEX host exactly once", async () => {
    const cex = await fetchCexBlock();
    expect(cex.coinbase).toBeCloseTo(0.76, 6);
    expect(cex.okx).toBeCloseTo(0.761, 6);
    expect(cex.bybit).toBeCloseTo(0.759, 6);
    expect(cex.btc).toBeCloseTo(65000, 6);
    const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
    for (const host of cexHosts) expect(urls.filter((u) => u.includes(host)).length).toBeGreaterThanOrEqual(1);
  });
});

describe("fetchLiveRow — reuses an injected CEX block (no refetch)", () => {
  const cfg = {
    feedId: "0xfeed",
    poolId: "0xpool",
    dbusdcType: "0xq::q::Q",
    registeredAgent: "0xagent",
  } as never;

  it("with an injected cex block, does NOT call any CEX endpoint", async () => {
    const cex = { coinbase: 0.76, okx: 0.761, bybit: 0.759, btc: 65000 };
    const row = await fetchLiveRow({} as never, cfg, 123, cex);
    const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
    for (const host of cexHosts) expect(urls.some((u) => u.includes(host))).toBe(false);
    // but the injected venues land on the row
    expect(row.values.coinbase).toBe(0.76);
    expect(row.values.okx).toBe(0.761);
    expect(row.values.bybit).toBe(0.759);
    expect(row.values.btc).toBe(65000);
    expect(row.values.pyth).toBeCloseTo(0.7592, 6);
    expect(row.values.dbk).toBeCloseTo(0.7593, 6);
  });

  it("without a cex arg, fetches its own CEX block (existing callers unchanged)", async () => {
    const row = await fetchLiveRow({} as never, cfg, 123);
    const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes("coinbase"))).toBe(true);
    expect(row.values.coinbase).toBeCloseTo(0.76, 6);
  });
});
