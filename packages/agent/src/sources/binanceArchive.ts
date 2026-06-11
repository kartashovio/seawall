// Binance public archive adapter. Pulls daily kline files from
// https://data.binance.vision (static, free, keyless) and returns them as
// Candles with ts in epoch milliseconds, sorted ascending.
//
// Each daily file is a .zip holding a single CSV with NO header, comma-
// separated. We cache the raw .zip under data/binance/ and skip the download
// if it's already there.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";
import type { Candle } from "@seawall/shared";

const BASE = "https://data.binance.vision";
const CACHE_DIR = join(process.cwd(), "data", "binance");

// Maps the futures kline kind to its URL directory.
const FUTURES_DIRS = {
  mark: "markPriceKlines",
  index: "indexPriceKlines",
  last: "klines",
} as const;

type Kind = keyof typeof FUTURES_DIRS;

// 1-minute mark/index/last-price klines from the USDⓈ-M futures archive.
export async function fetchFuturesKlines(
  kind: Kind,
  symbol: string,
  date: string,
): Promise<Candle[]> {
  const sym = symbol.toUpperCase();
  const dir = FUTURES_DIRS[kind];
  const file = `${sym}-1m-${date}.zip`;
  const url = `${BASE}/data/futures/um/daily/${dir}/${sym}/1m/${file}`;
  const cacheName = `futures-${dir}-${file}`;
  const csv = await readArchiveCsv(url, cacheName);
  return parseKlines(csv);
}

// 1-second spot klines. In 2025 the spot-1s open_time is in MICROSECONDS
// (16 digits), so parseKlines divides anything above 1e15 down to ms.
export async function fetchSpot1s(symbol: string, date: string): Promise<Candle[]> {
  const sym = symbol.toUpperCase();
  const file = `${sym}-1s-${date}.zip`;
  const url = `${BASE}/data/spot/daily/klines/${sym}/1s/${file}`;
  const cacheName = `spot-klines-${file}`;
  const csv = await readArchiveCsv(url, cacheName);
  return parseKlines(csv);
}

// Downloads the .zip (or reads the cache), then extracts its single CSV entry.
async function readArchiveCsv(url: string, cacheName: string): Promise<string> {
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, cacheName);

  let zipBytes: Buffer;
  if (existsSync(cachePath)) {
    zipBytes = await readFile(cachePath);
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} -> ${res.status} ${res.statusText}`);
    zipBytes = Buffer.from(await res.arrayBuffer());
    await writeFile(cachePath, zipBytes);
  }

  const zip = new AdmZip(zipBytes);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (entries.length === 0) throw new Error(`empty archive: ${cacheName}`);
  return entries[0].getData().toString("utf8");
}

// Parses a kline CSV. Columns start: open_time, open, high, low, close,
// volume, close_time, ... We only need the first six. Some futures files now
// ship a header row ("open_time,open,..."); we skip any line whose first cell
// isn't a number, which drops the header without hard-coding a line count.
function parseKlines(csv: string): Candle[] {
  const rows: Candle[] = [];
  for (const line of csv.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const c = trimmed.split(",");

    const openTime = Number(c[0]);
    if (!Number.isFinite(openTime)) continue; // header or junk row
    const ts = toMillis(openTime);
    rows.push({
      ts,
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      // mark/index price klines carry no volume -> treat blank as 0
      volume: c[5] ? Number(c[5]) : 0,
    });
  }
  rows.sort((a, b) => a.ts - b.ts);
  return rows;
}

// Normalizes an open_time to integer epoch ms. Futures 1m is already ms
// (13 digits); spot-1s in 2025 is microseconds (16 digits) -> divide by 1000.
function toMillis(openTime: number): number {
  return openTime > 1e15 ? Math.floor(openTime / 1000) : openTime;
}
