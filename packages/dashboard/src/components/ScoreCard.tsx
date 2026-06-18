// ONE shared presentational score card, rendered TWICE (true twins): the enforced
// testnet score and the read-only mainnet observatory. Equal SIZE/layout/gauge —
// the differences are data-derived from `enforced` (ribbon + title + role-note).
//
// Now also shows: (1) a "calibrating" badge while the model is still warming up
// (the early reading isn't trusted yet), and (2) a divergence meter placing the
// live Pyth↔DeepBook divergence against the CAUTION (1%) and contract-only FREEZE
// (5%) thresholds — so it's obvious how far the market is from a hard freeze.
//
// STATUS, NOT CONTROL: pure display — no onClick, no href, no local state.
import { RiskGauge } from "./RiskGauge";
import { DIV } from "../config";

type Book = { ok: boolean; mid: number | null; spread: number | null; imb?: number | null };

interface ScoreCardProps {
  env: "testnet" | "mainnet";
  enforced: boolean;
  score: number;
  divBps?: number;
  book?: Book;
  available?: boolean;
  calibrating?: boolean; // model still warming up → reading not yet trusted
}

const NOTE = {
  enforced:
    "Drives on-chain CAUTION param-requests to the testnet GuardianPolicy — clamped to the safe direction; the contract acts on its own re-derived divergence, never the 0–100 score. Sandbox: jumpy by design (thin pool), intentionally NOT recalibrated.",
  readonly:
    "Live mainnet SUI/USDC · read-only · never on any enforcement path. Reads calm here.",
};

// A compact 0→freeze divergence scale with caution + freeze marks and the live
// reading placed on it. The freeze threshold sits at the right end.
function DivMeter({ divBps, ok, enforced }: { divBps?: number; ok: boolean; enforced: boolean }) {
  const { cautionBps, freezeBps } = DIV;
  if (!ok || divBps == null) {
    return <div className="divmeter-cap muted">Pyth↔DeepBook divergence: no signal</div>;
  }
  const fillPct = Math.min(100, (divBps / freezeBps) * 100);
  const cautionPct = (cautionBps / freezeBps) * 100;
  const col = divBps < cautionBps ? "var(--teal)" : divBps < freezeBps ? "var(--amber)" : "var(--coral)";
  const state = divBps < cautionBps ? "calm" : divBps < freezeBps ? "caution" : "FREEZE";
  return (
    <div className="divmeter">
      <div className="divmeter-bar" role="img" aria-label={`divergence ${divBps.toFixed(1)} bps of ${freezeBps} freeze`}>
        <div className="divmeter-fill" style={{ width: `${fillPct}%`, background: col }} />
        <div className="divmeter-mark divmeter-caution" style={{ left: `${cautionPct}%` }} title={`caution ${cautionBps} bps (1%)`} />
        <div className="divmeter-mark divmeter-freeze" style={{ left: "100%" }} title={`freeze ${freezeBps} bps (5%)`} />
      </div>
      <div className="divmeter-cap">
        Pyth↔DeepBook divergence <b style={{ color: col }}>{divBps.toFixed(1)} bps</b> <span className="divmeter-state">{state}</span> · caution ≥{" "}
        {cautionBps} · <span className="divmeter-frz">contract-freeze ≥ {freezeBps}</span> bps
      </div>
      <div className="divmeter-note">
        {enforced
          ? "The contract halts on its own measured divergence."
          : "Reference only — the read-only observatory enforces nothing."}
      </div>
    </div>
  );
}

export function ScoreCard({ env, enforced, score, divBps, book, available = true, calibrating = false }: ScoreCardProps) {
  const mid = book?.mid != null ? `$${book.mid.toFixed(4)}` : "—";
  const spread = book?.spread != null ? `${book.spread.toFixed(1)} bps` : "—";
  const ok = !!book?.ok;
  return (
    <section className={`card gauge scorecard ${enforced ? "is-enforced" : "is-readonly"}`}>
      <div className="ribbon">{enforced ? "ENFORCED · IN USE" : "READ-ONLY · OBSERVING"}</div>
      <h2 className="scorecard-title">
        {env.toUpperCase()}{" "}
        <span className="title-tags">
          {/* "ML · advisory" now heads GROUP A below; only the card-level
              calibrating state stays pinned to the title. */}
          {calibrating && <span className="tag tag-cal">calibrating</span>}
        </span>
      </h2>
      {available ? (
        <>
          {/* ── GROUP A — the off-chain agent's UNTRUSTED advisory score ── */}
          <div className="sc-group-head sc-group--a">
            <span className="sc-group-sw" />
            <span className="sc-group-lbl">ML · advisory</span>
            <span className="sc-group-rule" />
            <span className="sc-group-sub">off-chain · never trusted</span>
          </div>
          <RiskGauge score={book?.ok === false ? 0 : score} />
          {calibrating && <div className="cal-note">model still warming up — this reading isn't trusted yet</div>}

          {/* ── GROUP B — the contract's OWN on-chain measurement ── */}
          <div className="sc-group-head sc-group--b">
            <span className="sc-group-sw" />
            <span className="sc-group-lbl">on-chain</span>
            <span className="sc-group-rule" />
            <span className="sc-group-sub">{enforced ? "contract-measured · the freeze trigger" : "not deployed"}</span>
          </div>
          {/* On mainnet nothing is deployed, so the contract-measured block below is
              inactive: dimmed + blurred + aria-hidden (no real on-chain measurement to
              report). Only the "not deployed" label above stays crisp. */}
          <div className={enforced ? undefined : "sc-onchain-na"} aria-hidden={enforced ? undefined : true}>
            <div className="info-row" style={{ marginTop: 0 }}>
              <DivMeter divBps={divBps} ok={ok} enforced={enforced} />
              <div className="muted" style={{ fontSize: 12.5, marginTop: 7 }}>
                book mid: {mid} · spread: {spread}
              </div>
            </div>
            <div className="gauge-cap role-note" style={{ marginTop: 14 }}>
              {enforced ? NOTE.enforced : NOTE.readonly}
            </div>
          </div>
        </>
      ) : (
        <div className="muted" style={{ padding: "32px 0", textAlign: "center" }}>
          {env} observatory: connecting…
        </div>
      )}
    </section>
  );
}
