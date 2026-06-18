// App row-1 wiring: TWO equal ScoreCards + the header env-pill, all data-driven
// from latest.enforcedEnv (status mirror, never a control). Asserts the roles
// SWAP with enforcedEnv and the old hardcoded "· Sui testnet" suffix is gone.
//
// App drags in dapp-kit + SSE hooks; we mock them to inert stubs so the tree
// renders statically. The mocks return a fixed `latest` so we control enforcedEnv.
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentTickDTO } from "@seawall/shared";

const latestRef: { current: AgentTickDTO | null } = { current: null };

vi.mock("../src/useAgentStream", () => ({
  useAgentStream: () => ({ latest: latestRef.current, history: [], connected: true }),
}));
vi.mock("../src/useGuardian", () => ({
  useGuardianEvents: () => [],
  usePolicy: () => null,
}));
// dapp-kit hooks/components used by App + GovernancePanel — inert stubs.
vi.mock("@mysten/dapp-kit", () => ({
  ConnectButton: () => null,
  useCurrentAccount: () => null,
  useSignAndExecuteTransaction: () => ({ mutate: () => {}, mutateAsync: async () => {} }),
  useSuiClientQuery: () => ({ data: undefined }),
}));

import { App } from "../src/App";

function tick(enforcedEnv: "testnet" | "mainnet"): AgentTickDTO {
  return {
    ts: 1,
    mode: "calm",
    scoreOverall: 72,
    solvency: 60,
    liquidity: 50,
    d2: 4,
    k: 5,
    contributions: {},
    req: { maxLtv: 7500, borrowCap: 10000 },
    applied: { maxLtv: 7500, borrowCap: 10000 },
    floor: { maxLtv: 5500, borrowCap: 4000 },
    baseline: { maxLtv: 7500, borrowCap: 10000 },
    paused: false,
    sent: false,
    enforcedEnv,
    divBps: 88,
    book: { ok: true, mid: 0.761, imb: 0, spread: 40 },
    warmup: { elapsedMs: 240_000, readyMs: 2_700_000, ready: false },
    observatory: {
      ok: true,
      score: 3,
      solvency: 1,
      liquidity: 2,
      d2: 0.7,
      k: 5,
      contributions: {},
      divBps: 1.2,
      book: { mid: 0.7628, spread: 0.8, imb: 0.1, ok: true },
    },
  };
}

// The two ScoreCards each open with `<section class="...scorecard...">`. The
// testnet card is rendered first, the mainnet card second, so we slice the markup
// at the SECOND scorecard <section> to attribute the is-enforced/is-readonly
// class (which lives on the section tag, BEFORE the env-named <h2>) to the right
// card. (Slicing at the title word would mis-attribute the class to the prior card.)
function splitCards(html: string): { testnetSide: string; mainnetSide: string } {
  const first = html.indexOf("scorecard");
  const second = html.indexOf("scorecard", first + 1);
  return { testnetSide: html.slice(0, second), mainnetSide: html.slice(second) };
}

describe("App — enforcedEnv=testnet lights the testnet card + header pill", () => {
  latestRef.current = tick("testnet");
  const html = renderToStaticMarkup(<App />);
  const { testnetSide, mainnetSide } = splitCards(html);

  it("the testnet card is ENFORCED and the mainnet card is READ-ONLY", () => {
    expect(testnetSide).toContain("is-enforced");
    expect(testnetSide).toContain("ENFORCED · IN USE");
    expect(mainnetSide).toContain("is-readonly");
    expect(mainnetSide).toContain("READ-ONLY · OBSERVING");
  });

  it("the header pill reads DEPLOYED ON TESTNET", () => {
    expect(html).toContain("DEPLOYED ON TESTNET");
    expect(html).toContain("env-pill");
  });

  it("renders BOTH score cards (testnet + mainnet titles present)", () => {
    expect(html).toContain("TESTNET");
    expect(html).toContain("MAINNET");
  });

  it("shows the warm-up status (calibrating) so an early reading isn't taken as real", () => {
    expect(html).toContain("calibrating"); // the WarmupStatus chip + strip
    expect(html).toContain("over-read"); // the honest "may over-read until warm" note
  });
});

describe("App — enforcedEnv=mainnet SWAPS the roles with zero code change", () => {
  latestRef.current = tick("mainnet");
  const html = renderToStaticMarkup(<App />);
  const { testnetSide, mainnetSide } = splitCards(html);

  it("the mainnet card is now ENFORCED, the testnet card READ-ONLY", () => {
    expect(mainnetSide).toContain("is-enforced");
    expect(mainnetSide).toContain("ENFORCED · IN USE");
    expect(testnetSide).toContain("is-readonly");
    expect(testnetSide).toContain("READ-ONLY · OBSERVING");
  });

  it("the header pill flips to DEPLOYED ON MAINNET", () => {
    expect(html).toContain("DEPLOYED ON MAINNET");
  });
});

describe("App — defaults + the old hardcode is gone", () => {
  it("before the first tick (latest=null) defaults to testnet enforced", () => {
    latestRef.current = null;
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("DEPLOYED ON TESTNET");
    const { testnetSide, mainnetSide } = splitCards(html);
    expect(testnetSide).toContain("is-enforced");
    expect(mainnetSide).toContain("is-readonly");
  });

  it("the hardcoded '· Sui testnet' header suffix is removed (one source of env truth)", () => {
    latestRef.current = tick("testnet");
    const html = renderToStaticMarkup(<App />);
    expect(html).not.toContain("· Sui testnet");
  });
});
