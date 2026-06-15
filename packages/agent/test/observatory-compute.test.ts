import { describe, it, expect, vi, beforeEach } from "vitest";
import { Detector, FeatureBuilder } from "@seawall/model";
import { Calibrator } from "../src/calibrate";
import { LIVE_FEATURE_CONFIG, LIVE_FEATURE_LIST } from "../src/live";

// Mock the per-chain reads so computeObservatory is deterministic + offline.
import type { BookSnapshot } from "../src/deepbook";

const fetchLatestFrom = vi.fn(async (_host: string, _id: string) => ({ ts: 1, price: 0.7592, conf: 0.0003 }));
const readBook = vi.fn(async (): Promise<BookSnapshot> => ({ ok: true, mid: 0.7593, imb: 0.1, spread: 1.2 }));
vi.mock("../src/sources/pyth", () => ({
  fetchLatest: vi.fn(),
  fetchLatestFrom: (...a: unknown[]) => fetchLatestFrom(...(a as [string, string])),
}));
vi.mock("../src/deepbook", () => ({ readBook: (...a: unknown[]) => readBook(...(a as [])) }));

import { computeObservatory } from "../src/observatory";
import type { ObservatoryConfig } from "../src/observatory-config";

const obsCfg: ObservatoryConfig = {
  rpcUrl: "https://fullnode.mainnet.sui.io:443",
  feedId: "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
  poolId: "0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407",
  deepbookPackage: "0x0e735f8c93a95722efd73521aca7a7652c0bb71ed1daf41b26dfd7d1ff71f748",
  baseType: "0x2::sui::SUI",
  quoteType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  hermesUrl: "https://hermes.pyth.network",
};

// A warmed triple on a calm baseline (same shape the live loop carries).
function warmTriple() {
  const fb = new FeatureBuilder(LIVE_FEATURE_CONFIG);
  const det = new Detector(LIVE_FEATURE_LIST, { warmup: 60, lambdas: { mean: 0.99, cov: 0.99 } });
  const all: number[] = [], solv: number[] = [], liq: number[] = [];
  const base = 0.76;
  for (let i = 0; i < 200; i++) {
    const p = base * (1 + 0.0005 * Math.sin(i * 0.3)); // calm wobble
    const row = { ts: i * 60_000, values: { pyth: p, dbk: p, coinbase: p, okx: p * 1.0002, bybit: p * 0.9998, btc: 65000 * (1 + 0.0003 * Math.cos(i * 0.2)) } };
    const fv = fb.push(row);
    if (!fv) continue;
    const r = det.update(fv);
    if (r.score > 0) { all.push(r.d2); solv.push(r.groupD2.solvency ?? 0); liq.push(r.groupD2.liquidity ?? 0); }
  }
  void all;
  void solv;
  void liq;
  return { det, fb, cal: Calibrator.forFeatures(det.features) };
}

const cex = { coinbase: 0.76, okx: 0.7602, bybit: 0.7598, btc: 65000 };

beforeEach(() => {
  fetchLatestFrom.mockClear();
  readBook.mockClear();
  fetchLatestFrom.mockResolvedValue({ ts: 1, price: 0.7592, conf: 0.0003 });
  readBook.mockResolvedValue({ ok: true, mid: 0.7593, imb: 0.1, spread: 1.2 });
});

describe("computeObservatory — agreeing prices read CALM, divBps tiny", () => {
  it("divBps = |price - mid| / price * 1e4 ≈ 1.3 bps on a deep market", async () => {
    const t = warmTriple();
    const block = await computeObservatory({} as never, obsCfg, cex, 12_000_000, t);
    // |0.7592 - 0.7593| / 0.7592 * 1e4 = 1.317 bps
    expect(block.divBps).toBeCloseTo(1.317, 2);
    expect(block.ok).toBe(true);
    expect(block.book.mid).toBeCloseTo(0.7593, 6);
    expect(block.book.ok).toBe(true);
    // shape matches ObservatoryBlock
    expect(typeof block.score).toBe("number");
    expect(typeof block.solvency).toBe("number");
    expect(typeof block.liquidity).toBe("number");
    expect(typeof block.d2).toBe("number");
    expect(block.k).toBe(LIVE_FEATURE_LIST.length);
    expect(block.contributions).toBeTypeOf("object");
  });

  it("passes the mainnet host + mainnet deepbook package to the per-chain reads", async () => {
    const t = warmTriple();
    await computeObservatory({} as never, obsCfg, cex, 12_000_000, t);
    expect(fetchLatestFrom).toHaveBeenCalledWith(obsCfg.hermesUrl, obsCfg.feedId);
    const args = readBook.mock.calls[0] as unknown[];
    expect(args[1]).toBe(obsCfg.poolId); // poolId
    expect(args[5]).toBe(obsCfg.deepbookPackage); // deepbookPackage (6th positional)
  });

  it("never refetches the shared CEX block (reuses the injected one)", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const t = warmTriple();
    await computeObservatory({} as never, obsCfg, cex, 12_000_000, t);
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("loss-of-signal book (ok:false) → block.ok:false, mid:null, divBps:0 (never fake-calm)", async () => {
    readBook.mockResolvedValueOnce({ ok: false, mid: null, imb: null, spread: null });
    const t = warmTriple();
    const block = await computeObservatory({} as never, obsCfg, cex, 12_000_000, t);
    expect(block.ok).toBe(false);
    expect(block.book.ok).toBe(false);
    expect(block.book.mid).toBeNull();
    expect(block.divBps).toBe(0);
  });
});
