// Assembles one live feature row from multiple sources for the FeatureBuilder:
//   pyth   — oracle price (hermes-beta, the feed the contract reads)
//   dbk    — DeepBook CLOB mid (on-chain, the divergence reference)
//   cex    — coinbase/okx/bybit SUI spot (cross-venue dispersion)
//   btc    — market proxy (mktvol)
// The agent's `div` feature keys on pyth↔dbk (same threat the contract
// re-derives on-chain); disp keys on the CEX venues. Missing sources → undefined
// (asofJoin/FeatureBuilder drop them rather than carry a stale value forward).
import type { SuiClient } from "@mysten/sui/client";
import type { FeatureConfig } from "@seawall/model";
import { fetchLatest } from "./sources/pyth";
import { readBook, type BookSnapshot } from "./deepbook";
import type { AgentConfig } from "./config";

export interface LiveRow {
  ts: number;
  values: Record<string, number | undefined>;
  book: BookSnapshot;
  pythConf: number;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "User-Agent": "seawall-agent/0.0", Accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

// Keyless last-price tickers (live). Each venue names the pair differently.
async function coinbaseTicker(sym: string): Promise<number> {
  const b = await getJson(`https://api.exchange.coinbase.com/products/${sym}/ticker`);
  return Number(b.price);
}
async function okxTicker(sym: string): Promise<number> {
  const b = await getJson(`https://www.okx.com/api/v5/market/ticker?instId=${sym}`);
  return Number(b.data?.[0]?.last);
}
async function bybitTicker(sym: string): Promise<number> {
  const b = await getJson(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${sym}`);
  return Number(b.result?.list?.[0]?.lastPrice);
}

const safe = async (p: Promise<number>): Promise<number | undefined> => {
  try {
    const v = await p;
    return Number.isFinite(v) && v > 0 ? v : undefined;
  } catch {
    return undefined;
  }
};

export async function fetchLiveRow(client: SuiClient, cfg: AgentConfig, nowMs: number): Promise<LiveRow> {
  const [pythTick, book, coinbase, okx, bybit, btc] = await Promise.all([
    fetchLatest(cfg.feedId),
    readBook(client, cfg.poolId, cfg.dbusdcType, cfg.registeredAgent),
    safe(coinbaseTicker("SUI-USD")),
    safe(okxTicker("SUI-USDT")),
    safe(bybitTicker("SUIUSDT")),
    safe(bybitTicker("BTCUSDT")),
  ]);
  return {
    ts: nowMs,
    values: {
      pyth: pythTick.price,
      dbk: book.ok ? (book.mid as number) : undefined, // loss of signal → undefined, never fake-0
      coinbase,
      okx,
      bybit,
      btc,
    },
    book,
    pythConf: pythTick.conf,
  };
}

// FeatureBuilder config for BOTH warmup (dbk=CEX-median proxy) and live
// (dbk=DeepBook mid). div = pyth↔dbk; disp = CEX dispersion; mktvol = BTC.
export const LIVE_FEATURE_CONFIG: FeatureConfig = {
  refKey: "pyth",
  divA: "pyth",
  divB: "dbk",
  dispKeys: ["coinbase", "okx", "bybit"],
  marketRefKey: "btc",
  velWindow: 30,
  rvSpan: 30,
};

export const LIVE_FEATURE_LIST: string[] = ["disp", "div", "divvel", "volvel", "mktvol"];
