// ScoreCard — ONE shared presentational card rendered twice (true twins). Role
// is driven purely by the `enforced` prop: ribbon text+color, title env word, and
// the role-note sentence. Equal SIZE/treatment, different STATUS. NON-INTERACTIVE
// (status, not control) — the make-or-break the judge named twice.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScoreCard } from "../src/components/ScoreCard";

const book = { ok: true, mid: 0.761, spread: 40, imb: 0 };

describe("ScoreCard — ENFORCED (testnet) role", () => {
  const html = renderToStaticMarkup(
    <ScoreCard env="testnet" enforced score={72} divBps={88} book={book} />,
  );

  it("shows the ENFORCED · IN USE ribbon and the is-enforced class", () => {
    expect(html).toContain("ENFORCED · IN USE");
    expect(html).toContain("is-enforced");
    expect(html).not.toContain("is-readonly");
  });

  it("titles the card with the env word TESTNET and keeps the ML · advisory tag", () => {
    expect(html).toContain("TESTNET");
    expect(html).toContain("ML · advisory");
  });

  it("renders the shared info row: ~88.0 bps divergence + book mid/spread", () => {
    expect(html).toContain("~88.0 bps");
    expect(html).toContain("$0.7610");
    expect(html).toContain("40.0 bps");
  });

  it("carries the ENFORCED role-note (drives on-chain CAUTION param-requests)", () => {
    expect(html).toContain("Drives on-chain CAUTION param-requests");
    expect(html).toContain("intentionally NOT recalibrated");
  });
});

describe("ScoreCard — READ-ONLY (mainnet) role", () => {
  const html = renderToStaticMarkup(
    <ScoreCard env="mainnet" enforced={false} score={3} divBps={1.2} book={{ ok: true, mid: 0.7628, spread: 0.8, imb: 0.1 }} />,
  );

  it("shows the READ-ONLY · OBSERVING ribbon and the is-readonly class", () => {
    expect(html).toContain("READ-ONLY · OBSERVING");
    expect(html).toContain("is-readonly");
    expect(html).not.toContain("is-enforced");
  });

  it("titles the card MAINNET", () => {
    expect(html).toContain("MAINNET");
  });

  it("carries the READ-ONLY role-note (never on any enforcement path)", () => {
    expect(html).toContain("read-only");
    expect(html).toContain("not enforced");
    expect(html).toContain("Never on any enforcement path");
  });
});

describe("ScoreCard — no-signal + connecting fallbacks", () => {
  it("book.ok===false → info row reads 'no signal'", () => {
    const html = renderToStaticMarkup(
      <ScoreCard env="mainnet" enforced={false} score={0} book={{ ok: false, mid: null, spread: null, imb: null }} />,
    );
    expect(html).toContain("no signal");
  });

  it("divBps undefined (book ok) → info row reads 'no signal'", () => {
    const html = renderToStaticMarkup(
      <ScoreCard env="testnet" enforced score={0} book={{ ok: true, mid: 0.76, spread: 1, imb: 0 }} />,
    );
    expect(html).toContain("no signal");
  });

  it("null mid/spread render as em-dash", () => {
    const html = renderToStaticMarkup(
      <ScoreCard env="mainnet" enforced={false} score={0} book={{ ok: false, mid: null, spread: null, imb: null }} />,
    );
    expect(html).toContain("—");
  });

  it("available=false → 'connecting…' body, no info row", () => {
    const html = renderToStaticMarkup(
      <ScoreCard env="mainnet" enforced={false} score={0} available={false} />,
    );
    expect(html).toContain("connecting");
    expect(html).not.toContain("Pyth↔DeepBook divergence");
  });
});

describe("ScoreCard — NON-INTERACTIVITY guard (status, not control)", () => {
  it("renders NO button / anchor / interactive role anywhere", () => {
    for (const enforced of [true, false]) {
      const html = renderToStaticMarkup(
        <ScoreCard env={enforced ? "testnet" : "mainnet"} enforced={enforced} score={50} divBps={5} book={book} />,
      );
      expect(html).not.toContain("<button");
      expect(html).not.toContain("<a ");
      expect(html).not.toContain('role="button"');
      expect(html).not.toContain('role="tab"');
      expect(html).not.toContain("onclick");
      expect(html).not.toContain("cursor:pointer");
      expect(html).not.toContain("cursor: pointer");
    }
  });
});
