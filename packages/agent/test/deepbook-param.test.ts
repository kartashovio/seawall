import { describe, it, expect } from "vitest";
import { bcs } from "@mysten/sui/bcs";
import type { Transaction } from "@mysten/sui/transactions";
import { TESTNET_SNAPSHOT, MAINNET_SNAPSHOT, PRICE_SCALE } from "@seawall/shared";
import { readBook } from "../src/deepbook";

// 64-hex object ids so Transaction.getData() validation passes.
const TESTNET_POOL = TESTNET_SNAPSHOT.suiDbusdcPool;
const TESTNET_QUOTE = TESTNET_SNAPSHOT.dbusdcType;
const MAINNET_POOL = MAINNET_SNAPSHOT.suiUsdcPool;
const MAINNET_QUOTE = MAINNET_SNAPSHOT.usdcType;
const SENDER = "0x" + "1".repeat(64);

const encVec = (arr: number[]): number[] =>
  Array.from(bcs.vector(bcs.u64()).serialize(arr.map((n) => BigInt(n))).toBytes());

// A fake SuiClient whose devInspect captures the moveCall target from the tx and
// returns four BCS-encoded u64 vectors (one bid + one ask level).
function fakeClient(bidP: number[], bidQ: number[], askP: number[], askQ: number[]) {
  const captured: { target?: string; typeArguments?: string[] } = {};
  const client = {
    async devInspectTransactionBlock({ transactionBlock }: { transactionBlock: Transaction }) {
      const cmd = transactionBlock.getData().commands[0] as { MoveCall?: { package: string; module: string; function: string; typeArguments?: string[] } };
      const mc = cmd.MoveCall!;
      captured.target = `${mc.package}::${mc.module}::${mc.function}`;
      captured.typeArguments = mc.typeArguments;
      return {
        effects: { status: { status: "success" } },
        results: [
          {
            returnValues: [
              [encVec(bidP), "vector<u64>"],
              [encVec(bidQ), "vector<u64>"],
              [encVec(askP), "vector<u64>"],
              [encVec(askQ), "vector<u64>"],
            ],
          },
        ],
      };
    },
  };
  return { client: client as unknown as Parameters<typeof readBook>[0], captured };
}

describe("readBook — optional deepbookPackage arg (default = testnet); decode/mid unchanged", () => {
  it("4-arg form (existing live.ts:54 caller) targets the TESTNET deepbook package", async () => {
    const { client, captured } = fakeClient([764000000], [100], [764200000], [100]);
    const book = await readBook(client, TESTNET_POOL, TESTNET_QUOTE, SENDER);
    expect(captured.target).toBe(`${TESTNET_SNAPSHOT.deepbookPackage}::pool::get_level2_ticks_from_mid`);
    expect(book.ok).toBe(true);
    // mid = (bidP0 + askP0)/2 * DEC_FACTOR(1000) / PRICE_SCALE(1e9)
    const midRaw = (764000000 + 764200000) / 2;
    expect(book.mid).toBeCloseTo((midRaw * 1000) / Number(PRICE_SCALE), 9);
  });

  it("6-arg form targets the MAINNET deepbook package (observatory leg)", async () => {
    const { client, captured } = fakeClient([759200000], [100], [759400000], [100]);
    const book = await readBook(client, MAINNET_POOL, MAINNET_QUOTE, SENDER, 10, MAINNET_SNAPSHOT.deepbookPackage);
    expect(captured.target).toBe(`${MAINNET_SNAPSHOT.deepbookPackage}::pool::get_level2_ticks_from_mid`);
    expect(captured.typeArguments).toEqual(["0x2::sui::SUI", MAINNET_QUOTE]);
    expect(book.ok).toBe(true);
    const midRaw = (759200000 + 759400000) / 2;
    expect(book.mid).toBeCloseTo((midRaw * 1000) / Number(PRICE_SCALE), 9); // ~0.7593
  });

  it("both forms decode the 4 vectors identically (same mid math)", async () => {
    const levels: [number[], number[], number[], number[]] = [[764000000], [100], [764200000], [100]];
    const a = fakeClient(...levels);
    const b = fakeClient(...levels);
    const bookDefault = await readBook(a.client, TESTNET_POOL, TESTNET_QUOTE, SENDER);
    const bookExplicit = await readBook(b.client, TESTNET_POOL, TESTNET_QUOTE, SENDER, 10, TESTNET_SNAPSHOT.deepbookPackage);
    expect(bookDefault).toEqual(bookExplicit);
  });

  it("empty/one-sided book → ok:false, mid:null (loss-of-signal, never fake-0)", async () => {
    const { client } = fakeClient([], [], [759400000], [100]); // empty bids
    const book = await readBook(client, MAINNET_POOL, MAINNET_QUOTE, SENDER, 10, MAINNET_SNAPSHOT.deepbookPackage);
    expect(book.ok).toBe(false);
    expect(book.mid).toBeNull();
  });
});
