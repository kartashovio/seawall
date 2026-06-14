import { describe, it, expect } from "vitest";
import type { AgentTickDTO } from "@seawall/shared";

// The dual-score dashboard adds two fields to the SSE wire contract:
//   enforcedEnv  REQUIRED  — which environment the agent ENFORCES on (status
//                            mirror of agent config; the dashboard lights the
//                            matching card's ribbon + header pill). NEVER a control.
//   divBps       OPTIONAL  — the testnet Pyth↔DeepBook divergence in bps, the
//                            symmetry-completer that mirrors ObservatoryBlock.divBps.
//                            Omitted on a book loss-of-signal tick → card shows "no signal".
describe("AgentTickDTO — enforcedEnv (required) + divBps (optional)", () => {
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

  it("enforcedEnv is a required 'testnet' | 'mainnet' field and round-trips", () => {
    const dto: AgentTickDTO = { ...base, enforcedEnv: "testnet", divBps: 88 };
    const round = JSON.parse(JSON.stringify(dto)) as AgentTickDTO;
    expect(round.enforcedEnv).toBe("testnet");
    expect(round.divBps).toBe(88);

    const main: AgentTickDTO = { ...base, enforcedEnv: "mainnet" };
    expect(main.enforcedEnv).toBe("mainnet");
  });

  it("divBps is optional — a DTO that omits it is still valid", () => {
    const dto: AgentTickDTO = { ...base };
    expect(dto.divBps).toBeUndefined();
    const round = JSON.parse(JSON.stringify(dto)) as AgentTickDTO;
    expect("divBps" in round).toBe(false);
    expect(round.enforcedEnv).toBe("testnet");
  });
});
