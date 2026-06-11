// Multi-venue spot OHLCV from keyless public endpoints (Coinbase, OKX, Bybit).
// Each venue has its own paging scheme, column order, and timestamp unit, so we
// normalize all of it here: every candle comes out with ts in epoch
// MILLISECONDS, sorted ascending, deduped, and clipped to [startMs, endMs].
//
// The caller supplies the venue-specific symbol string (e.g. "BTC-USD" for
// Coinbase, "BTC-USDT" for OKX, "BTCUSDT" for Bybit) because the pair naming
// differs per venue.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Candle } from "@seawall/shared";

export type Venue = "coinbase" | "okx" | "bybit";

const CACHE_DIR = join(process.cwd(), "data", "cex");
// Public endpoints are rate-limited, so identify ourselves politely.
const USER_AGENT = "seawall-agent/0.0 (research)";

// --- public entry point ---

// Pull spot candles for [startMs, endMs] from one venue. Result is ascending by
// ts, in epoch ms, with one bar per granularity step. Default 1-minute bars.
export async function fetchOHLCV(
  venue: Venue,
  symbol: string,
  startMs: number,
  endMs: number,
  granularityMin = 1,
): Promise<Candle[]> {
  if (endMs <= startMs) return [];

  const key = cacheKey(venue, symbol, startMs, endMs, granularityMin);
  const cached = readCache(key);
  if (cached) return cached;

  let rows: Candle[];
  if (venue === "coinbase") rows = await fetchCoinbase(symbol, startMs, endMs, granularityMin);
  else if (venue === "okx") rows = await fetchOkx(symbol, startMs, endMs, granularityMin);
  else if (venue === "bybit") rows = await fetchBybit(symbol, startMs, endMs, granularityMin);
  else throw new Error(`unknown venue: ${venue}`);

  rows = cleanup(rows, startMs, endMs);
  writeCache(key, rows);
  return rows;
}

// --- Coinbase ---
// GET /products/{SYMBOL}/candles?granularity=<sec>&start=ISO&end=ISO
// Returns up to ~300 rows as [time_SECONDS, low, high, open, close, volume],
// newest-first. Paged by walking the time window forward.
async function fetchCoinbase(
  symbol: string,
  startMs: number,
  endMs: number,
  granularityMin: number,
): Promise<Candle[]> {
  const granSec = granularityMin * 60;
  const stepMs = granSec * 1000;
  // 300 candles per response is the cap; stay just under it.
  const pageMs = stepMs * 290;
  const out: Candle[] = [];

  let from = startMs;
  while (from < endMs) {
    const to = Math.min(from + pageMs, endMs);
    const url =
      `https://api.exchange.coinbase.com/products/${symbol}/candles` +
      `?granularity=${granSec}` +
      `&start=${new Date(from).toISOString()}` +
      `&end=${new Date(to).toISOString()}`;
    const data = (await getJson(url)) as number[][];
    for (const r of data) {
      // [time_SECONDS, low, high, open, close, volume]
      out.push({
        ts: r[0] * 1000,
        low: r[1],
        high: r[2],
        open: r[3],
        close: r[4],
        volume: r[5],
      });
    }
    from = to;
  }
  return out;
}

// --- OKX ---
// GET /api/v5/market/history-candles?instId={SYMBOL}&bar=<bar>&after={ms}&limit=300
// data = [[ts_MS_string, o, h, l, c, vol, ...], ...], newest-first.
// "after" is an older-than cursor: it returns candles strictly before that ts.
// We page backwards from endMs until we pass startMs.
async function fetchOkx(
  symbol: string,
  startMs: number,
  endMs: number,
  granularityMin: number,
): Promise<Candle[]> {
  const bar = okxBar(granularityMin);
  const out: Candle[] = [];

  let after = endMs + 1; // start just past the window's end
  while (after > startMs) {
    const url =
      `https://www.okx.com/api/v5/market/history-candles` +
      `?instId=${symbol}&bar=${bar}&after=${after}&limit=300`;
    const body = (await getJson(url)) as { code: string; msg: string; data: string[][] };
    if (body.code !== "0") throw new Error(`okx error ${body.code}: ${body.msg}`);
    const data = body.data;
    if (data.length === 0) break;

    for (const r of data) {
      // [ts_MS, open, high, low, close, vol, ...]
      out.push({
        ts: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
      });
    }
    // data is newest-first; the last row is the oldest in this page.
    const oldest = Number(data[data.length - 1][0]);
    if (oldest <= startMs) break;
    after = oldest; // next page is strictly older than this
  }
  return out;
}

// --- Bybit ---
// GET /v5/market/kline?category=spot&symbol={SYMBOL}&interval=<min>&start={ms}&end={ms}&limit=1000
// result.list = [[ts_MS_string, o, h, l, c, vol, turnover], ...], newest-first.
// "start"/"end" are ms bounds; page backwards by moving "end" older.
async function fetchBybit(
  symbol: string,
  startMs: number,
  endMs: number,
  granularityMin: number,
): Promise<Candle[]> {
  const interval = String(granularityMin);
  const stepMs = granularityMin * 60 * 1000;
  const out: Candle[] = [];

  let end = endMs;
  while (end > startMs) {
    const url =
      `https://api.bybit.com/v5/market/kline` +
      `?category=spot&symbol=${symbol}&interval=${interval}` +
      `&start=${startMs}&end=${end}&limit=1000`;
    const body = (await getJson(url)) as {
      retCode: number;
      retMsg: string;
      result: { list: string[][] };
    };
    if (body.retCode !== 0) throw new Error(`bybit error ${body.retCode}: ${body.retMsg}`);
    const list = body.result?.list ?? [];
    if (list.length === 0) break;

    for (const r of list) {
      // [ts_MS, open, high, low, close, vol, turnover]
      out.push({
        ts: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
      });
    }
    // list is newest-first; the last row is the oldest in this page.
    const oldest = Number(list[list.length - 1][0]);
    if (oldest <= startMs) break;
    end = oldest - stepMs; // next page ends one step before this page's oldest bar
  }
  return out;
}

// --- helpers ---

// OKX uses a letter suffix on the bar size. We only need minute bars here.
function okxBar(granularityMin: number): string {
  if (granularityMin < 60) return `${granularityMin}m`;
  if (granularityMin < 1440) return `${granularityMin / 60}H`;
  return `${granularityMin / 1440}D`;
}

// Sort ascending, drop duplicate timestamps (paging windows can overlap), and
// clip to the requested window. Bars are keyed by their open time.
function cleanup(rows: Candle[], startMs: number, endMs: number): Candle[] {
  rows.sort((a, b) => a.ts - b.ts);
  const out: Candle[] = [];
  let last = -1;
  for (const r of rows) {
    if (r.ts < startMs || r.ts >= endMs) continue;
    if (r.ts === last) continue;
    out.push(r);
    last = r.ts;
  }
  return out;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// --- on-disk cache (data/cex/, gitignored) ---

function cacheKey(
  venue: Venue,
  symbol: string,
  startMs: number,
  endMs: number,
  granularityMin: number,
): string {
  const safeSym = symbol.replace(/[^A-Za-z0-9_-]/g, "_");
  return `${venue}_${safeSym}_${granularityMin}m_${startMs}_${endMs}.json`;
}

function readCache(key: string): Candle[] | null {
  const path = join(CACHE_DIR, key);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Candle[];
}

function writeCache(key: string, rows: Candle[]): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, key), JSON.stringify(rows));
}
