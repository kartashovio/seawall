// READ-ONLY MAINNET observatory — DISPLAY ONLY, NEVER on the enforced path.
//
// Computes a SECOND risk score from the LIVE MAINNET market (mainnet Pyth SUI/USD
// vs mainnet SUI/USDC DeepBook mid) with the SAME unchanged EWMA-Mahalanobis
// model the testnet leg uses. A deep real market reads CALM (~1 bps divergence),
// which proves the model is correct and the testnet jumpiness is a thin-pool
// artifact. The result is returned to the caller (Engine.tick), which attaches it
// ONLY to the DTO — its score/features/divBps must NEVER reach computeRequest /
// decideRequest / shouldSend / submitOnce.
//
// READ-ONLY: it builds + submits NO PTB. Divergence is the plain off-chain ratio
// |mainnet price − mainnet DeepBook mid| / price (bps) — no mainnet Pyth State /
// Wormhole / PriceInfoObject needed (those are only for posting updates on-chain).
//
// The caller owns the try/catch — a mainnet hiccup here must degrade to an omitted
// observatory block, never break the enforced testnet tick.
import type { SuiClient } from "@mysten/sui/client";
import type { Detector, FeatureBuilder } from "@seawall/model";
import type { ObservatoryBlock } from "@seawall/shared";
import { fetchLatestFrom } from "./sources/pyth";
import { readBook } from "./deepbook";
import type { CexBlock } from "./live";
import type { Calibrator } from "./calibrate";
import type { ObservatoryConfig } from "./observatory-config";

// The observatory's OWN stateful triple (separate EWMA/velocity buffers from the
// testnet one — sharing would let one chain poison the other's baseline).
export interface ObsTriple {
  det: Detector;
  fb: FeatureBuilder;
  cal: Calibrator;
}

const TICKS = 10;

export async function computeObservatory(
  mainnetClient: SuiClient,
  cfg: ObservatoryConfig,
  cex: CexBlock,
  nowMs: number,
  triple: ObsTriple,
): Promise<ObservatoryBlock> {
  // per-chain reads (the CEX block is shared/injected — never refetched here)
  const [pythTick, book] = await Promise.all([
    fetchLatestFrom(cfg.hermesUrl, cfg.feedId),
    readBook(mainnetClient, cfg.poolId, cfg.quoteType, READER_ADDR, TICKS, cfg.deepbookPackage),
  ]);

  const mid = book.ok ? (book.mid as number) : undefined;
  // off-chain divergence, bps. Loss-of-signal book → 0 (the block carries ok:false
  // so the dashboard shows "no signal", NOT a fake-calm 0 on a real divergence).
  const divBps = mid && pythTick.price > 0 ? 1e4 * (Math.abs(pythTick.price - mid) / pythTick.price) : 0;

  // assemble a LiveRow exactly like the testnet leg, then push fb → det → cal.
  const row = {
    ts: nowMs,
    values: {
      pyth: pythTick.price,
      dbk: mid, // loss of signal → undefined, never fake-0
      coinbase: cex.coinbase,
      okx: cex.okx,
      bybit: cex.bybit,
      btc: cex.btc,
    },
  };

  let score = 0, solvency = 0, liquidity = 0, d2 = 0;
  let contributions: Record<string, number> = {};
  const fv = triple.fb.push(row);
  if (fv) {
    const sr = triple.det.update(fv);
    const cs = triple.cal.calibrate(sr);
    score = cs.overall;
    solvency = cs.solvency;
    liquidity = cs.liquidity;
    d2 = sr.d2;
    contributions = sr.contributions;
  }

  return {
    ok: book.ok,
    score,
    solvency,
    liquidity,
    d2,
    k: triple.det.features.length,
    contributions,
    divBps,
    book: { mid: book.mid, spread: book.spread, imb: book.imb, ok: book.ok },
  };
}

// Read-only sender for devInspect (no key, no gas). Any valid address works for a
// devInspect read; the burn/zero address keeps it obviously non-signing.
const READER_ADDR = "0x0000000000000000000000000000000000000000000000000000000000000000";
