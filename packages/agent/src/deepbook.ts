// Live DeepBook order-book read for the V1 island (no @mysten/deepbook-v3, which
// is v2). We devInspect `get_level2_ticks_from_mid` against the pool-allowed
// deepbook package (0x22be4cad — see docs/TOOLCHAIN.md gotcha 2) and BCS-decode
// the four u64 vectors. Empty/one-sided → loss-of-signal (ok=false), NEVER a
// fake-calm 0. Feeds ONLY the advisory score (the contract re-derives on-chain).
import type { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { TESTNET_SNAPSHOT, PRICE_SCALE, BASE_DECIMALS, QUOTE_DECIMALS } from "@seawall/shared";
import { SUI_TYPE, CLOCK } from "./config";

export interface BookSnapshot {
  ok: boolean; // false = empty/one-sided (loss of signal)
  mid: number | null; // real price (USD per base), e.g. ~0.76
  imb: number | null; // depth imbalance in [-1,1]: (bidQ-askQ)/(bidQ+askQ)
  spread: number | null; // (ask-bid)/mid, bps
}

const DEC_FACTOR = 10 ** (BASE_DECIMALS - QUOTE_DECIMALS); // ×1000 for SUI(9)/DBUSDC(6)

function decodeVec(bytes: number[] | Uint8Array): number[] {
  return bcs
    .vector(bcs.u64())
    .parse(Uint8Array.from(bytes))
    .map((v) => Number(v));
}

export async function readBook(
  client: SuiClient,
  poolId: string,
  quoteType: string,
  sender: string,
  ticks = 10,
  // Which deployed deepbook package owns the pool. Defaults to the testnet
  // package (the only caller before the read-only mainnet observatory, which
  // passes MAINNET_SNAPSHOT.deepbookPackage). Decode + mid math are identical
  // across chains (SUI/USDC decimals match SUI/DBUSDC).
  deepbookPackage: string = TESTNET_SNAPSHOT.deepbookPackage,
): Promise<BookSnapshot> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${deepbookPackage}::pool::get_level2_ticks_from_mid`,
    typeArguments: [SUI_TYPE, quoteType], // <Base, Quote>
    arguments: [tx.object(poolId), tx.pure.u64(ticks), tx.object(CLOCK)],
  });
  const res = await client.devInspectTransactionBlock({ sender, transactionBlock: tx });
  if (res.effects?.status?.status !== "success") return { ok: false, mid: null, imb: null, spread: null };

  const rv = res.results?.[0]?.returnValues;
  if (!rv || rv.length < 4) return { ok: false, mid: null, imb: null, spread: null };
  const bidP = decodeVec(rv[0][0]);
  const bidQ = decodeVec(rv[1][0]);
  const askP = decodeVec(rv[2][0]);
  const askQ = decodeVec(rv[3][0]);

  if (bidP.length === 0 || askP.length === 0) return { ok: false, mid: null, imb: null, spread: null };

  const midRaw = (bidP[0] + askP[0]) / 2;
  const mid = (midRaw * DEC_FACTOR) / Number(PRICE_SCALE);
  const sumBid = bidQ.reduce((a, v) => a + v, 0);
  const sumAsk = askQ.reduce((a, v) => a + v, 0);
  const tot = sumBid + sumAsk;
  const imb = tot > 0 ? (sumBid - sumAsk) / tot : 0;
  const spread = midRaw > 0 ? 1e4 * ((askP[0] - bidP[0]) / ((askP[0] + bidP[0]) / 2)) : 0;
  return { ok: true, mid, imb, spread };
}
