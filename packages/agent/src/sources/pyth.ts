// Pyth price + confidence adapter. Two SUI/USD feeds, two hosts:
//
//   - fetchLatest reads the live testnet/beta feed from Hermes (hermes-beta),
//     which is what the agent and contract watch in real time.
//   - fetchHistory reads the mainnet feed from Pyth Benchmarks, which is the
//     only free source with usable history (used for backtests).
//
// Each host only serves its own feed, so don't swap the ids between them.
//
// Both endpoints return prices as an integer mantissa plus a base-10 exponent.
// We apply the expo to BOTH price and conf so callers get real numbers in USD.
// Every timestamp comes out as integer epoch MILLISECONDS, sorted ascending.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PythTick } from "@seawall/shared";

const HERMES_BETA_URL = "https://hermes-beta.pyth.network";
const BENCHMARKS_URL = "https://benchmarks.pyth.network";
const CACHE_DIR = join(process.cwd(), "data", "pyth");

// Benchmarks returns one update per second and refuses a range longer than
// 60 seconds, so we page the window in 60-second chunks.
const MAX_RANGE_SEC = 60;

// The shape of the price block both endpoints embed under parsed[0].price.
interface RawPrice {
  price: string;
  conf: string;
  expo: number;
  publish_time: number; // seconds
}

// Benchmarks wraps each tick as { binary, parsed: [{ price, ... }] }.
interface BenchmarksItem {
  parsed: { price: RawPrice }[];
}

// Hermes returns { parsed: [{ id, price, ema_price, metadata }] }, i.e. the
// price block sits one level shallower than in Benchmarks.
interface HermesResponse {
  parsed?: { price: RawPrice }[];
}

// --- public entry points ---

// Latest price for a feed from a given Hermes host. feedId may be given with or
// without the leading 0x; Hermes wants it BARE (a stray 0x → 400 "Odd number of
// digits"). The MAINNET observatory passes the mainnet host here; the enforced
// agent uses fetchLatest (hermes-beta) below.
export async function fetchLatestFrom(hermesUrl: string, feedId: string): Promise<PythTick> {
  const id = stripHex(feedId);
  const url = `${hermesUrl}/v2/updates/price/latest?ids[]=${id}`;
  const body = (await getJson(url)) as HermesResponse;

  const entry = body.parsed?.[0];
  if (!entry?.price) throw new Error(`no parsed price for ${id}`);
  return toTick(entry.price);
}

// Latest price for a feed from hermes-beta (live testnet feed) — the host the
// enforced agent + contract watch. Delegates to fetchLatestFrom so the host is
// the only difference; existing callers are byte-identical.
export async function fetchLatest(feedId: string): Promise<PythTick> {
  return fetchLatestFrom(HERMES_BETA_URL, feedId);
}

// Historical ticks for a feed from Benchmarks (mainnet feed), covering
// [startSec, endSec]. intervalSec is the per-request window size (Benchmarks
// caps a single call at 60 seconds and returns one tick per second within it),
// so we walk the window forward one chunk at a time and stitch the results.
// Default 60s keeps us at the cap, i.e. the fewest requests.
export async function fetchHistory(
  feedId: string,
  startSec: number,
  endSec: number,
  intervalSec = MAX_RANGE_SEC,
): Promise<PythTick[]> {
  if (endSec <= startSec) return [];
  const id = "0x" + stripHex(feedId); // Benchmarks wants the 0x prefix
  const range = Math.min(intervalSec, MAX_RANGE_SEC);

  const key = cacheKey(id, startSec, endSec, range);
  const cached = await readCache(key);
  if (cached) return cached;

  const ticks: PythTick[] = [];
  for (let from = startSec; from < endSec; from += range) {
    const url =
      `${BENCHMARKS_URL}/v1/updates/price/${from}/${range}` +
      `?ids=${id}&parsed=true`;
    const items = (await getJson(url)) as BenchmarksItem[];
    for (const item of items) {
      const p = item.parsed?.[0]?.price;
      if (p) ticks.push(toTick(p));
    }
  }

  const rows = cleanup(ticks, startSec * 1000, endSec * 1000);
  await writeCache(key, rows);
  return rows;
}

// --- helpers ---

// Turns a raw {price, conf, expo, publish_time} block into a PythTick. The expo
// is applied to BOTH price and conf; publish_time (seconds) becomes ms.
function toTick(p: RawPrice): PythTick {
  const scale = 10 ** p.expo;
  return {
    ts: p.publish_time * 1000,
    price: Number(p.price) * scale,
    conf: Number(p.conf) * scale,
  };
}

function stripHex(feedId: string): string {
  return feedId.startsWith("0x") ? feedId.slice(2) : feedId;
}

// Sort ascending by ts, drop duplicate timestamps (paging windows share their
// boundary second), and clip to the requested [startMs, endMs).
function cleanup(rows: PythTick[], startMs: number, endMs: number): PythTick[] {
  rows.sort((a, b) => a.ts - b.ts);
  const out: PythTick[] = [];
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
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// --- on-disk cache (data/pyth/, gitignored). History only; latest is live. ---

function cacheKey(id: string, startSec: number, endSec: number, range: number): string {
  return `hist_${id}_${startSec}_${endSec}_${range}s.json`;
}

async function readCache(key: string): Promise<PythTick[] | null> {
  const path = join(CACHE_DIR, key);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as PythTick[];
}

async function writeCache(key: string, rows: PythTick[]): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(join(CACHE_DIR, key), JSON.stringify(rows));
}
