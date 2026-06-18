// The live 3-layer ladder (promoted into the "How it works" band) carries the
// trust thesis as renderable state. These tests lock the invariants the redesign
// must never regress:
//   • three rungs, each with its actor chip (L1/L3 = the contract, L2 = the agent)
//   • THREE live states (not on/off): a calm steady-state still reads "armed",
//     never optional/dead — L1 enforcing, L2 armed·standing-by, L3 armed·watching
//   • L2 lights only when the contract has actually clamped a tighten below baseline
//   • L3 (freeze) is CONTRACT-ONLY: lights from `paused`, carries the contract chip
//     and a "freeze: contract-only" tab, and NO agent attribution anywhere on it
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentTickDTO } from "@seawall/shared";
import { LayerStatus } from "../src/components/LayerStatus";

// The component only reads applied.maxLtv / baseline.maxLtv off the tick — a
// partial is enough (cast through unknown so we don't hand-build the whole DTO).
function tick(appliedMaxLtv: number, baselineMaxLtv: number): AgentTickDTO {
  return {
    applied: { maxLtv: appliedMaxLtv, borrowCap: 10000 },
    baseline: { maxLtv: baselineMaxLtv, borrowCap: 10000 },
  } as unknown as AgentTickDTO;
}

// Everything from the FROZEN rung's title to the end of the markup = the L3 rung
// + the timer (neither of which may carry agent attribution).
function l3Region(html: string): string {
  return html.slice(html.indexOf("FROZEN"));
}

describe("LayerStatus — calm steady-state (armed, never optional)", () => {
  // latest present, no tighten (applied == baseline), not paused.
  const html = renderToStaticMarkup(
    <LayerStatus tick={tick(7500, 7500)} paused={false} events={[]} />,
  );

  it("renders all three rungs with the right actor chips", () => {
    expect(html).toContain(">L1<");
    expect(html).toContain(">L2<");
    expect(html).toContain(">L3<");
    // L1 + L3 = the contract; L2 = the agent
    expect(html).toContain("the agent");
    expect(html.match(/the contract/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("L1 enforces, L2 is ARMED (not dim), L3 is ARMED-watching", () => {
    expect(html).toContain("enforcing");
    expect(html).toContain("armed · standing by");
    expect(html).toContain("armed · contract-watching");
    // L2 carries its taut armed CLASS (not the dim default) + live corridor headroom
    expect(html).toContain("lamp l2 armed");
    expect(html).toContain("maxLTV 75% / 75%");
    expect(html).toContain("score · advisory only");
  });

  it("nothing is frozen and the speed claim reads 'one block'", () => {
    expect(html).not.toContain("lamp l3 on");
    expect(html).toContain("one block");
  });
});

describe("LayerStatus — CAUTION live (the contract clamped a tighten)", () => {
  // applied maxLtv below baseline → L2 lights.
  const html = renderToStaticMarkup(
    <LayerStatus tick={tick(6200, 7500)} paused={false} events={[]} />,
  );

  it("L2 flips to 'tightening · enforced' and shows the new headroom", () => {
    expect(html).toContain("lamp l2 on");
    expect(html).toContain("tightening · enforced");
    expect(html).toContain("maxLTV 62% / 75%");
  });

  it("L3 is still only armed (the agent never lights the freeze)", () => {
    expect(html).not.toContain("lamp l3 on");
    expect(html).toContain("armed · contract-watching");
  });
});

describe("LayerStatus — FROZEN (contract-only, no agent attribution)", () => {
  const html = renderToStaticMarkup(
    <LayerStatus tick={tick(5500, 7500)} paused={true} events={[]} />,
  );

  it("L3 lights coral and carries the contract-only freeze tab", () => {
    expect(html).toContain("lamp l3 on");
    expect(html).toContain("freeze: contract-only");
  });

  it("the freeze rung has the contract chip and ZERO agent attribution", () => {
    const region = l3Region(html);
    expect(region).toContain("the contract");
    expect(region).not.toContain("the agent");
  });
});
