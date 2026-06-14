// Dual-score symmetry-completer + status mirror, proven on the LOOP (not just types):
//   1. EVERY branch (calm / elevate / malicious / dead) carries enforcedEnv from cfg.
//   2. the testnet divBps is the SAME ratio form the observatory uses
//      (1e4·|pyth−mid|/pyth) and is OMITTED on a book loss-of-signal / dead tick.
//   3. neither field leaks onto the enforced decision (regression guard alongside
//      observatory-safety.test.ts): submitOnce sees only the ParamRequest + score.
import { describe, it, expect, vi, beforeEach } from "vitest";

const submitOnce = vi.fn(async () => ({ digest: "0xd", clamped: [], risk: undefined as unknown }));
const readPolicy = vi.fn();
const fetchLiveRow = vi.fn();
const fetchCexBlock = vi.fn(async () => ({ coinbase: 0.76, okx: 0.7602, bybit: 0.7598, btc: 65000 }));

vi.mock("../src/onchain", () => ({ readPolicy: (...a: unknown[]) => readPolicy(...a) }));
vi.mock("../src/tx", () => ({ submitOnce: (...a: unknown[]) => submitOnce(...(a as [])) }));
vi.mock("../src/live", () => ({
  fetchLiveRow: (...a: unknown[]) => fetchLiveRow(...a),
  fetchCexBlock: (...a: unknown[]) => fetchCexBlock(...(a as [])),
}));

import { Engine } from "../src/loop";
import { DEFAULT_SEND_OPTS } from "../src/policy-logic";

const BASELINE = { maxLtv: 7500, borrowCap: 10000 };
const FLOOR = { maxLtv: 5500, borrowCap: 4000 };
const CALM_SNAP = {
  paused: false,
  applied: { ...BASELINE },
  floor: { ...FLOOR },
  baseline: { ...BASELINE },
  lastCheckMs: 0,
  lastChangeMs: 0,
  epoch: 0,
  registeredAgent: "0xagent",
};
const PAUSED_SNAP = { ...CALM_SNAP, paused: true };

// A live row whose pyth↔mid divergence is a clean ~87.3 bps (0.7677 vs 0.7610).
const DIVERGENT_ROW = {
  ts: 0,
  values: { pyth: 0.7677, dbk: 0.761, coinbase: 0.76, okx: 0.7602, bybit: 0.7598, btc: 65000 },
  book: { ok: true, mid: 0.761, imb: 0, spread: 40 },
  pythConf: 0.0003,
};
const NOSIGNAL_ROW = {
  ts: 0,
  values: { pyth: 0.7677, dbk: undefined, coinbase: 0.76, okx: 0.7602, bybit: 0.7598, btc: 65000 },
  book: { ok: false, mid: null, imb: null, spread: null },
  pythConf: 0.0003,
};

// enforcedEnv lives on cfg; the loop must echo it from there, not hardcode it.
const cfg = { policyId: "0xpolicy", feedId: "0xfeed", enforcedEnv: "testnet" } as never;

const calmDet = {
  features: ["disp", "div", "divvel", "volvel", "mktvol"],
  update: () => ({ score: 0, d2: 0, contributions: {}, groupD2: {} }),
} as never;
const calmFb = { push: () => null } as never;
const calmCal = { calibrate: () => ({ overall: 0, solvency: 0, liquidity: 0 }) } as never;

function makeEngine() {
  return new Engine({} as never, {} as never, cfg, calmDet, calmFb, calmCal, DEFAULT_SEND_OPTS);
}

beforeEach(() => {
  submitOnce.mockReset().mockResolvedValue({ digest: "0xd", clamped: [], risk: undefined });
  readPolicy.mockReset().mockResolvedValue(CALM_SNAP);
  fetchLiveRow.mockReset().mockResolvedValue(DIVERGENT_ROW);
  fetchCexBlock.mockClear();
});

