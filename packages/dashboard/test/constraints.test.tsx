// Pins the dashboard's DISPLAY mirrors (constraints.ts) to the real model + Move
// contract values, so the "why these limits" panel can't silently drift from what
// the system actually computes. Values verified against packages/model/src/score.ts
// (scoreToParams) and packages/guardian/sources/guardian.move (own_tier/tier_target,
// the Move test contract_own_tighten_three_tiers asserts 6834/8000 at tier 1).
import { describe, it, expect } from "vitest";
import { agentTarget, contractTarget, explainParam } from "../src/constraints";

describe("agentTarget — mirror of scoreToParams (solvency→max_ltv, liquidity→borrow_cap)", () => {
  it("both scores ≤ SCORE_LO(55) → baseline (loosest)", () => {
    expect(agentTarget(0, 0)).toEqual({ maxLtv: 7500, borrowCap: 10000 });
    expect(agentTarget(55, 55)).toEqual({ maxLtv: 7500, borrowCap: 10000 });
  });
  it("both scores ≥ SCORE_HI(80) → floor (tightest)", () => {
    expect(agentTarget(80, 80)).toEqual({ maxLtv: 5500, borrowCap: 4000 });
    expect(agentTarget(100, 100)).toEqual({ maxLtv: 5500, borrowCap: 4000 });
  });
  it("the live state: solvency 97.49 floors LTV, liquidity 0 leaves cap at baseline", () => {
    expect(agentTarget(97.49, 0)).toEqual({ maxLtv: 5500, borrowCap: 10000 });
  });
});

describe("contractTarget — mirror of own_tier/tier_target (integer division)", () => {
  it("tier 0 (div < 1% caution) → baseline", () => {
    expect(contractTarget(50)).toEqual({ maxLtv: 7500, borrowCap: 10000 });
  });
  it("tier 1 (div 1.46%, the live state) → 6834 / 8000 (== the Move test)", () => {
    expect(contractTarget(146)).toEqual({ maxLtv: 6834, borrowCap: 8000 });
  });
  it("tier 2 (div 3%) → 6167 / 6000", () => {
    expect(contractTarget(300)).toEqual({ maxLtv: 6167, borrowCap: 6000 });
  });
  it("tier 3 (div ≥ 3.67%) → floor", () => {
    expect(contractTarget(400)).toEqual({ maxLtv: 5500, borrowCap: 4000 });
  });
});

describe("explainParam — who binds each param", () => {
  it("LTV: agent 5500 tighter than contract 6834 → bound by the agent", () => {
    const e = explainParam(5500, 5500, 6834);
    expect(e.boundBy).toBe("agent");
    expect(e.agentWantsLooser).toBe(false);
  });
  it("cap: contract 8000 tighter than agent 10000 → bound by the contract; agent wants looser", () => {
    const e = explainParam(8000, 10000, 8000);
    expect(e.boundBy).toBe("contract");
    expect(e.agentWantsLooser).toBe(true);
  });
  it("applied below both targets → ratchet-held", () => {
    expect(explainParam(5000, 6000, 7000).boundBy).toBe("ratchet");
  });
});
