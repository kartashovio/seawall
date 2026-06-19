// "The reading" is the merged deep-dive glass box (former "instruments" +
// "why these limits"). These tests lock the trust invariants the merge must
// never regress, and the dedup it was built to achieve:
//   • the advisory score is NEVER on the logic path — one merged honesty footer
//     states it, and there is exactly ONE such footer (the two old ones collapsed)
//   • applied = tighter_of(agent request, contract's own divergence reading)
//   • the agent can only push SAFER — the one-way ratchet holds it from loosening
//   • no FREEZE lives in this band (contract-only, upstream in LayerStatus)
//   • every param renders as a PERCENT — never dollars / millions (a prior pass
//     once fabricated "$4.0M"; these are bps)
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentTickDTO } from "@seawall/shared";
import { DIV } from "../src/config";
import { TheReading } from "../src/components/TheReading";

// A contract-bound state: divBps 146 → contract tier-1 (maxLtv 6834, borrowCap 8000);
// both scores below the calm gate (55) so the agent wants baseline → the contract is
// the binding constraint and the agent "would loosen but can't". applied = the tighter.
const APPLIED = { maxLtv: 6834, borrowCap: 8000 };
const FLOOR = { maxLtv: 5500, borrowCap: 4000 };
const BASELINE = { maxLtv: 7500, borrowCap: 10000 };

function tick(over: Partial<AgentTickDTO> = {}): AgentTickDTO {
  return {
    solvency: 50,
    liquidity: 50,
    d2: 6,
    k: 5,
    contributions: { divergence: 1.4, confidence: 0.6, dispersion: 0.4 },
    divBps: 146,
    applied: APPLIED,
    floor: FLOOR,
    baseline: BASELINE,
    ...over,
  } as unknown as AgentTickDTO;
}

function render(over: Partial<AgentTickDTO> = {}, props?: Partial<{ applied: typeof APPLIED; floor: typeof FLOOR; baseline: typeof BASELINE }>) {
  return renderToStaticMarkup(
    <TheReading
      tick={tick(over)}
      applied={props?.applied ?? APPLIED}
      floor={props?.floor ?? FLOOR}
      baseline={props?.baseline ?? BASELINE}
    />,
  );
}

describe("TheReading — the merged honesty footer (score off the logic path)", () => {
  const html = render();

  it("states the score is an event field, re-derived on-chain, applied is real", () => {
    expect(html).toContain("event field");
    expect(html).toContain("raw Pyth + DeepBook");
    expect(html).toContain("real on-chain number");
  });

  it("has EXACTLY ONE such footer (the two old footers collapsed into one)", () => {
    expect(html.split("event field").length - 1).toBe(1);
    expect(html.split("real on-chain number").length - 1).toBe(1);
  });

  it("renders the glass box with no in-card heading (the claim is now the band header)", () => {
    // the claim moved up to the band-level seas-intro header in App.tsx; the card
    // opens straight on its instruments, carrying no duplicate heading
    expect(html).toContain("Distance vs trip line");
    expect(html).not.toContain("the joint distance still trips");
  });
});

describe("TheReading — no fabricated numbers (bps render as percent, never $/M)", () => {
  const html = render();

  it("contains no dollar-amount and no millions suffix on a digit", () => {
    expect(/\$\d/.test(html)).toBe(false); // no "$4.0"
    expect(/\d\s?M\b/.test(html)).toBe(false); // no "4M" / "2.6 M"
  });

  it("renders applied limits as percentages", () => {
    expect(html).toContain("80%"); // borrow cap applied 8000 bps → 80%
    expect(html).toContain("agent asks");
    expect(html).toContain("applied");
  });
});

describe("TheReading — applied = tighter_of(agent, contract); agent only safer", () => {
  const html = render();

  it("borrow cap: agent 100% vs contract 80% → applied 80% (the tighter)", () => {
    // liquidity 50 < 55 → agent wants baseline 100%; contract tier-1 → 80%; applied 80%.
    expect(html).toContain("100%"); // the agent's ask
    expect(html).toContain("80%"); // applied = the contract's tighter floor
  });

  it("the one-way ratchet holds the agent from loosening", () => {
    expect(html).toContain("the ratchet holds");
    expect(html).toContain("would loosen this to");
  });

  it("names the contract's divergence reading as the binding constraint", () => {
    expect(html).toContain("contract is binding");
    expect(html).toContain("divergence");
  });

  it("keeps the explicit 3-value decomposition (agent / contract / applied)", () => {
    expect(html).toContain("agent asks");
    expect(html).toContain("contract target (divergence)");
    expect(html).toContain("applied");
  });

  it("corridor uses an absolute axis: a mark's position equals its % label", () => {
    // borrow cap applied 8000 bps → label "80%" AND diamond at left:80%
    expect(html).toContain("left:80%");
    // max LTV corridor band = [floor 55%, baseline 75%] → left:55%;width:20%
    expect(html).toContain("left:55%;width:20%");
  });
});

describe("TheReading — no freeze in this band (contract-only, upstream)", () => {
  const html = render();
  it("does not mention freeze / frozen / paused (the freeze is contract-only, upstream)", () => {
    expect(html.toLowerCase()).not.toContain("freeze");
    expect(html.toLowerCase()).not.toContain("frozen");
    expect(html.toLowerCase()).not.toContain("paused");
    // the band never imports the freeze threshold (DIV.freezeBps), so it can't leak
    expect(html).not.toContain("freezeBps");
  });
});

describe("TheReading — relax is contract-attributed, never an agent loosening", () => {
  it("above the calm line → 'Held tight', attributed to the contract", () => {
    const html = render({ divBps: DIV.cautionBps + 50 });
    expect(html).toContain("Held tight");
    expect(html).toContain("The contract holds the limits");
  });

  it("calm → 'Easing back', the CONTRACT steps the limits back", () => {
    const html = render({ divBps: 10 });
    expect(html).toContain("Easing back");
    expect(html).toContain("the contract steps the limits back");
  });
});

describe("TheReading — measurement stage", () => {
  it("shows d² vs the χ² trip line and the joint-anomaly note", () => {
    const html = render({ d2: 6, k: 5 });
    expect(html).toContain("d² = 6.0");
    expect(html).toContain("11.07"); // χ²₀.₉₅(5)
    expect(html).toContain("the combined distance still trips");
  });

  it("empty contributions → 'calibrating…' (the site's word), no invented bars", () => {
    const html = render({ contributions: {} });
    expect(html).toContain("calibrating…");
  });
});
