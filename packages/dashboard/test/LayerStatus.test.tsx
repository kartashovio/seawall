// The live 3-layer ladder (promoted into the "How it works" band) carries the
// trust thesis as renderable state. These tests lock the invariants the redesign
// must never regress:
//   • three rungs, each numbered, with actor identity (L1/L3 = the contract,
//     L2 = the agent) — carried by the tile colour + the prose
//   • THREE live states (not on/off): a calm steady-state still reads "armed/watching",
//     never optional/dead — L1 enforcing, L2 armed, L3 watching
//   • L2 lights only when the contract has actually clamped a tighten below baseline,
//     and promotes the live ratchet (baseline→current)
//   • the gate-band severs L2→L3 ("agent stops here")
//   • L3 (freeze) is CONTRACT-ONLY: lights from `paused`, and NO agent attribution
//     anywhere on the rung itself
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentTickDTO } from "@seawall/shared";
import type { GuardianEventRow } from "../src/abi";
import { LayerStatus } from "../src/components/LayerStatus";

// The component reads applied / baseline / floor (maxLtv + borrowCap) off the tick —
// a partial is enough (cast through unknown so we don't hand-build the whole DTO).
function tick(appliedMaxLtv: number, baselineMaxLtv: number): AgentTickDTO {
  return {
    applied: { maxLtv: appliedMaxLtv, borrowCap: 10000 },
    baseline: { maxLtv: baselineMaxLtv, borrowCap: 10000 },
    floor: { maxLtv: 5500, borrowCap: 4000 },
  } as unknown as AgentTickDTO;
}

// Everything from the FROZEN/Market-freeze rung's title to the end of the markup =
// the L3 rung + the timer (neither of which may carry agent attribution). The gate-
// band ("agent stops here") sits BEFORE the L3 title, so it is excluded by design.
function l3Region(html: string): string {
  return html.slice(html.indexOf("Market freeze"));
}

describe("LayerStatus — calm steady-state (armed, never optional)", () => {
  // latest present, no tighten (applied == baseline), not paused.
  const html = renderToStaticMarkup(
    <LayerStatus tick={tick(7500, 7500)} paused={false} events={[]} />,
  );

  it("renders all three numbered rungs with the right actor attribution", () => {
    expect(html).toContain(">L1<");
    expect(html).toContain(">L2<");
    expect(html).toContain(">L3<");
    // L1 + L2 + L3 prose attributes to the contract; L2 alone names the agent
    expect(html).toContain("the agent");
    expect(html.match(/the contract/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("L1 enforces, L2 is ARMED (not dim) at baseline, L3 is WATCHING", () => {
    expect(html).toContain("enforcing");
    expect(html).toContain(">armed<");
    expect(html).toContain(">watching<");
    // L2 carries its taut armed CLASS (not the dim default) + the at-baseline ratchet
    expect(html).toContain("lamp l2 armed");
    expect(html).toContain("at baseline, not tightening");
    expect(html).toContain("score · advisory only");
  });

  it("nothing is frozen and the speed claim reads 'one block'", () => {
    expect(html).not.toContain("lamp l3 on");
    expect(html).toContain("one block");
  });
});

describe("LayerStatus — CAUTION live (the contract clamped a tighten)", () => {
  // applied maxLtv below baseline → L2 lights and the ratchet shows before→after.
  const html = renderToStaticMarkup(
    <LayerStatus tick={tick(6200, 7500)} paused={false} events={[]} />,
  );

  it("L2 flips to 'tightening' and the ratchet shows baseline→current", () => {
    expect(html).toContain("lamp l2 on");
    expect(html).toContain(">tightening<");
    expect(html).toContain(">75%<"); // baseline
    expect(html).toContain(">62%<"); // current (pct(6200) = 62%)
  });

  it("L3 is still only armed/watching (the agent never lights the freeze)", () => {
    expect(html).not.toContain("lamp l3 on");
    expect(html).toContain(">watching<");
  });
});

describe("LayerStatus — gate-band severs the agent from the freeze", () => {
  const html = renderToStaticMarkup(
    <LayerStatus tick={tick(7500, 7500)} paused={false} events={[]} />,
  );
  it("a 'contract-only · agent stops here' divider sits between L2 and L3", () => {
    expect(html).toContain("contract-only · agent stops here");
    // the gate's "agent" must fall BEFORE the L3 title (it severs, not attributes)
    expect(html.indexOf("agent stops here")).toBeLessThan(html.indexOf("Market freeze"));
  });
});

describe("LayerStatus — FROZEN (contract-only; keeper pokes, never decides)", () => {
  const html = renderToStaticMarkup(
    <LayerStatus tick={tick(5500, 7500)} paused={true} events={[]} />,
  );

  it("L3 lights coral and reads FROZEN", () => {
    expect(html).toContain("lamp l3 on");
    expect(html).toContain(">frozen<");
  });

  it("the freeze is the contract's; the agent/keeper never cause it", () => {
    const region = l3Region(html);
    // the freeze cause + authority stay the contract's / the DAO's
    expect(region).toContain("the contract");
    // no agent CAUSAL language on the freeze rung — the only 'agent' here is the
    // non-attribution note "…even if the agent stops"
    expect(region).not.toMatch(/agent (requests|submits|tightens|freezes|triggers|causes)/);
    // the keeper appears ONLY as a permissionless poker + a non-attribution note
    expect(region).toContain("a permissionless keeper");
    expect(region).toContain("keeps the contract checking even if the agent stops");
  });
});

describe("LayerStatus — three invokers (poke ≠ decide)", () => {
  const html = renderToStaticMarkup(
    <LayerStatus tick={tick(7500, 7500)} paused={false} events={[]} />,
  );

  it("each rung names its on-chain poker (borrows · the agent · a keeper)", () => {
    expect(html.match(/poked by/g)?.length).toBe(3);
    expect(html).toContain("every borrow");
    expect(html).toContain("a permissionless keeper");
  });

  it("the keeper heartbeat is honestly idle when no poke is seen (no fake live)", () => {
    expect(html).toContain("dot-idle");
    expect(html).not.toContain("dot-ok"); // no fabricated 'live' pulse on empty events
  });

  it("a real keeper poke lights the live heartbeat", () => {
    const ev = [
      { kind: "RiskEvaluated", digest: "0x", tsMs: Date.now() - 30_000, json: { had_request: false } },
    ] as unknown as GuardianEventRow[];
    const live = renderToStaticMarkup(<LayerStatus tick={tick(7500, 7500)} paused={false} events={ev} />);
    expect(live).toContain("dot-ok"); // emerald, within the 6-min cadence
    expect(live).toContain("poke "); // "poke 30s ago"
  });
});
