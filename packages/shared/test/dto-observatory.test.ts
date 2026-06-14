import { describe, it, expect } from "vitest";
import type { AgentTickDTO, ObservatoryBlock } from "@seawall/shared";

// The SSE wire contract between the v1 agent and the v2 dashboard is pure JSON.
// `observatory` is OPTIONAL so an omitted block (a mainnet RPC/Hermes hiccup) is
// a legal frame, and a present block must round-trip through JSON unchanged.
describe("AgentTickDTO.observatory — optional, JSON-round-trippable SSE field", () => {
  const base: AgentTickDTO = {
    ts: 1,
    mode: "calm",
    scoreOverall: 0,
    solvency: 0,
    liquidity: 0,
    d2: 0,
    k: 5,
    contributions: {},
    req: { maxLtv: 7500, borrowCap: 10000 },
    applied: { maxLtv: 7500, borrowCap: 10000 },
    floor: { maxLtv: 5500, borrowCap: 4000 },
    baseline: { maxLtv: 7500, borrowCap: 10000 },
    paused: false,
    sent: false,
    enforcedEnv: "testnet",
  };

  it("a DTO with NO observatory field is valid (optional)", () => {
    const dto: AgentTickDTO = { ...base };
    expect(dto.observatory).toBeUndefined();
    const round = JSON.parse(JSON.stringify(dto)) as AgentTickDTO;
    expect(round).toEqual(dto);
    expect("observatory" in round).toBe(false);
  });

  it("a DTO WITH a full observatory block round-trips deep-equal", () => {
    const obs: ObservatoryBlock = {
      ok: true,
      score: 3,
      solvency: 1,
      liquidity: 2,
      d2: 0.7,
      k: 5,
      contributions: { div: 0.1, disp: 0.2, divvel: 0.05, volvel: 0.05, mktvol: 0.3 },
      divBps: 1.3,
      book: { mid: 0.7593, spread: 1.2, imb: 0.1, ok: true },
    };
    const dto: AgentTickDTO = { ...base, observatory: obs };
    const round = JSON.parse(JSON.stringify(dto)) as AgentTickDTO;
    expect(round).toEqual(dto);
    expect(round.observatory).toEqual(obs);
  });

  it("an observatory block carries loss-of-signal (ok:false, mid:null) honestly", () => {
    const obs: ObservatoryBlock = {
      ok: false,
      score: 0,
      solvency: 0,
      liquidity: 0,
      d2: 0,
      k: 5,
      contributions: {},
      divBps: 0,
      book: { mid: null, spread: null, imb: null, ok: false },
    };
    const dto: AgentTickDTO = { ...base, observatory: obs };
    const round = JSON.parse(JSON.stringify(dto)) as AgentTickDTO;
    expect(round.observatory?.book.mid).toBeNull();
    expect(round.observatory?.ok).toBe(false);
  });
});