describe("enforcedEnv — echoed on EVERY branch from cfg (status mirror)", () => {
  it("calm branch carries cfg.enforcedEnv", async () => {
    const tick = await makeEngine().tick(Date.now(), { mode: "calm" });
    expect(tick.enforcedEnv).toBe("testnet");
  });

  it("elevate branch carries cfg.enforcedEnv", async () => {
    const tick = await makeEngine().tick(Date.now(), {
      mode: "elevate",
      override: { overall: 80, solvency: 80, liquidity: 80 },
    });
    expect(tick.enforcedEnv).toBe("testnet");
  });

  it("malicious branch carries cfg.enforcedEnv (sent + paused-blocked variants)", async () => {
    const sent = await makeEngine().tick(Date.now(), { mode: "malicious" });
    expect(sent.enforcedEnv).toBe("testnet");
    readPolicy.mockResolvedValueOnce(PAUSED_SNAP);
    const blocked = await makeEngine().tick(Date.now(), { mode: "malicious" });
    expect(blocked.enforcedEnv).toBe("testnet");
  });

  it("dead branch carries cfg.enforcedEnv", async () => {
    const tick = await makeEngine().tick(Date.now(), { mode: "dead" });
    expect(tick.enforcedEnv).toBe("testnet");
  });

  it("a 'mainnet'-configured agent reports enforcedEnv:'mainnet' (future-proof)", async () => {
    const mainCfg = { ...((cfg as unknown) as object), enforcedEnv: "mainnet" } as never;
    const eng = new Engine({} as never, {} as never, mainCfg, calmDet, calmFb, calmCal, DEFAULT_SEND_OPTS);
    const tick = await eng.tick(Date.now(), { mode: "calm" });
    expect(tick.enforcedEnv).toBe("mainnet");
  });
});

describe("testnet divBps — ratio form, matching the observatory; omitted on no-signal", () => {
  it("divBps ≈ 1e4·|pyth−mid|/pyth (~87.3 bps) on a divergent book", async () => {
    const tick = await makeEngine().tick(Date.now(), { mode: "calm" });
    const expected = 1e4 * (Math.abs(0.7677 - 0.761) / 0.7677);
    expect(tick.divBps).toBeCloseTo(expected, 2);
    expect(tick.divBps).toBeCloseTo(87.3, 1);
  });

  it("malicious branch (sent) also carries the same testnet divBps", async () => {
    const tick = await makeEngine().tick(Date.now(), { mode: "malicious" });
    const expected = 1e4 * (Math.abs(0.7677 - 0.761) / 0.7677);
    expect(tick.divBps).toBeCloseTo(expected, 2);
  });

  it("book loss-of-signal (book.ok:false / mid null) → divBps undefined ('no signal')", async () => {
    fetchLiveRow.mockResolvedValue(NOSIGNAL_ROW);
    const tick = await makeEngine().tick(Date.now(), { mode: "calm" });
    expect(tick.divBps).toBeUndefined();
  });

  it("dead branch (no row) → divBps undefined", async () => {
    const tick = await makeEngine().tick(Date.now(), { mode: "dead" });
    expect(tick.divBps).toBeUndefined();
  });
});

describe("REGRESSION: neither enforcedEnv nor divBps reaches the decision path", () => {
  it("submitOnce is called only with (client, signer, cfg, ParamRequest, score) — no env/divBps arg", async () => {
    // an elevate tick that genuinely sends so submitOnce IS invoked
    await makeEngine().tick(Date.now(), {
      mode: "elevate",
      override: { overall: 90, solvency: 90, liquidity: 90 },
    });
    expect(submitOnce).toHaveBeenCalled();
    const args = submitOnce.mock.calls[0] as unknown[];
    // the 4th positional is the ParamRequest, the 5th the integer score — neither
    // is "testnet"/"mainnet" and no positional equals the divBps number.
    expect(args).not.toContain("testnet");
    expect(args).not.toContain("mainnet");
    const expectedDivBps = 1e4 * (Math.abs(0.7677 - 0.761) / 0.7677);
    for (const a of args) {
      expect(a).not.toBe(expectedDivBps);
    }
    // the request the contract receives is a ParamRequest, not anything env-tagged
    const req = args[3] as Record<string, number>;
    expect(req).toHaveProperty("maxLtv");
    expect(req).toHaveProperty("borrowCap");
    expect("enforcedEnv" in req).toBe(false);
    expect("divBps" in req).toBe(false);
  });
});
